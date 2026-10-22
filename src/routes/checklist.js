// Daily and weekly checklist items that reset with the game.
import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';

// Game days reset at 00:00 UTC; game weeks reset on Wednesday at 00:00 UTC.
export function periodStart(freq, now) {
  const today = Math.floor(now / DAY) * DAY;
  if (freq === 'daily') return today;
  const weekday = new Date(today).getUTCDay(); // 0 Sunday … 3 Wednesday
  return today - ((weekday - 3 + 7) % 7) * DAY;
}

export function checklistRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  const view = (row) => {
    const start = periodStart(row.freq, now());
    return {
      id: row.id,
      label: row.label,
      freq: row.freq,
      done: row.last_done_at != null && row.last_done_at >= start,
      resetsAt: row.freq === 'daily' ? start + DAY : start + 7 * DAY,
    };
  };

  r.get('/checklist', (req, res) => {
    const { key } = ctx.requireAccount();
    res.json(db.prepare('SELECT * FROM checklist WHERE player = ? ORDER BY freq, created_at').all(key).map(view));
  });

  r.post('/checklist', (req, res) => {
    const { key } = ctx.requireAccount();
    const label = String(req.body.label || '').trim().slice(0, 80);
    if (!label) throw new BadRequest('Enter what needs doing.');
    if (!['daily', 'weekly'].includes(req.body.freq)) throw new BadRequest('Pick daily or weekly.');
    const { lastInsertRowid } = db.prepare('INSERT INTO checklist (player, label, freq, created_at) VALUES (?, ?, ?, ?)')
      .run(key, label, req.body.freq, now());
    res.status(201).json(view(db.prepare('SELECT * FROM checklist WHERE id = ?').get(lastInsertRowid)));
  });

  r.put('/checklist/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('UPDATE checklist SET last_done_at = ? WHERE id = ? AND player = ?')
      .run(req.body.done ? now() : null, Number(req.params.id), key);
    res.json({ ok: true });
  });

  r.delete('/checklist/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM checklist WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    res.json({ ok: true });
  });

  return r;
}
