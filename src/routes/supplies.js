// Supply stockpile: counts you keep yourself, with targets and low-stock levels.
import { Router } from 'express';
import { BadRequest } from '../context.js';

const count = (v, label, { optional = false } = {}) => {
  if (optional && (v === '' || v == null)) return null;
  const n = Math.round(Number(v));
  if (!(n >= 0 && n <= 2_147_483_647)) throw new BadRequest(`${label} must be 0 or more.`);
  return n;
};

export function suppliesRoutes(ctx) {
  const r = Router();
  const { db, now, upstream } = ctx;

  function view(row, latest) {
    const each = latest && row.item_id != null ? (latest[row.item_id]?.high ?? latest[row.item_id]?.low ?? null) : null;
    return {
      id: row.id, itemId: row.item_id, itemName: row.item_name, icon: row.icon, qty: row.qty,
      target: row.target, lowAt: row.low_at, updatedAt: row.updated_at,
      low: row.low_at != null && row.qty <= row.low_at,
      value: each != null ? each * row.qty : null,
    };
  }

  r.get('/supplies', async (req, res) => {
    const { key } = ctx.requireAccount();
    const rows = db.prepare('SELECT * FROM supplies WHERE player = ? ORDER BY item_name').all(key);
    const latest = rows.length ? await upstream.latestPrices().catch(() => null) : null;
    const items = rows.map((row) => view(row, latest));
    res.json({ items, totalValue: items.reduce((n, i) => n + (i.value || 0), 0) });
  });

  r.post('/supplies', async (req, res) => {
    const { key } = ctx.requireAccount();
    const id = req.body.itemId !== '' && req.body.itemId != null ? Number(req.body.itemId) : null;
    let name = String(req.body.itemName || '').trim().slice(0, 80);
    let icon = req.body.icon ? String(req.body.icon).slice(0, 120) : null;
    if (id != null) {
      const item = (await upstream.itemMapping().catch(() => [])).find((i) => i.id === id);
      if (item) ({ name, icon } = item);
    }
    if (!name) throw new BadRequest('Pick an item.');
    const exists = db.prepare('SELECT id FROM supplies WHERE player = ? AND lower(item_name) = lower(?)').get(key, name);
    if (exists) throw new BadRequest(`${name} is already on your list.`);
    db.prepare('INSERT INTO supplies (player, item_id, item_name, icon, qty, target, low_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(key, id, name, icon, count(req.body.qty || 0, 'Quantity'), count(req.body.target, 'Target', { optional: true }),
        count(req.body.lowAt, 'Low stock level', { optional: true }), now());
    res.status(201).json({ ok: true });
  });

  // Set fields, or adjust the quantity by `add` (negative to use some).
  r.put('/supplies/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    const row = db.prepare('SELECT * FROM supplies WHERE id = ? AND player = ?').get(Number(req.params.id), key);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const b = req.body;
    const qty = b.add != null ? Math.max(0, row.qty + Math.round(Number(b.add) || 0)) : b.qty !== undefined ? count(b.qty, 'Quantity') : row.qty;
    const target = b.target !== undefined ? count(b.target, 'Target', { optional: true }) : row.target;
    const lowAt = b.lowAt !== undefined ? count(b.lowAt, 'Low stock level', { optional: true }) : row.low_at;
    db.prepare('UPDATE supplies SET qty = ?, target = ?, low_at = ?, updated_at = ? WHERE id = ?').run(qty, target, lowAt, now(), row.id);
    res.json({ ok: true });
  });

  r.delete('/supplies/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM supplies WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    res.json({ ok: true });
  });

  return r;
}
