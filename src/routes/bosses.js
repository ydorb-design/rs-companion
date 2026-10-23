// Boss notes: gear, inventory and strategy per boss, alongside kill count, drops and collection log.
import { Router } from 'express';
import { BadRequest } from '../context.js';
import { activityGroup } from '../activities.js';

export function bossesRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  // Every boss you're ranked at, have notes for, or have logged drops or collection log items from.
  r.get('/bosses', (req, res) => {
    const { key } = ctx.requireAccount();
    const latest = ctx.latestSnapshot(key);
    const kc = Object.fromEntries((latest?.activities || []).filter((a) => activityGroup(a.name) === 'bosses').map((a) => [a.name, a.score]));
    const noted = new Set(db.prepare('SELECT boss FROM boss_notes WHERE player = ?').all(key).map((x) => x.boss));
    for (const r of db.prepare('SELECT boss, count FROM boss_records WHERE player = ?').all(key)) {
      if (r.count != null && r.count > (kc[r.boss] ?? -1)) kc[r.boss] = r.count;
    }
    const names = new Set([...Object.keys(kc), ...noted]);
    const list = [...names].map((name) => ({ name, kc: kc[name] ?? null, hasNotes: noted.has(name) }))
      .sort((a, b) => Number(b.hasNotes) - Number(a.hasNotes) || (b.kc ?? -1) - (a.kc ?? -1) || a.name.localeCompare(b.name));
    res.json(list);
  });

  r.get('/bosses/:name', (req, res) => {
    const { key } = ctx.requireAccount();
    const name = String(req.params.name);
    const note = db.prepare('SELECT * FROM boss_notes WHERE player = ? AND boss = ?').get(key, name);
    const hiscoreKc = ctx.latestSnapshot(key)?.activities.find((a) => a.name === name)?.score ?? null;
    // Dink reports kill counts as they happen, so prefer it when it's ahead of the hiscores.
    const record = db.prepare('SELECT * FROM boss_records WHERE player = ? AND lower(boss) = lower(?)').get(key, name);
    const kc = Math.max(hiscoreKc ?? -1, record?.count ?? -1) >= 0 ? Math.max(hiscoreKc ?? -1, record?.count ?? -1) : null;
    const drops = db.prepare('SELECT * FROM drops WHERE player = ? AND lower(source) = lower(?) ORDER BY at DESC LIMIT 50').all(key, name);
    const clog = db.prepare('SELECT * FROM clog_items WHERE player = ? AND lower(source) = lower(?) ORDER BY item_name').all(key, name);
    res.json({
      name,
      kc,
      personalBest: record?.pb_seconds ?? null,
      notes: note ? { gear: note.gear, inventory: note.inventory, notes: note.notes, updatedAt: note.updated_at } : null,
      drops: drops.map((d) => ({ id: d.id, itemName: d.item_name, icon: d.icon, qty: d.qty, value: d.value_each != null ? d.value_each * d.qty : null, at: d.at })),
      collectionLog: clog.map((c) => ({ id: c.id, itemName: c.item_name, icon: c.icon, obtainedAt: c.obtained_at })),
    });
  });

  r.put('/bosses/:name', (req, res) => {
    const { key } = ctx.requireAccount();
    const name = String(req.params.name).trim().slice(0, 60);
    if (!name) throw new BadRequest('Missing boss name.');
    const field = (k) => String(req.body[k] || '').slice(0, 5000);
    db.prepare(`INSERT INTO boss_notes (player, boss, gear, inventory, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(player, boss) DO UPDATE SET gear = excluded.gear, inventory = excluded.inventory, notes = excluded.notes, updated_at = excluded.updated_at`)
      .run(key, name, field('gear'), field('inventory'), field('notes'), now());
    res.json({ ok: true });
  });

  r.delete('/bosses/:name', (req, res) => {
    const { key } = ctx.requireAccount();
    db.prepare('DELETE FROM boss_notes WHERE player = ? AND boss = ?').run(key, String(req.params.name));
    res.json({ ok: true });
  });

  return r;
}
