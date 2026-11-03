// Receives notifications from the Dink RuneLite plugin, so drops, collection log slots,
// Slayer tasks, kill counts, quests and diaries arrive as you play.
// Format: https://github.com/pajlads/DinkPlugin/blob/master/docs/json-examples.md
import crypto from 'node:crypto';
import express, { Router } from 'express';
import Busboy from 'busboy';
import { playerKey } from '../context.js';
import { milestoneCrossed } from '../events.js';

const capitalise = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const toInt = (v) => {
  const n = parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// ISO-8601 durations like PT1H2M3.4S, as Dink sends boss times.
export function parseDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(String(iso || ''));
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(seconds % 1 ? 1 : 0).padStart(seconds % 1 ? 4 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Dink sends JSON, or multipart with the JSON in a `payload_json` field when a screenshot is attached.
function readMultipart(req) {
  return new Promise((resolve, reject) => {
    let payload = null;
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, fields: 10 } });
    bb.on('field', (name, value) => { if (name === 'payload_json') payload = value; });
    bb.on('file', (name, stream) => stream.resume()); // screenshots aren't kept
    bb.on('error', reject);
    bb.on('close', () => {
      try {
        resolve(payload ? JSON.parse(payload) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.pipe(bb);
  });
}

export function dinkRoutes(ctx, { drops, sessions }) {
  const { db, now } = ctx;
  const jsonParser = express.json({ limit: '2mb' });

  function token() {
    let { dinkToken } = ctx.getSettings();
    if (!dinkToken) ctx.saveSettings({ dinkToken: (dinkToken = crypto.randomBytes(18).toString('base64url')) });
    return dinkToken;
  }

  function log(player, type, outcome) {
    db.prepare('INSERT INTO dink_log (at, player, type, outcome) VALUES (?, ?, ?, ?)').run(now(), player || '', type || '', outcome);
    db.prepare('DELETE FROM dink_log WHERE id NOT IN (SELECT id FROM dink_log ORDER BY id DESC LIMIT 50)').run();
  }

  async function iconFor(itemId) {
    if (itemId == null) return null;
    try {
      return (await ctx.upstream.itemMapping()).find((i) => i.id === itemId)?.icon ?? null;
    } catch {
      return null;
    }
  }

  // Updates the stored WikiSync data so quests and diaries show as done before the next sync.
  function patchSync(key, update) {
    const row = db.prepare('SELECT data FROM wikisync WHERE player = ?').get(key);
    if (!row) return false;
    const data = JSON.parse(row.data);
    update(data);
    db.prepare('UPDATE wikisync SET data = ? WHERE player = ?').run(JSON.stringify(data), key);
    return true;
  }

  function bossRecord(key, boss, { count, pbSeconds }) {
    const row = db.prepare('SELECT * FROM boss_records WHERE player = ? AND boss = ?').get(key, boss);
    const pb = pbSeconds != null && (row?.pb_seconds == null || pbSeconds < row.pb_seconds) ? pbSeconds : row?.pb_seconds ?? null;
    db.prepare(`INSERT INTO boss_records (player, boss, count, pb_seconds, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player, boss) DO UPDATE SET count = excluded.count, pb_seconds = excluded.pb_seconds, updated_at = excluded.updated_at`)
      .run(key, boss, count ?? row?.count ?? null, pb, now());
  }

  const handlers = {
    // Login carries totals that the app otherwise only learns bit by bit.
    LOGIN(key, x, account) {
      const save = {};
      if (x.slayer?.points != null) save[`slayerPoints:${key}`] = x.slayer.points;
      if (x.questPoints?.completed != null) save[`questPoints:${key}`] = x.questPoints.completed;
      if (x.collectionLog?.completed != null) save[`clogCount:${key}`] = { completed: x.collectionLog.completed, total: x.collectionLog.total ?? null, at: now() };
      if (x.combatAchievementPoints?.completed != null) {
        save[`caPoints:${key}`] = { total: x.combatAchievementPoints.completed, possible: x.combatAchievementPoints.total ?? null, at: now() };
      }
      if (Array.isArray(x.pets)) save[`pets:${key}`] = x.pets.map((p) => String(p?.name || '')).filter(Boolean).slice(0, 200);
      ctx.saveSettings(save);
      return sessions.dinkLogin(account, x);
    },

    LOGOUT(key, x, account) {
      return sessions.dinkLogout(account);
    },

    async LOOT(key, x) {
      const items = (x.items || []).filter((i) => i && i.name && i.quantity > 0);
      if (!items.length) return 'no items';
      const source = String(x.source || '').slice(0, 60);
      for (const i of items) {
        drops.recordDrop(key, {
          itemId: i.id ?? null, name: String(i.name).slice(0, 80), icon: await iconFor(i.id), qty: i.quantity,
          valueEach: i.priceEach ?? null, source, note: 'From Dink',
        }, { event: false });
      }
      const total = items.reduce((n, i) => n + (i.priceEach || 0) * i.quantity, 0);
      const first = items[0];
      ctx.events.add(key, now(), {
        type: 'drop',
        title: items.length === 1
          ? `${first.quantity > 1 ? `${first.quantity.toLocaleString('en-AU')} x ` : ''}${first.name}${source ? ` from ${source}` : ''}`
          : `${items.length} items${source ? ` from ${source}` : ''}`,
        detail: total ? `${total.toLocaleString('en-AU')} gp` : '',
      });
      if (x.killCount && source) bossRecord(key, source, { count: x.killCount });
      return `${items.length} item${items.length > 1 ? 's' : ''} logged`;
    },

    async COLLECTION(key, x) {
      if (!x.itemName) return 'no item';
      drops.obtainCollectionItem(key, {
        itemId: x.itemId ?? null, name: String(x.itemName).slice(0, 80), icon: await iconFor(x.itemId), source: String(x.dropperName || '').slice(0, 60),
      });
      if (x.completedEntries != null) {
        ctx.saveSettings({ [`clogCount:${key}`]: { completed: x.completedEntries, total: x.totalEntries ?? null, at: now() } });
      }
      return `collection log: ${x.itemName}`;
    },

    LEVEL(key, x) {
      let n = 0;
      for (const [skill, level] of Object.entries(x.levelledSkills || {})) {
        if (!(level >= 2 && level <= 99)) continue; // 127 means 200m XP; virtual levels are skipped
        const added = ctx.events.add(key, now(), { type: 'level', title: level === 99 ? `99 ${skill}` : `${skill} level ${level}` }, { dedupeDays: 7 });
        if (added) n++;
      }
      return `${n} level event${n === 1 ? '' : 's'}`;
    },

    KILL_COUNT(key, x) {
      if (!x.boss || !(x.count >= 0)) return 'no boss';
      const time = x.time ? parseDuration(x.time) : null;
      const pbSeconds = x.isPersonalBest && time != null ? time : x.personalBest ? parseDuration(x.personalBest) : null;
      bossRecord(key, x.boss, { count: x.count, pbSeconds });
      const m = milestoneCrossed(x.count - 1, x.count);
      if (m) ctx.events.add(key, now(), { type: 'kc', title: `${x.boss}: ${m} kills` }, { dedupeDays: 30 });
      if (x.isPersonalBest && time != null) {
        ctx.events.add(key, now(), { type: 'pb', title: `New personal best: ${x.boss}`, detail: formatDuration(time) });
      }
      return `${x.boss} ${x.count}`;
    },

    SLAYER(key, x) {
      const parsed = /^(\d[\d,]*)\s+(.+)$/.exec(String(x.slayerTask || '').trim());
      const monster = String(x.monster || parsed?.[2] || x.slayerTask || 'Slayer task').slice(0, 60);
      const amount = toInt(parsed?.[1]) || x.killCount || 1;
      const points = toInt(x.slayerPoints);
      const active = db.prepare("SELECT * FROM slayer_tasks WHERE player = ? AND outcome = 'active' ORDER BY id DESC LIMIT 1").get(key);
      let id;
      if (active) {
        db.prepare("UPDATE slayer_tasks SET outcome = 'complete', ended_at = ?, points = ?, kills = amount WHERE id = ?").run(now(), points, active.id);
        id = active.id;
      } else {
        ({ lastInsertRowid: id } = db.prepare("INSERT INTO slayer_tasks (player, monster, amount, kills, master, assigned_at, ended_at, outcome, points) VALUES (?, ?, ?, ?, '', ?, ?, 'complete', ?)")
          .run(key, monster, amount, amount, now(), now(), points));
      }
      const settings = ctx.getSettings();
      // Only add to a points total you've set, as Dink reports points earned, not your balance.
      if (points && settings[`slayerPoints:${key}`] != null) ctx.saveSettings({ [`slayerPoints:${key}`]: settings[`slayerPoints:${key}`] + points });
      const done = toInt(x.slayerCompleted);
      if (done != null) ctx.saveSettings({ [`slayerGameTasks:${key}`]: done });
      const t = active || { amount, monster };
      ctx.events.add(key, now(), {
        type: 'slayer', title: `Slayer task complete: ${t.amount} ${t.monster}`,
        detail: points ? `+${points} points` : '', ref: `slayer:${id}`,
      });
      return `task complete: ${t.monster}`;
    },

    QUEST(key, x) {
      if (!x.questName) return 'no quest';
      patchSync(key, (d) => {
        const q = (d.quests || []).find((i) => i.name.toLowerCase() === String(x.questName).toLowerCase());
        if (q) q.state = 'complete';
      });
      if (x.questPoints != null) ctx.saveSettings({ [`questPoints:${key}`]: x.questPoints });
      ctx.events.add(key, now(), { type: 'quest', title: `Quest complete: ${x.questName}` }, { dedupeDays: 30 });
      return `quest: ${x.questName}`;
    },

    ACHIEVEMENT_DIARY(key, x) {
      if (!x.area || !x.difficulty) return 'no diary';
      const tier = capitalise(x.difficulty);
      const synced = patchSync(key, (d) => {
        d.diaries = d.diaries || {};
        d.diaries[x.area] = { ...(d.diaries[x.area] || {}), [tier]: true };
      });
      if (!synced) {
        db.prepare('INSERT INTO diary_overrides (player, region, tier, complete) VALUES (?, ?, ?, 1) ON CONFLICT(player, region, tier) DO UPDATE SET complete = 1')
          .run(key, x.area, tier);
      }
      ctx.events.add(key, now(), { type: 'diary', title: `${x.area} ${tier} diary complete` }, { dedupeDays: 30 });
      return `diary: ${x.area} ${tier}`;
    },

    COMBAT_ACHIEVEMENT(key, x) {
      if (!x.task) return 'no task';
      ctx.saveSettings({ [`caPoints:${key}`]: { total: x.totalPoints ?? null, possible: x.totalPossiblePoints ?? null, at: now() } });
      if (x.justCompletedTier) ctx.saveSettings({ [`caTier:${key}`]: capitalise(x.justCompletedTier) });
      ctx.events.add(key, now(), {
        type: 'ca', title: `Combat task: ${x.task}`,
        detail: [capitalise(x.tier), x.taskPoints ? `${x.taskPoints} points` : ''].filter(Boolean).join(' · '),
      });
      if (x.justCompletedTier) ctx.events.add(key, now(), { type: 'ca', title: `${capitalise(x.justCompletedTier)} combat achievements complete` });
      return `combat task: ${x.task}`;
    },

    CLUE(key, x) {
      const total = (x.items || []).reduce((n, i) => n + (i.priceEach || 0) * (i.quantity || 0), 0);
      ctx.events.add(key, now(), {
        type: 'clue', title: `${capitalise(x.clueType)} clue${x.numberCompleted ? ` #${x.numberCompleted}` : ''}`,
        detail: total ? `${total.toLocaleString('en-AU')} gp` : '',
      });
      return `clue: ${x.clueType}`;
    },

    PET(key, x) {
      ctx.events.add(key, now(), {
        type: 'pet', title: x.duplicate ? `Duplicate pet${x.petName ? `: ${x.petName}` : ''}` : `New pet${x.petName ? `: ${x.petName}` : ''}`,
        detail: x.milestone || '',
      });
      return 'pet';
    },

    DEATH(key, x) {
      const title = x.isPvp && x.killerName ? `Killed by ${x.killerName}` : x.killerName ? `Died to ${x.killerName}` : 'Died';
      ctx.events.add(key, now(), { type: 'death', title, detail: x.valueLost ? `${Number(x.valueLost).toLocaleString('en-AU')} gp lost` : '' });
      return 'death';
    },
  };

  // Public endpoint (Dink can't sign in), protected by the secret token in the URL.
  async function receive(req, res) {
    const want = Buffer.from(token());
    const got = Buffer.from(String(req.params.token || ''));
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.status(404).json({ error: 'Not found.' });

    let payload;
    try {
      if (req.is('multipart/form-data')) payload = await readMultipart(req);
      else {
        await new Promise((resolve, reject) => jsonParser(req, res, (err) => (err ? reject(err) : resolve())));
        payload = req.body;
      }
    } catch {
      log('', '', 'unreadable message');
      return res.status(400).json({ error: 'Unreadable message.' });
    }
    const type = payload?.type;
    const name = String(payload?.playerName || '');
    const account = ctx.allAccounts().find((a) => a.key === playerKey(name));
    if (!account) {
      log(name, type, 'ignored: player not added in Settings');
      return res.status(202).json({ ok: true, ignored: 'unknown player' });
    }
    const handler = handlers[type];
    if (!handler) {
      log(name, type, 'ignored: not used by the app');
      return res.status(202).json({ ok: true, ignored: 'type' });
    }
    try {
      log(name, type, await handler(account.key, payload.extra || {}, account));
    } catch (err) {
      console.warn(`Dink ${type}: ${err.message}`);
      log(name, type, `error: ${err.message}`);
    }
    res.status(204).end();
  }

  // Settings endpoints (behind login).
  const router = Router();
  router.get('/dink-config', (req, res) => {
    const recent = db.prepare('SELECT at, player, type, outcome FROM dink_log ORDER BY id DESC LIMIT 15').all();
    res.json({ path: `/api/dink/${token()}`, recent });
  });
  router.post('/dink-config/token', (req, res) => {
    ctx.saveSettings({ dinkToken: crypto.randomBytes(18).toString('base64url') });
    res.json({ path: `/api/dink/${token()}` });
  });

  return { receive, router };
}
