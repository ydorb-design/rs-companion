import { Router } from 'express';
import { DAY } from '../context.js';

const PERIODS = { day: DAY, week: 7 * DAY, month: 30 * DAY };

// Hiscore activities that aren't bosses.
const NON_BOSS = new Set([
  'League Points', 'Deadman Points', 'LMS - Rank', 'PvP Arena - Rank', 'Soul Wars Zeal', 'Rifts closed',
  'Colosseum Glory', 'Collections Logged',
]);
export function activityGroup(name) {
  if (name.startsWith('Clue Scrolls')) return 'clues';
  if (NON_BOSS.has(name) || name.startsWith('Bounty Hunter')) return 'other';
  return 'bosses';
}

export function combatLevel(skills) {
  const lvl = (n) => skills.find((s) => s.name === n)?.level ?? 1;
  const base = 0.25 * (lvl('Defence') + lvl('Hitpoints') + Math.floor(lvl('Prayer') / 2));
  const melee = 0.325 * (lvl('Attack') + lvl('Strength'));
  const range = 0.325 * Math.floor(lvl('Ranged') * 1.5);
  const mage = 0.325 * Math.floor(lvl('Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function statsRoutes(ctx, { onRefreshed } = {}) {
  const r = Router();
  const { db, now } = ctx;

  // Pulls hiscores for one account and stores a snapshot. Returns level-ups since the last one.
  async function refreshStats(account = ctx.requireAccount()) {
    const data = await ctx.upstream.hiscores(account.player, account.accountType);
    const last = ctx.latestSnapshot(account.key);
    const changed = !last || JSON.stringify([last.skills, last.activities]) !== JSON.stringify([data.skills, data.activities]);
    // Store a row when anything changed, or daily so charts have a baseline.
    if (changed || now() - last.takenAt > DAY) {
      db.prepare('INSERT INTO snapshots (player, taken_at, data) VALUES (?, ?, ?)').run(account.key, now(), JSON.stringify(data));
    }
    const levelUps = [];
    if (last) {
      for (const s of data.skills) {
        const before = last.skills.find((x) => x.name === s.name);
        if (s.name !== 'Overall' && before && s.level > before.level) levelUps.push({ skill: s.name, from: before.level, to: s.level });
      }
    }
    const result = { latest: ctx.latestSnapshot(account.key), previous: last, levelUps };
    onRefreshed?.(account, result);
    return result;
  }

  function baseline(key, since) {
    const row = db.prepare('SELECT data FROM snapshots WHERE player = ? AND taken_at >= ? ORDER BY taken_at ASC LIMIT 1').get(key, since);
    return row ? JSON.parse(row.data) : null;
  }

  function diff(list, before, field) {
    const map = Object.fromEntries((before || []).map((x) => [x.name, x]));
    return list.map((x) => {
      const b = map[x.name];
      if (field === 'xp') return { name: x.name, gained: x.xp - (b?.xp ?? x.xp), levels: x.level - (b?.level ?? x.level) };
      // An activity that wasn't ranked at the baseline has no known starting count.
      return { name: x.name, gained: b ? x.score - b.score : null };
    });
  }

  r.get('/stats', (req, res) => {
    const account = ctx.activeAccount();
    const latest = account ? ctx.latestSnapshot(account.key) : null;
    const gains = {};
    if (latest) {
      for (const [name, ms] of Object.entries(PERIODS)) {
        const base = baseline(account.key, now() - ms);
        gains[name] = base ? diff(latest.skills, base.skills, 'xp').map((g) => ({ name: g.name, xp: g.gained, levels: g.levels })) : null;
      }
    }
    res.json({ account, latest, gains, combatLevel: latest ? combatLevel(latest.skills) : null });
  });

  r.post('/stats/refresh', async (req, res) => {
    const result = await refreshStats();
    res.json({ ok: true, levelUps: result.levelUps });
  });

  // Snapshot history for one skill or activity.
  r.get('/stats/history', (req, res) => {
    const { key } = ctx.requireAccount();
    const name = String(req.query.skill || req.query.activity || 'Overall');
    const list = req.query.activity ? 'activities' : 'skills';
    const days = Math.min(Number(req.query.days) || 30, 3650);
    const rows = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? AND taken_at >= ? ORDER BY taken_at ASC')
      .all(key, now() - days * DAY);
    const points = rows.map((row) => {
      const x = JSON.parse(row.data)[list]?.find((i) => i.name === name);
      if (!x) return null;
      return list === 'skills' ? { t: row.taken_at, xp: x.xp, level: x.level } : { t: row.taken_at, score: x.score };
    }).filter(Boolean);
    res.json({ name, points });
  });

  // Average XP per day for each skill over a window, used for skill pages and time estimates.
  r.get('/stats/rates', (req, res) => {
    const { key } = ctx.requireAccount();
    const latest = ctx.latestSnapshot(key);
    if (!latest) return res.json({});
    const out = {};
    for (const [name, days] of [['week', 7], ['month', 30]]) {
      const row = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? AND taken_at >= ? ORDER BY taken_at ASC LIMIT 1')
        .get(key, now() - days * DAY);
      if (!row || row.taken_at === latest.takenAt) { out[name] = null; continue; }
      const span = Math.max((latest.takenAt - row.taken_at) / DAY, 1);
      const before = JSON.parse(row.data).skills;
      out[name] = Object.fromEntries(latest.skills.map((s) => {
        const b = before.find((x) => x.name === s.name);
        return [s.name, b ? (s.xp - b.xp) / span : 0];
      }));
    }
    res.json(out);
  });

  // Bossing, clues and minigames.
  r.get('/activities', (req, res) => {
    const { key } = ctx.requireAccount();
    const latest = ctx.latestSnapshot(key);
    if (!latest) return res.json({ latest: null });
    const gains = {};
    for (const [name, ms] of Object.entries(PERIODS)) {
      const base = baseline(key, now() - ms);
      gains[name] = base ? Object.fromEntries(diff(latest.activities, base.activities, 'score').map((g) => [g.name, g.gained])) : null;
    }
    const activities = latest.activities.map((a) => ({ ...a, group: activityGroup(a.name) }));
    res.json({ takenAt: latest.takenAt, activities, gains });
  });

  return { router: r, refreshStats };
}
