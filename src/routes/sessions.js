// Play sessions: a hiscores snapshot at the start and end, with XP, kill counts and drops in between.
// With Dink, sessions start when you log in (using the exact XP Dink sends) and end when you log out.
import { Router } from 'express';
import { BadRequest } from '../context.js';
import { activityGroup } from '../activities.js';
import { MAX_LEVEL, levelForXp } from '../../public/js/xp.js';

const HOUR = 60 * 60 * 1000;
// The hiscores take a moment to catch up after you log out, so the end snapshot waits this long.
export const LOGOUT_DELAY = 3 * 60 * 1000;

// Does a drop source name refer to this hiscores activity? Matches "Barrows" to "Barrows Chests" and so on.
export function sameSource(source, activity) {
  const s = String(source).toLowerCase(), a = String(activity).toLowerCase();
  return a === s || a === `the ${s}` || a === `${s} chests` || s === `the ${a}`;
}

export function sessionsRoutes(ctx, { refreshStats, killCount }) {
  const r = Router();
  const { db, now } = ctx;

  // Refreshes the hiscores, falling back to the last snapshot if they can't be reached.
  async function snapshot(account) {
    let warning = null;
    try {
      await refreshStats(account);
    } catch (err) {
      warning = `Couldn't reach the hiscores (${err.message}), so the last snapshot was used.`;
    }
    const latest = ctx.latestSnapshot(account.key);
    if (!latest) throw new BadRequest("Couldn't get your stats from the hiscores. Try again in a minute.");
    return { latest, warning };
  }

  function summary(row) {
    const start = JSON.parse(row.start_data);
    const endSnap = row.end_data ? JSON.parse(row.end_data) : ctx.latestSnapshot(row.player);
    const until = row.ended_at ?? now();
    const hours = Math.max((until - row.started_at) / HOUR, 1 / 60);

    const startSkills = Object.fromEntries(start.skills.map((s) => [s.name, s]));
    const skills = (endSnap?.skills || [])
      .map((s) => {
        const b = startSkills[s.name];
        const xp = b ? s.xp - b.xp : 0;
        return { name: s.name, xp, levels: b ? s.level - b.level : 0, from: b?.level ?? s.level, to: s.level, perHour: xp / hours };
      })
      .filter((s) => s.xp > 0 && s.name !== 'Overall')
      .sort((a, b) => b.xp - a.xp);
    const overallXp = skills.reduce((n, s) => n + s.xp, 0);

    const startActs = Object.fromEntries(start.activities.map((a) => [a.name, a.score]));
    const activities = (endSnap?.activities || [])
      .map((a) => ({ name: a.name, group: activityGroup(a.name), gained: startActs[a.name] != null ? a.score - startActs[a.name] : null, score: a.score }))
      .filter((a) => a.gained > 0 && activityGroup(a.name) !== 'other')
      .sort((a, b) => b.gained - a.gained);

    const drops = db.prepare('SELECT * FROM drops WHERE player = ? AND at >= ? AND at <= ? ORDER BY at DESC')
      .all(row.player, row.started_at, until)
      .map((d) => ({ id: d.id, itemName: d.item_name, icon: d.icon, qty: d.qty, source: d.source, value: d.value_each != null ? d.value_each * d.qty : null, at: d.at }));
    const lootValue = drops.reduce((n, d) => n + (d.value || 0), 0);
    const events = db.prepare('SELECT COUNT(*) AS n FROM events WHERE player = ? AND at >= ? AND at <= ?').get(row.player, row.started_at, until).n;

    return {
      id: row.id,
      note: row.note,
      auto: Boolean(row.auto),
      // Ended by a logout, waiting for the hiscores to catch up.
      pending: row.ended_at != null && !row.end_data,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      active: row.ended_at == null,
      statsAt: row.ended_at ? row.ended_at : endSnap?.takenAt ?? null,
      hours,
      xp: overallXp,
      xpPerHour: overallXp / hours,
      skills,
      activities,
      drops,
      lootValue,
      lootPerHour: lootValue / hours,
      events,
    };
  }

  const activeRow = (key) => db.prepare('SELECT * FROM sessions WHERE player = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(key);

  // Dink

  // A start snapshot from Dink's login message: exact XP for every skill, kill counts from the last hiscores snapshot.
  function loginSnapshot(key, extra) {
    const base = ctx.latestSnapshot(key) || { skills: [], activities: [] };
    const xp = extra?.skills?.experience;
    if (!xp || typeof xp !== 'object') return { skills: base.skills, activities: base.activities };
    const byName = new Map(base.skills.map((s) => [s.name, { ...s }]));
    for (const [name, value] of Object.entries(xp)) {
      if (!(value >= 0)) continue;
      byName.set(name, { ...(byName.get(name) || { name, rank: null }), xp: value, level: Math.min(MAX_LEVEL, levelForXp(value)) });
    }
    const skills = [...byName.values()].filter((s) => s.name !== 'Overall');
    const overall = {
      name: 'Overall',
      level: skills.reduce((n, s) => n + s.level, 0),
      xp: extra.skills.totalExperience ?? skills.reduce((n, s) => n + s.xp, 0),
      rank: null,
    };
    return { skills: [overall, ...skills], activities: base.activities };
  }

  // Closes a session nobody ended (e.g. the game crashed), at the last thing that happened in it.
  function closeStale(row) {
    const last = db.prepare('SELECT MAX(at) AS at FROM (SELECT at FROM drops WHERE player = ? AND at >= ? UNION ALL SELECT at FROM events WHERE player = ? AND at >= ?)')
      .get(row.player, row.started_at, row.player, row.started_at).at;
    const latest = ctx.latestSnapshot(row.player);
    const { takenAt, ...data } = latest || { skills: [], activities: [] };
    db.prepare('UPDATE sessions SET ended_at = ?, end_data = ? WHERE id = ?').run(Math.max(last ?? row.started_at, row.started_at + 60_000), JSON.stringify(data), row.id);
  }

  function dinkLogin(account, extra) {
    if (!ctx.getSettings().autoSessions) return 'auto sessions off';
    const active = activeRow(account.key);
    if (active && !active.auto) return 'session already running';
    if (active) closeStale(active);
    db.prepare('INSERT INTO sessions (player, started_at, start_data, note, auto) VALUES (?, ?, ?, \'\', 1)')
      .run(account.key, now(), JSON.stringify(loginSnapshot(account.key, extra)));
    return 'session started';
  }

  // Ends the running session now; its end snapshot is taken a few minutes later by finishPending.
  function dinkLogout(account, { schedule = true } = {}) {
    if (!ctx.getSettings().autoSessions) return 'auto sessions off';
    const active = activeRow(account.key);
    if (!active) return 'no session running';
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now(), active.id);
    if (schedule) setTimeout(() => finishPending(account).catch((err) => console.warn(`Session end: ${err.message}`)), LOGOUT_DELAY).unref?.();
    return 'session ended';
  }

  // minAge skips sessions that ended too recently for the hiscores to have caught up.
  async function finishPending(account, { minAge = 0 } = {}) {
    const rows = db.prepare('SELECT * FROM sessions WHERE player = ? AND ended_at IS NOT NULL AND ended_at <= ? AND end_data IS NULL')
      .all(account.key, now() - minAge);
    if (!rows.length) return 0;
    try {
      await refreshStats(account);
    } catch (err) {
      console.warn(`Session end for ${account.player}: ${err.message}`);
    }
    const latest = ctx.latestSnapshot(account.key);
    if (!latest) return 0;
    const { takenAt, ...data } = latest;
    for (const row of rows) db.prepare('UPDATE sessions SET end_data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    return rows.length;
  }

  // Loot by source: GP per kill since you started logging it, and GP per hour from sessions spent only on it.

  function killsAt(key, source, at) {
    const row = db.prepare('SELECT data FROM snapshots WHERE player = ? AND taken_at < ? ORDER BY taken_at DESC LIMIT 1').get(key, at);
    if (!row) return null;
    const found = JSON.parse(row.data).activities.filter((a) => sameSource(source, a.name)).map((a) => a.score);
    return found.length ? Math.max(...found) : null;
  }

  r.get('/loot/sources', (req, res) => {
    const { key } = ctx.requireAccount();
    const rows = db.prepare(`SELECT MIN(source) AS source, COUNT(*) AS drops, SUM(COALESCE(value_each, 0) * qty) AS value, MIN(at) AS first, MAX(at) AS last
      FROM drops WHERE player = ? AND source != '' GROUP BY lower(source) ORDER BY value DESC`).all(key);
    const sessions = db.prepare('SELECT * FROM sessions WHERE player = ? AND ended_at IS NOT NULL ORDER BY started_at').all(key).map(summary);
    res.json(rows.map((s) => {
      const kcNow = killCount(key)(s.source);
      // Kill count just before the first drop was logged. If the first snapshot came later, count from there.
      const before = killsAt(key, s.source, s.first);
      const kills = kcNow != null && before != null ? kcNow - before : null;
      // Sessions where this was the only boss killed.
      const trips = sessions.filter((x) => {
        const bosses = x.activities.filter((a) => a.group === 'bosses');
        return bosses.length === 1 && sameSource(s.source, bosses[0].name);
      });
      const tripHours = trips.reduce((n, x) => n + x.hours, 0);
      const tripLoot = trips.reduce((n, x) => n + x.drops.filter((d) => d.source.toLowerCase() === s.source.toLowerCase()).reduce((m, d) => m + (d.value || 0), 0), 0);
      const tripKills = trips.reduce((n, x) => n + x.activities.find((a) => a.group === 'bosses').gained, 0);
      return {
        source: s.source, drops: s.drops, value: s.value, first: s.first, last: s.last, kc: kcNow,
        kills: kills > 0 ? kills : null,
        perKill: kills > 0 ? s.value / kills : null,
        sessions: trips.length,
        perHour: tripHours > 0 ? tripLoot / tripHours : null,
        killsPerHour: tripHours > 0 ? tripKills / tripHours : null,
      };
    }));
  });

  r.get('/sessions', (req, res) => {
    const { key } = ctx.requireAccount();
    const active = activeRow(key);
    const history = db.prepare('SELECT * FROM sessions WHERE player = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 50').all(key);
    const past = history.map(summary);
    const totals = past.reduce((t, s) => ({ hours: t.hours + s.hours, xp: t.xp + s.xp, loot: t.loot + s.lootValue }), { hours: 0, xp: 0, loot: 0 });
    res.json({ active: active ? summary(active) : null, history: past, totals, auto: Boolean(ctx.getSettings().autoSessions) });
  });

  r.post('/sessions', async (req, res) => {
    const account = ctx.requireAccount();
    if (activeRow(account.key)) throw new BadRequest('A session is already running. End it first.');
    const { latest, warning } = await snapshot(account);
    const { takenAt, ...data } = latest;
    const note = String(req.body?.note || '').trim().slice(0, 120);
    db.prepare('INSERT INTO sessions (player, started_at, start_data, note) VALUES (?, ?, ?, ?)').run(account.key, now(), JSON.stringify(data), note);
    res.status(201).json({ ok: true, warning });
  });

  // Refreshes the hiscores mid-session so the numbers are current.
  r.post('/sessions/:id/update', async (req, res) => {
    const account = ctx.requireAccount();
    const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND player = ? AND ended_at IS NULL').get(Number(req.params.id), account.key);
    if (!row) return res.status(404).json({ error: 'No running session.' });
    const { warning } = await snapshot(account);
    res.json({ ok: true, warning });
  });

  r.post('/sessions/:id/end', async (req, res) => {
    const account = ctx.requireAccount();
    const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND player = ? AND ended_at IS NULL').get(Number(req.params.id), account.key);
    if (!row) return res.status(404).json({ error: 'No running session.' });
    const { latest, warning } = await snapshot(account);
    const { takenAt, ...data } = latest;
    db.prepare('UPDATE sessions SET ended_at = ?, end_data = ? WHERE id = ?').run(now(), JSON.stringify(data), row.id);
    const s = summary(db.prepare('SELECT * FROM sessions WHERE id = ?').get(row.id));
    res.json({ ok: true, warning, session: s });
  });

  r.put('/sessions/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    const note = String(req.body?.note || '').trim().slice(0, 120);
    db.prepare('UPDATE sessions SET note = ? WHERE id = ? AND player = ?').run(note, Number(req.params.id), key);
    res.json({ ok: true });
  });

  r.delete('/sessions/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM sessions WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    res.json({ ok: true });
  });

  return { router: r, dinkLogin, dinkLogout, finishPending };
}
