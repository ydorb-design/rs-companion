import { Router } from 'express';
import { BadRequest } from '../context.js';
import { NATURE_RUNE_ID } from '../upstream.js';

export function pricesRoutes(ctx) {
  const r = Router();
  const { db, upstream, now } = ctx;

  async function priceRows(items) {
    const latest = await upstream.latestPrices();
    const priceOf = (id) => latest[id]?.high ?? latest[id]?.low ?? null;
    const nature = priceOf(NATURE_RUNE_ID);
    return items.map((item) => {
      const price = priceOf(item.id);
      return {
        id: item.id,
        name: item.name,
        icon: item.icon,
        members: item.members,
        limit: item.limit ?? null,
        highAlch: item.highalch ?? null,
        price,
        // Profit from casting High Level Alchemy on an item bought at the GE price.
        alchProfit: item.highalch != null && price != null && nature != null ? item.highalch - price - nature : null,
      };
    });
  }

  r.get('/prices/search', async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json([]);
    const mapping = await upstream.itemMapping();
    const rank = (name) => (name === q ? 0 : name.startsWith(q) ? 1 : 2);
    const matches = mapping
      .filter((i) => i.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a.name.toLowerCase()) - rank(b.name.toLowerCase()) || a.name.localeCompare(b.name))
      .slice(0, 30);
    res.json(await priceRows(matches));
  });

  r.get('/prices/watchlist', async (req, res) => {
    const ids = db.prepare('SELECT item_id FROM watchlist ORDER BY added_at').all().map((row) => row.item_id);
    if (!ids.length) return res.json([]);
    const byId = new Map((await upstream.itemMapping()).map((i) => [i.id, i]));
    res.json(await priceRows(ids.map((id) => byId.get(id)).filter(Boolean)));
  });

  r.post('/prices/watchlist', (req, res) => {
    const id = Number(req.body.id);
    if (!Number.isInteger(id)) throw new BadRequest('Missing item id.');
    db.prepare('INSERT OR IGNORE INTO watchlist (item_id, added_at) VALUES (?, ?)').run(id, now());
    res.json({ ok: true });
  });

  r.delete('/prices/watchlist/:id', (req, res) => {
    db.prepare('DELETE FROM watchlist WHERE item_id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
}
