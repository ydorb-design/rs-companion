// Drop log and collection log targets.
import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';
import { dryness, parseDropRates, parseRarity } from '../droprates.js';

const DROP_TABLE_MAX_AGE = 30 * DAY;
const RETRY_AFTER = 60 * 60 * 1000;
// Drops at 1 in 100 or rarer count as rare for the odds list.
const RARE_RATE = 1 / 100;

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

  // Drop rates from each source's wiki page, cached for 30 days. Returns lower-case source -> { item: rate } or null.
  const failed = new Map();
  async function dropTables(sources) {
    const cached = () => new Map(db.prepare('SELECT source, data, fetched_at FROM drop_tables').all().map((t) => [t.source, t]));
    let rows = cached();
    const todo = [...new Set(sources.filter(Boolean))].filter((s) => {
      const row = rows.get(s.toLowerCase());
      return (!row || now() - row.fetched_at > DROP_TABLE_MAX_AGE) && !(now() - (failed.get(s.toLowerCase()) ?? -Infinity) < RETRY_AFTER);
    });
    if (todo.length) {
      try {
        const pages = await upstream.wikiPages(todo);
        const save = db.prepare('INSERT INTO drop_tables (source, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at');
        for (const s of todo) save.run(s.toLowerCase(), pages[s] ? JSON.stringify(parseDropRates(pages[s])) : null, now());
        rows = cached();
      } catch (err) {
        // Best-effort: show what's cached, and try again later.
        for (const s of todo) failed.set(s.toLowerCase(), now());
        console.warn(`Drop rates: ${err.message}`);
      }
    }
    return new Map([...rows].map(([s, row]) => [s, row.data ? JSON.parse(row.data) : null]));
  }

  // Kill count for a collection log source, from the hiscores or Dink, trying a few common name forms.
  function killCounts(key) {
    const kc = {};
    for (const a of ctx.latestSnapshot(key)?.activities || []) kc[a.name.toLowerCase()] = a.score;
    for (const b of db.prepare('SELECT boss, count FROM boss_records WHERE player = ?').all(key)) {
      if (b.count != null && b.count > (kc[b.boss.toLowerCase()] ?? -1)) kc[b.boss.toLowerCase()] = b.count;
    }
    return (source) => {
      const s = source.toLowerCase();
      const found = [s, `the ${s}`, `${s} chests`].map((n) => kc[n]).filter((n) => n != null);
      return found.length ? Math.max(...found) : null;
    };
  }

  r.get('/collection-log', async (req, res) => {
    const { key } = ctx.requireAccount();
    const rows = db.prepare('SELECT * FROM clog_items WHERE player = ? ORDER BY source, item_name').all(key);
    const tables = await dropTables(rows.filter((i) => !i.obtained_at).map((i) => i.source));
    const kcFor = killCounts(key);
    const items = rows.map((i) => {
      const wikiRate = tables.get(i.source.toLowerCase())?.[i.item_name.toLowerCase()] ?? null;
      const rate = i.rate_override ?? wikiRate;
      const tracked = i.source ? kcFor(i.source) : null;
      const kc = i.kc_override ?? tracked;
      return {
        id: i.id, itemId: i.item_id, itemName: i.item_name, icon: i.icon, source: i.source, obtainedAt: i.obtained_at,
        rate, rateFrom: i.rate_override != null ? 'manual' : wikiRate != null ? 'wiki' : null,
        kc, kcFrom: i.kc_override != null ? 'manual' : tracked != null ? 'tracked' : null,
        dry: i.obtained_at ? null : dryness(kc, rate),
      };
    });
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
    // Your own drop rate and kill count, for sources the wiki or hiscores don't cover. Blank clears them.
    if ('rate' in req.body) {
      const rate = req.body.rate === '' || req.body.rate == null ? null : parseRarity(req.body.rate);
      if (rate == null && req.body.rate) throw new BadRequest('Enter a drop rate like 1/512.');
      db.prepare('UPDATE clog_items SET rate_override = ? WHERE id = ?').run(rate, item.id);
    }
    if ('kc' in req.body) {
      const kc = req.body.kc === '' || req.body.kc == null ? null : Number(req.body.kc);
      if (kc != null && !(Number.isInteger(kc) && kc >= 0 && kc <= 1e7)) throw new BadRequest('Kill count must be a whole number.');
      db.prepare('UPDATE clog_items SET kc_override = ? WHERE id = ?').run(kc, item.id);
    }
    if (!('obtained' in req.body)) return res.json({ ok: true });
    if (req.body.obtained && !item.obtained_at) markObtained(key, item);
    if (!req.body.obtained && item.obtained_at) {
      db.prepare('UPDATE clog_items SET obtained_at = NULL WHERE id = ?').run(item.id);
      ctx.events.removeRef(`clog:${item.id}`);
    }
    res.json({ ok: true });
  });

  // Odds of having had each rare drop (and pet) by now, from the wiki drop table and your kill count.
  r.get('/bosses/:name/odds', async (req, res) => {
    const { key } = ctx.requireAccount();
    const name = String(req.params.name).trim().slice(0, 60);
    const table = (await dropTables([name])).get(name.toLowerCase());
    const kc = killCounts(key)(name);
    if (!table) return res.json({ kc, found: false, items: [] });
    const mapping = await upstream.itemMapping().catch(() => []);
    const byName = new Map(mapping.map((i) => [i.name.toLowerCase(), i]));
    // Pets you have, as Dink reports them at login.
    const pets = new Set((ctx.getSettings()[`pets:${key}`] || []).map((p) => p.toLowerCase()));
    const have = new Set([
      ...db.prepare('SELECT lower(item_name) AS n FROM clog_items WHERE player = ? AND obtained_at IS NOT NULL').all(key).map((x) => x.n),
      ...db.prepare('SELECT lower(item_name) AS n FROM drops WHERE player = ?').all(key).map((x) => x.n),
      ...pets,
    ]);
    const items = Object.entries(table)
      .filter(([, rate]) => rate <= RARE_RATE)
      .map(([lower, rate]) => {
        const item = byName.get(lower);
        const itemName = item?.name ?? lower[0].toUpperCase() + lower.slice(1);
        return {
          itemName, icon: item?.icon ?? `${itemName}.png`, rate, pet: lower.startsWith('pet ') || pets.has(lower),
          obtained: have.has(lower), ...(dryness(kc, rate) || { chance: null, expected: 1 / rate, ratio: null }),
        };
      })
      .sort((a, b) => Number(b.pet) - Number(a.pet) || a.rate - b.rate);
    res.json({ kc, found: true, items });
  });

  r.delete('/collection-log/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM clog_items WHERE id = ? AND player = ?').run(Number(req.params.id), key);
    ctx.events.removeRef(`clog:${Number(req.params.id)}`);
    res.json({ ok: true });
  });

  return { router: r, recordDrop, obtainCollectionItem, killCounts };
}
