// Drop log and collection log targets.
import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';

export function dropsRoutes(ctx) {
  const r = Router();
  const { db, now, upstream } = ctx;

  // Looks up an item's name, icon and current price. Falls back to what the browser sent if the wiki is down.
  async function itemInfo(body) {
    const id = body.itemId != null && body.itemId !== '' ? Number(body.itemId) : null;
    let name = String(body.itemName || '').trim().slice(0, 80);
    let icon = body.icon ? String(body.icon).slice(0, 120) : null;
    let price = null;
    if (id != null) {
      try {
        const item = (await upstream.itemMapping()).find((i) => i.id === id);
        if (item) ({ name, icon } = item);
        const latest = await upstream.latestPrices();
        price = latest[id]?.high ?? latest[id]?.low ?? null;
        // Untradeable items have no GE price; their high alch value is still a useful number.
        if (price == null && item?.highalch) price = item.highalch;
      } catch (err) {
        console.warn(`Item lookup: ${err.message}`);
      }
    }
    if (!name) throw new BadRequest('Pick an item.');
    return { id, name, icon, price };
  }

  async function currentPrices() {
    try {
      return await upstream.latestPrices();
    } catch {
      return null;
    }
  }

  // Drops

  r.get('/drops', async (req, res) => {
    const { key } = ctx.requireAccount();
    const rows = db.prepare('SELECT * FROM drops WHERE player = ? ORDER BY at DESC LIMIT 500').all(key);
    const latest = await currentPrices();
    const drops = rows.map((d) => {
      const nowEach = latest && d.item_id != null ? (latest[d.item_id]?.high ?? latest[d.item_id]?.low ?? null) : null;
      return {
        id: d.id, itemId: d.item_id, itemName: d.item_name, icon: d.icon, qty: d.qty, source: d.source, note: d.note, at: d.at,
        valueThen: d.value_each != null ? d.value_each * d.qty : null,
        valueNow: nowEach != null ? nowEach * d.qty : null,
      };
    });
    const sum = (list) => list.reduce((n, d) => n + (d.valueThen || 0), 0);
    const monthAgo = now() - 30 * DAY;
    const biggest = drops.reduce((best, d) => ((d.valueThen || 0) > (best?.valueThen || 0) ? d : best), null);
    const sources = db.prepare("SELECT DISTINCT source FROM drops WHERE player = ? AND source != '' ORDER BY source").all(key).map((x) => x.source);
    res.json({
      drops,
      totals: { count: drops.length, value: sum(drops), month: sum(drops.filter((d) => d.at >= monthAgo)), biggest },
      sources,
    });
  });

  // Shared by the form and by Dink. Returns the new drop's id and whether it ticked off a collection log item.
  function recordDrop(key, { itemId, name, icon, qty, source = '', valueEach = null, note = '' }, { event = true } = {}) {
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO drops (player, item_id, item_name, icon, qty, source, value_each, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(key, itemId ?? null, name, icon ?? null, qty, source, valueEach, note, now());
    if (event) {
      const value = valueEach != null ? valueEach * qty : null;
      ctx.events.add(key, now(), {
        type: 'drop',
        title: `${qty > 1 ? `${qty.toLocaleString('en-AU')} x ` : ''}${name}${source ? ` from ${source}` : ''}`,
        detail: value ? `${value.toLocaleString('en-AU')} gp` : '',
        ref: `drop:${id}`,
      });
    }
    // Logging a drop ticks it off the collection log list.
    const match = itemId != null
      ? db.prepare('SELECT * FROM clog_items WHERE player = ? AND item_id = ? AND obtained_at IS NULL').get(key, itemId)
      : db.prepare('SELECT * FROM clog_items WHERE player = ? AND lower(item_name) = lower(?) AND obtained_at IS NULL').get(key, name);
    if (match) markObtained(key, match);
    return { id, collectionLog: Boolean(match) };
  }

  r.post('/drops', async (req, res) => {
    const { key } = ctx.requireAccount();
    const item = await itemInfo(req.body);
    const qty = Math.round(Number(req.body.qty || 1));
    if (!(qty >= 1 && qty <= 2_147_483_647)) throw new BadRequest('Quantity must be at least 1.');
    const result = recordDrop(key, {
      itemId: item.id, name: item.name, icon: item.icon, qty, valueEach: item.price,
      source: String(req.body.source || '').trim().slice(0, 60), note: String(req.body.note || '').slice(0, 200),
    });
    res.status(201).json(result);
  });

  r.delete('/drops/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM drops WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    ctx.events.removeRef(`drop:${Number(req.params.id)}`);
    res.json({ ok: true });
  });

  // Collection log targets

  function markObtained(key, item) {
    db.prepare('UPDATE clog_items SET obtained_at = ? WHERE id = ?').run(now(), item.id);
    ctx.events.add(key, now(), {
      type: 'clog', title: `New collection log item: ${item.item_name}`, detail: item.source, ref: `clog:${item.id}`,
    });
  }

  // A new collection log slot reported by the game (via Dink). Ticks it off the list, or adds it as obtained.
  function obtainCollectionItem(key, { itemId, name, icon, source = '' }) {
    const existing = itemId != null
      ? db.prepare('SELECT * FROM clog_items WHERE player = ? AND item_id = ?').all(key, itemId)
      : db.prepare('SELECT * FROM clog_items WHERE player = ? AND lower(item_name) = lower(?)').all(key, name);
    const pending = existing.find((i) => !i.obtained_at);
    if (pending) return markObtained(key, pending);
    if (existing.length) return; // already obtained
    const { lastInsertRowid } = db.prepare('INSERT INTO clog_items (player, item_id, item_name, icon, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, itemId ?? null, name, icon ?? null, source, now());
    markObtained(key, db.prepare('SELECT * FROM clog_items WHERE id = ?').get(lastInsertRowid));
  }

  r.get('/collection-log', (req, res) => {
    const { key } = ctx.requireAccount();
    const items = db.prepare('SELECT * FROM clog_items WHERE player = ? ORDER BY source, item_name').all(key).map((i) => ({
      id: i.id, itemId: i.item_id, itemName: i.item_name, icon: i.icon, source: i.source, obtainedAt: i.obtained_at,
    }));
    const latest = ctx.latestSnapshot(key);
    const logged = latest?.activities.find((a) => a.name === 'Collections Logged')?.score ?? null;
    // Dink reports the exact slot count with each new item, which is fresher than the hiscores.
    const live = ctx.getSettings()[`clogCount:${key}`] || null;
    res.json({ items, hiscoresLogged: logged, live });
  });

  r.post('/collection-log', async (req, res) => {
    const { key } = ctx.requireAccount();
    const item = await itemInfo(req.body);
    const source = String(req.body.source || '').trim().slice(0, 60);
    const exists = db.prepare('SELECT id FROM clog_items WHERE player = ? AND lower(item_name) = lower(?) AND lower(source) = lower(?)').get(key, item.name, source);
    if (exists) throw new BadRequest(`${item.name} is already on the list.`);
    db.prepare('INSERT INTO clog_items (player, item_id, item_name, icon, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, item.id, item.name, item.icon, source, now());
    res.status(201).json({ ok: true });
  });

  r.put('/collection-log/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    const item = db.prepare('SELECT * FROM clog_items WHERE id = ? AND player = ?').get(Number(req.params.id), key);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (req.body.obtained && !item.obtained_at) markObtained(key, item);
    if (!req.body.obtained && item.obtained_at) {
      db.prepare('UPDATE clog_items SET obtained_at = NULL WHERE id = ?').run(item.id);
      ctx.events.removeRef(`clog:${item.id}`);
    }
    res.json({ ok: true });
  });

  r.delete('/collection-log/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM clog_items WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    ctx.events.removeRef(`clog:${Number(req.params.id)}`);
    res.json({ ok: true });
  });

  return { router: r, recordDrop, obtainCollectionItem };
}
