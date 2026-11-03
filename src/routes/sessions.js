// Play sessions: a hiscores snapshot at the start and end, with XP, kill counts and drops in between.
import { Router } from 'express';
import { BadRequest } from '../context.js';
import { activityGroup } from '../activities.js';

const HOUR = 60 * 60 * 1000;

export function sessionsRoutes(ctx, { refreshStats }) {
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

  r.get('/sessions', (req, res) => {
    const { key } = ctx.requireAccount();
    const active = activeRow(key);
    const history = db.prepare('SELECT * FROM sessions WHERE player = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 50').all(key);
    const past = history.map(summary);
    const totals = past.reduce((t, s) => ({ hours: t.hours + s.hours, xp: t.xp + s.xp, loot: t.loot + s.lootValue }), { hours: 0, xp: 0, loot: 0 });
    res.json({ active: active ? summary(active) : null, history: past, totals });
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

  return r;
}
