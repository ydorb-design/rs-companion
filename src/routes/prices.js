import { Router } from 'express';
import { NATURE_RUNE_ID } from '../upstream.js';

// Item search for the item pickers on Drops, Collection log and Supplies.
export function pricesRoutes(ctx) {
  const r = Router();
  const { upstream } = ctx;

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

  return r;
}
