import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ACCOUNT_TYPES, NATURE_RUNE_ID, UpstreamError } from './upstream.js';
import { MAX_XP, levelForXp, xpForLevel } from '../public/js/xp.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const DIARY_REGIONS = [
  'Ardougne', 'Desert', 'Falador', 'Fremennik', 'Kandarin', 'Karamja', 'Kourend & Kebos',
  'Lumbridge & Draynor', 'Morytania', 'Varrock', 'Western Provinces', 'Wilderness',
];
export const DIARY_TIERS = ['Easy', 'Medium', 'Hard', 'Elite'];
const QUEST_STATES = ['not_started', 'in_progress', 'complete'];
const TASK_STATUSES = ['todo', 'doing', 'done'];

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = { day: DAY, week: 7 * DAY, month: 30 * DAY };

const DEFAULT_SETTINGS = { player: '', accountType: 'ironman', refreshHours: 6 };

// OSRS treats spaces, underscores and hyphens in names as the same character.
export const playerKey = (name) => name.trim().toLowerCase().replace(/[_-]/g, ' ');

class BadRequest extends Error {
  status = 400;
}

export function createApp({ db, upstream, now = () => Date.now() }) {
  const app = express();
  app.use(express.json());

  // Settings

  function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  function requirePlayer() {
    const { player, accountType } = getSettings();
    if (!player) throw new BadRequest('Set your player name in Settings first.');
    return { player, key: playerKey(player), accountType };
  }

  app.get('/api/settings', (req, res) => {
    res.json({ ...getSettings(), accountTypes: ACCOUNT_TYPES });
  });

  app.put('/api/settings', (req, res) => {
    const { player, accountType, refreshHours } = req.body;
    const next = {};
    if (player !== undefined) {
      const name = String(player).trim();
      if (name.length > 12) throw new BadRequest('Player names are 12 characters or fewer.');
      next.player = name;
    }
    if (accountType !== undefined) {
      if (!ACCOUNT_TYPES[accountType]) throw new BadRequest('Unknown account type.');
      next.accountType = accountType;
    }
    if (refreshHours !== undefined) {
      const hours = Number(refreshHours);
      if (!(hours >= 0 && hours <= 168)) throw new BadRequest('Refresh interval must be 0 to 168 hours.');
      next.refreshHours = hours;
    }
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(next)) upsert.run(k, JSON.stringify(v));
    app.emit('settings', getSettings());
    res.json(getSettings());
  });

  // Stats

  function latestSnapshot(key) {
    const row = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? ORDER BY taken_at DESC LIMIT 1').get(key);
    return row ? { takenAt: row.taken_at, ...JSON.parse(row.data) } : null;
  }

  async function refreshStats() {
    const { player, key, accountType } = requirePlayer();
    const data = await upstream.hiscores(player, accountType);
    const last = latestSnapshot(key);
    const overall = (d) => d.skills.find((s) => s.name === 'Overall')?.xp;
    // Only store a new row when something changed, or daily so the chart has a baseline.
    if (!last || overall(last) !== overall(data) || now() - last.takenAt > DAY) {
      db.prepare('INSERT INTO snapshots (player, taken_at, data) VALUES (?, ?, ?)').run(key, now(), JSON.stringify(data));
    }
    return latestSnapshot(key);
  }
  app.refreshStats = refreshStats;

  function gainsSince(key, latest, since) {
    const base = db.prepare('SELECT data FROM snapshots WHERE player = ? AND taken_at >= ? ORDER BY taken_at ASC LIMIT 1').get(key, since);
    if (!base) return null;
    const before = Object.fromEntries(JSON.parse(base.data).skills.map((s) => [s.name, s]));
    return latest.skills.map((s) => ({
      name: s.name,
      xp: s.xp - (before[s.name]?.xp ?? s.xp),
      levels: s.level - (before[s.name]?.level ?? s.level),
    }));
  }

  app.get('/api/stats', (req, res) => {
    const { player, key, accountType } = getSettings().player ? requirePlayer() : {};
    const latest = key ? latestSnapshot(key) : null;
    const gains = {};
    if (latest) {
      for (const [name, ms] of Object.entries(PERIODS)) gains[name] = gainsSince(key, latest, now() - ms);
    }
    res.json({ player, accountType, latest, gains });
  });

  app.post('/api/stats/refresh', async (req, res) => {
    await refreshStats();
    res.json({ ok: true });
  });

  app.get('/api/stats/history', (req, res) => {
    const { key } = requirePlayer();
    const skill = String(req.query.skill || 'Overall');
    const days = Math.min(Number(req.query.days) || 30, 3650);
    const rows = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? AND taken_at >= ? ORDER BY taken_at ASC')
      .all(key, now() - days * DAY);
    const points = rows.map((r) => {
      const s = JSON.parse(r.data).skills.find((x) => x.name === skill);
      return s ? { t: r.taken_at, xp: s.xp, level: s.level } : null;
    }).filter(Boolean);
    res.json({ skill, points });
  });

  // Goals

  function goalView(row, latest) {
    const current = latest?.skills.find((s) => s.name === row.skill)?.xp ?? 0;
    const remaining = Math.max(0, row.target_xp - current);
    return {
      id: row.id,
      skill: row.skill,
      targetXp: row.target_xp,
      targetLevel: levelForXp(row.target_xp, { virtual: true }),
      xpPerAction: row.xp_per_action,
      xpPerHour: row.xp_per_hour,
      note: row.note,
      currentXp: current,
      remainingXp: remaining,
      complete: remaining === 0,
      actions: row.xp_per_action ? Math.ceil(remaining / row.xp_per_action) : null,
      hours: row.xp_per_hour ? remaining / row.xp_per_hour : null,
    };
  }

  function parseGoal(body) {
    const skill = String(body.skill || '').trim();
    if (!skill || skill === 'Overall') throw new BadRequest('Pick a skill.');
    let targetXp = body.targetXp != null ? Number(body.targetXp) : xpForLevel(Number(body.targetLevel));
    if (!(targetXp > 0 && targetXp <= MAX_XP)) throw new BadRequest('Target must be between level 2 and 200m XP.');
    const optional = (v) => (v === '' || v == null ? null : Number(v) > 0 ? Number(v) : null);
    return {
      skill,
      targetXp: Math.round(targetXp),
      xpPerAction: optional(body.xpPerAction),
      xpPerHour: optional(body.xpPerHour),
      note: String(body.note || '').slice(0, 200),
    };
  }

  app.get('/api/goals', (req, res) => {
    const { key } = requirePlayer();
    const latest = latestSnapshot(key);
    const rows = db.prepare('SELECT * FROM goals WHERE player = ? ORDER BY created_at').all(key);
    res.json(rows.map((r) => goalView(r, latest)));
  });

  app.post('/api/goals', (req, res) => {
    const { key } = requirePlayer();
    const g = parseGoal(req.body);
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO goals (player, skill, target_xp, xp_per_action, xp_per_hour, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(key, g.skill, g.targetXp, g.xpPerAction, g.xpPerHour, g.note, now());
    res.status(201).json(goalView(db.prepare('SELECT * FROM goals WHERE id = ?').get(lastInsertRowid), latestSnapshot(key)));
  });

  app.put('/api/goals/:id', (req, res) => {
    const { key } = requirePlayer();
    const g = parseGoal(req.body);
    db.prepare('UPDATE goals SET skill = ?, target_xp = ?, xp_per_action = ?, xp_per_hour = ?, note = ? WHERE id = ? AND player = ?')
      .run(g.skill, g.targetXp, g.xpPerAction, g.xpPerHour, g.note, Number(req.params.id), key);
    res.json({ ok: true });
  });

  app.delete('/api/goals/:id', (req, res) => {
    db.prepare('DELETE FROM goals WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Quests and diaries

  async function syncProgress() {
    const { player, key } = requirePlayer();
    const data = await upstream.wikiSync(player);
    db.prepare('INSERT INTO wikisync (player, fetched_at, data) VALUES (?, ?, ?) ON CONFLICT(player) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data')
      .run(key, now(), JSON.stringify(data));
  }
  app.syncProgress = syncProgress;

  app.get('/api/progress', (req, res) => {
    const { key } = requirePlayer();
    const row = db.prepare('SELECT fetched_at, data FROM wikisync WHERE player = ?').get(key);
    const synced = row ? JSON.parse(row.data) : { quests: [], diaries: {} };
    const questOverrides = Object.fromEntries(
      db.prepare('SELECT name, state FROM quest_overrides WHERE player = ?').all(key).map((r) => [r.name, r.state]),
    );
    const diaryOverrides = {};
    for (const r of db.prepare('SELECT region, tier, complete FROM diary_overrides WHERE player = ?').all(key)) {
      diaryOverrides[`${r.region}|${r.tier}`] = Boolean(r.complete);
    }
    const quests = synced.quests.map((q) => ({
      name: q.name,
      state: questOverrides[q.name] ?? q.state,
      synced: q.state,
      manual: q.name in questOverrides,
    })).sort((a, b) => a.name.localeCompare(b.name));
    const diaries = DIARY_REGIONS.map((region) => ({
      region,
      tiers: DIARY_TIERS.map((tier) => {
        const fromSync = synced.diaries?.[region]?.[tier] ?? false;
        const override = diaryOverrides[`${region}|${tier}`];
        return { tier, complete: override ?? fromSync, manual: override !== undefined };
      }),
    }));
    res.json({ fetchedAt: row?.fetched_at ?? null, quests, diaries });
  });

  app.post('/api/progress/sync', async (req, res) => {
    await syncProgress();
    res.json({ ok: true });
  });

  // Setting a state equal to the synced value clears the manual override.
  app.put('/api/progress/quest', (req, res) => {
    const { key } = requirePlayer();
    const { name, state } = req.body;
    if (!QUEST_STATES.includes(state)) throw new BadRequest('Unknown quest state.');
    if (req.body.clear) {
      db.prepare('DELETE FROM quest_overrides WHERE player = ? AND name = ?').run(key, String(name));
    } else {
      db.prepare('INSERT INTO quest_overrides (player, name, state) VALUES (?, ?, ?) ON CONFLICT(player, name) DO UPDATE SET state = excluded.state')
        .run(key, String(name), state);
    }
    res.json({ ok: true });
  });

  app.put('/api/progress/diary', (req, res) => {
    const { key } = requirePlayer();
    const { region, tier, complete } = req.body;
    if (!DIARY_REGIONS.includes(region) || !DIARY_TIERS.includes(tier)) throw new BadRequest('Unknown diary.');
    if (req.body.clear) {
      db.prepare('DELETE FROM diary_overrides WHERE player = ? AND region = ? AND tier = ?').run(key, region, tier);
    } else {
      db.prepare('INSERT INTO diary_overrides (player, region, tier, complete) VALUES (?, ?, ?, ?) ON CONFLICT(player, region, tier) DO UPDATE SET complete = excluded.complete')
        .run(key, region, tier, complete ? 1 : 0);
    }
    res.json({ ok: true });
  });

  // Prices

  async function priceRows(items) {
    const latest = await upstream.latestPrices();
    const priceOf = (id) => latest[id]?.high ?? latest[id]?.low ?? null;
    const nature = priceOf(NATURE_RUNE_ID);
    return items.map((item) => {
      const price = priceOf(item.id);
      return {
        id: item.id,
        name: item.name,
        icon: item.icon,
        members: item.members,
        limit: item.limit ?? null,
        highAlch: item.highalch ?? null,
        price,
        // Profit from casting High Level Alchemy on an item bought at the GE price.
        alchProfit: item.highalch != null && price != null && nature != null ? item.highalch - price - nature : null,
        updatedAt: latest[item.id]?.highTime ?? latest[item.id]?.lowTime ?? null,
      };
    });
  }

  app.get('/api/prices/search', async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json([]);
    const mapping = await upstream.itemMapping();
    const rank = (name) => (name === q ? 0 : name.startsWith(q) ? 1 : 2);
    const matches = mapping
      .filter((i) => i.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name.toLowerCase()) - rank(b.name.toLowerCase()) || a.name.localeCompare(b.name))
      .slice(0, 30);
    res.json(await priceRows(matches));
  });

  app.get('/api/prices/watchlist', async (req, res) => {
    const ids = db.prepare('SELECT item_id FROM watchlist ORDER BY added_at').all().map((r) => r.item_id);
    if (!ids.length) return res.json([]);
    const byId = new Map((await upstream.itemMapping()).map((i) => [i.id, i]));
    res.json(await priceRows(ids.map((id) => byId.get(id)).filter(Boolean)));
  });

  app.post('/api/prices/watchlist', (req, res) => {
    const id = Number(req.body.id);
    if (!Number.isInteger(id)) throw new BadRequest('Missing item id.');
    db.prepare('INSERT OR IGNORE INTO watchlist (item_id, added_at) VALUES (?, ?)').run(id, now());
    res.json({ ok: true });
  });

  app.delete('/api/prices/watchlist/:id', (req, res) => {
    db.prepare('DELETE FROM watchlist WHERE item_id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Tasks

  app.get('/api/tasks', (req, res) => {
    res.json(db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all());
  });

  app.post('/api/tasks', (req, res) => {
    const title = String(req.body.title || '').trim();
    if (!title) throw new BadRequest('Give the task a title.');
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO tasks (title, category, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(title.slice(0, 200), String(req.body.category || '').slice(0, 40), String(req.body.notes || '').slice(0, 2000), 'todo', now(), now());
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid));
  });

  app.put('/api/tasks/:id', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const next = { ...task, ...req.body };
    if (!TASK_STATUSES.includes(next.status)) throw new BadRequest('Unknown status.');
    if (!String(next.title).trim()) throw new BadRequest('Give the task a title.');
    db.prepare('UPDATE tasks SET title = ?, category = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(String(next.title).trim().slice(0, 200), String(next.category).slice(0, 40), String(next.notes).slice(0, 2000), next.status, now(), task.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(express.static(PUBLIC_DIR));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof UpstreamError || err instanceof BadRequest ? err.status : err.status || 500;
    if (err instanceof UpstreamError) console.warn(err.message);
    else if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Check the container logs.' : err.message });
  });

  app.getSettings = getSettings;
  return app;
}
