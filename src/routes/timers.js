import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';

const MIN = 60 * 1000;

// Growth times are approximate: farming advances on game ticks every 5 to 10 minutes.
export const TIMER_PRESETS = [
  { id: 'herbs', label: 'Herb run', minutes: 80 },
  { id: 'birdhouses', label: 'Birdhouses', minutes: 50 },
  { id: 'seaweed', label: 'Seaweed', minutes: 40 },
  { id: 'yew', label: 'Yew tree', minutes: 400 },
  { id: 'magic', label: 'Magic tree', minutes: 480 },
  { id: 'fruit', label: 'Fruit trees', minutes: 960 },
  { id: 'calquat', label: 'Calquat', minutes: 1280 },
  { id: 'daily', label: 'Daily reset', daily: true },
];

// Game days reset at 00:00 UTC.
export function nextDailyReset(now) {
  return Math.floor(now / DAY) * DAY + DAY;
}

export function timersRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  function view(row) {
    return {
      id: row.id,
      label: row.label,
      preset: row.preset,
      durationMs: row.duration_ms,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      done: row.ends_at <= now(),
    };
  }

  function endsAt(preset, durationMs) {
    return preset === 'daily' ? nextDailyReset(now()) : now() + durationMs;
  }

  r.get('/timers', (req, res) => {
    const { key } = ctx.requireAccount();
    const rows = db.prepare('SELECT * FROM timers WHERE player = ? ORDER BY ends_at').all(key);
    res.json({ presets: TIMER_PRESETS, timers: rows.map(view), now: now() });
  });

  r.post('/timers', (req, res) => {
    const { key } = ctx.requireAccount();
    const preset = TIMER_PRESETS.find((p) => p.id === req.body.preset);
    let label, durationMs;
    if (preset) {
      label = String(req.body.label || preset.label).trim().slice(0, 60);
      durationMs = preset.daily ? DAY : preset.minutes * MIN;
    } else {
      label = String(req.body.label || '').trim().slice(0, 60);
      durationMs = Math.round(Number(req.body.minutes) * MIN);
      if (!label) throw new BadRequest('Give the timer a name.');
      if (!(durationMs >= MIN && durationMs <= 14 * DAY)) throw new BadRequest('Timers can be 1 minute to 14 days.');
    }
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO timers (player, label, preset, duration_ms, started_at, ends_at, notified) VALUES (?, ?, ?, ?, ?, ?, 0)',
    ).run(key, label, preset?.id ?? null, durationMs, now(), endsAt(preset?.id, durationMs));
    res.status(201).json(view(db.prepare('SELECT * FROM timers WHERE id = ?').get(lastInsertRowid)));
  });

  // Starts the same timer again from now.
  r.post('/timers/:id/restart', (req, res) => {
    const { key } = ctx.requireAccount();
    const row = db.prepare('SELECT * FROM timers WHERE id = ? AND player = ?').get(Number(req.params.id), key);
    if (!row) return res.status(404).json({ error: 'Timer not found.' });
    db.prepare('UPDATE timers SET started_at = ?, ends_at = ?, notified = 0 WHERE id = ?')
      .run(now(), endsAt(row.preset, row.duration_ms), row.id);
    res.json(view(db.prepare('SELECT * FROM timers WHERE id = ?').get(row.id)));
  });

  r.delete('/timers/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM timers WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    res.json({ ok: true });
  });

  // Called by the scheduler. Marks finished timers and returns them for alerts.
  function collectDue() {
    const due = db.prepare('SELECT * FROM timers WHERE notified = 0 AND ends_at <= ?').all(now());
    const mark = db.prepare('UPDATE timers SET notified = 1 WHERE id = ?');
    for (const t of due) mark.run(t.id);
    return due;
  }

  return { router: r, collectDue };
}
