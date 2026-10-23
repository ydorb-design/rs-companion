import { Router } from 'express';
import { BadRequest } from '../context.js';

export const SLAYER_MASTERS = [
  'Turael', 'Spria', 'Mazchna', 'Vannaka', 'Chaeldar', 'Konar quo Maten', 'Nieve', 'Steve', 'Duradel', 'Krystilia',
];

export function slayerRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  const current = (key) => db.prepare("SELECT * FROM slayer_tasks WHERE player = ? AND outcome = 'active' ORDER BY id DESC LIMIT 1").get(key);
  const pointsKey = (key) => `slayerPoints:${key}`;

  function view(t) {
    return t ? {
      id: t.id, monster: t.monster, amount: t.amount, kills: t.kills, master: t.master,
      assignedAt: t.assigned_at, endedAt: t.ended_at, outcome: t.outcome, points: t.points,
    } : null;
  }

  r.get('/slayer', (req, res) => {
    const { key } = ctx.requireAccount();
    const history = db.prepare("SELECT * FROM slayer_tasks WHERE player = ? AND outcome != 'active' ORDER BY ended_at DESC, id DESC LIMIT 200").all(key);
    const counts = db.prepare("SELECT outcome, COUNT(*) AS n FROM slayer_tasks WHERE player = ? GROUP BY outcome").all(key);
    const top = db.prepare("SELECT monster, COUNT(*) AS n FROM slayer_tasks WHERE player = ? GROUP BY lower(monster) ORDER BY n DESC LIMIT 1").get(key);
    const monsters = db.prepare('SELECT DISTINCT monster FROM slayer_tasks WHERE player = ? ORDER BY monster').all(key).map((x) => x.monster);
    const stat = Object.fromEntries(counts.map((c) => [c.outcome, c.n]));
    res.json({
      current: view(current(key)),
      history: history.map(view),
      points: ctx.getSettings()[pointsKey(key)] ?? null,
      gameTasks: ctx.getSettings()[`slayerGameTasks:${key}`] ?? null,
      completed: stat.complete || 0,
      skipped: stat.skip || 0,
      topMonster: top ? { monster: top.monster, count: top.n } : null,
      monsters,
      masters: SLAYER_MASTERS,
    });
  });

  // New task. Any task still active is marked skipped first.
  r.post('/slayer/task', (req, res) => {
    const { key } = ctx.requireAccount();
    const monster = String(req.body.monster || '').trim().slice(0, 60);
    const amount = Math.round(Number(req.body.amount));
    if (!monster) throw new BadRequest('Enter the monster.');
    if (!(amount >= 1 && amount <= 1000)) throw new BadRequest('Amount must be 1 to 1000.');
    const active = current(key);
    if (active) db.prepare("UPDATE slayer_tasks SET outcome = 'skip', ended_at = ? WHERE id = ?").run(now(), active.id);
    db.prepare('INSERT INTO slayer_tasks (player, monster, amount, master, assigned_at) VALUES (?, ?, ?, ?, ?)')
      .run(key, monster, amount, String(req.body.master || '').slice(0, 40), now());
    res.status(201).json(view(current(key)));
  });

  // Update kills on the active task, either by a step (+1, -1) or to an exact number.
  r.put('/slayer/task', (req, res) => {
    const { key } = ctx.requireAccount();
    const t = current(key);
    if (!t) throw new BadRequest('No active task.');
    const kills = req.body.kills != null ? Number(req.body.kills) : t.kills + Number(req.body.add || 0);
    if (!Number.isFinite(kills)) throw new BadRequest('Invalid kill count.');
    db.prepare('UPDATE slayer_tasks SET kills = ? WHERE id = ?').run(Math.max(0, Math.min(t.amount, Math.round(kills))), t.id);
    res.json(view(current(key)));
  });

  // Ends the active task as complete or skipped, adding any points earned.
  r.post('/slayer/task/end', (req, res) => {
    const { key } = ctx.requireAccount();
    const t = current(key);
    if (!t) throw new BadRequest('No active task.');
    const outcome = req.body.outcome === 'skip' ? 'skip' : 'complete';
    const points = req.body.points === '' || req.body.points == null ? null : Math.round(Number(req.body.points));
    if (points != null && !(points >= 0 && points <= 10000)) throw new BadRequest('Points must be 0 to 10,000.');
    db.prepare('UPDATE slayer_tasks SET outcome = ?, ended_at = ?, points = ?, kills = ? WHERE id = ?')
      .run(outcome, now(), points, outcome === 'complete' ? t.amount : t.kills, t.id);
    if (points) {
      const total = (ctx.getSettings()[pointsKey(key)] || 0) + points;
      ctx.saveSettings({ [pointsKey(key)]: total });
    }
    if (outcome === 'complete') {
      ctx.events.add(key, now(), {
        type: 'slayer', title: `Slayer task complete: ${t.amount} ${t.monster}`,
        detail: [t.master, points ? `+${points} points` : ''].filter(Boolean).join(' · '), ref: `slayer:${t.id}`,
      });
    }
    res.json({ ok: true });
  });

  r.put('/slayer/points', (req, res) => {
    const { key } = ctx.requireAccount();
    const points = Math.round(Number(req.body.points));
    if (!(points >= 0 && points <= 100000)) throw new BadRequest('Points must be 0 to 100,000.');
    ctx.saveSettings({ [pointsKey(key)]: points });
    res.json({ ok: true });
  });

  r.delete('/slayer/task/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM slayer_tasks WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    ctx.events.removeRef(`slayer:${Number(req.params.id)}`);
    res.json({ ok: true });
  });

  return r;
}
