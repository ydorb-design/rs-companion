import { Router } from 'express';
import { BadRequest } from '../context.js';
import { TASK_TEMPLATES } from '../templates.js';

const TASK_STATUSES = ['todo', 'doing', 'done'];

export function tasksRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  const insert = db.prepare('INSERT INTO tasks (title, category, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');

  r.get('/tasks', (req, res) => {
    res.json(db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all());
  });

  r.get('/tasks/templates', (req, res) => {
    const existing = new Set(db.prepare('SELECT title FROM tasks').all().map((t) => t.title.toLowerCase()));
    res.json(TASK_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.tasks.length,
      remaining: t.tasks.filter((x) => !existing.has(x.title.toLowerCase())).length,
    })));
  });

  // Adds every task in a template that isn't already on the board.
  r.post('/tasks/templates/:id', (req, res) => {
    const template = TASK_TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) throw new BadRequest('Unknown template.');
    const existing = new Set(db.prepare('SELECT title FROM tasks').all().map((t) => t.title.toLowerCase()));
    let added = 0;
    for (const t of template.tasks) {
      if (existing.has(t.title.toLowerCase())) continue;
      insert.run(t.title, template.category, t.notes || '', 'todo', now(), now());
      added++;
    }
    res.json({ added });
  });

  r.post('/tasks', (req, res) => {
    const title = String(req.body.title || '').trim();
    if (!title) throw new BadRequest('Give the task a title.');
    const { lastInsertRowid } = insert.run(
      title.slice(0, 200), String(req.body.category || '').slice(0, 40), String(req.body.notes || '').slice(0, 2000), 'todo', now(), now(),
    );
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid));
  });

  r.put('/tasks/:id', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const next = { ...task, ...req.body };
    if (!TASK_STATUSES.includes(next.status)) throw new BadRequest('Unknown status.');
    if (!String(next.title).trim()) throw new BadRequest('Give the task a title.');
    db.prepare('UPDATE tasks SET title = ?, category = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(String(next.title).trim().slice(0, 200), String(next.category).slice(0, 40), String(next.notes).slice(0, 2000), next.status, now(), task.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id));
  });

  r.delete('/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
}
