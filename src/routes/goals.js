import { Router } from 'express';
import { BadRequest } from '../context.js';
import { MAX_XP, levelForXp, xpForLevel } from '../../public/js/xp.js';

export function goalsRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

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
    const targetXp = body.targetXp != null ? Number(body.targetXp) : xpForLevel(Number(body.targetLevel));
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

  // Goals reached between two snapshots, for alerts.
  function newlyCompleted(account, previous, latest) {
    if (!previous || !latest) return [];
    const xpOf = (snap, skill) => snap.skills.find((s) => s.name === skill)?.xp ?? 0;
    return db.prepare('SELECT * FROM goals WHERE player = ?').all(account.key)
      .filter((g) => xpOf(previous, g.skill) < g.target_xp && xpOf(latest, g.skill) >= g.target_xp)
      .map((g) => goalView(g, latest));
  }

  r.get('/goals', (req, res) => {
    const { key } = ctx.requireAccount();
    const latest = ctx.latestSnapshot(key);
    const rows = db.prepare('SELECT * FROM goals WHERE player = ? ORDER BY created_at').all(key);
    res.json(rows.map((row) => goalView(row, latest)));
  });

  r.post('/goals', (req, res) => {
    const { key } = ctx.requireAccount();
    const g = parseGoal(req.body);
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO goals (player, skill, target_xp, xp_per_action, xp_per_hour, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(key, g.skill, g.targetXp, g.xpPerAction, g.xpPerHour, g.note, now());
    res.status(201).json(goalView(db.prepare('SELECT * FROM goals WHERE id = ?').get(lastInsertRowid), ctx.latestSnapshot(key)));
  });

  r.put('/goals/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    const g = parseGoal(req.body);
    db.prepare('UPDATE goals SET skill = ?, target_xp = ?, xp_per_action = ?, xp_per_hour = ?, note = ? WHERE id = ? AND player = ?')
      .run(g.skill, g.targetXp, g.xpPerAction, g.xpPerHour, g.note, Number(req.params.id), key);
    res.json({ ok: true });
  });

  r.delete('/goals/:id', (req, res) => {
    db.prepare('DELETE FROM goals WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  return { router: r, newlyCompleted };
}
