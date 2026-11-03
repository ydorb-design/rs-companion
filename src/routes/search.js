// One search across the app: quests, bosses, guides, your lists, and Grand Exchange items.
import { Router } from 'express';
import { activityGroup } from '../activities.js';
import { GUIDES } from '../guides/index.js';

const PER_GROUP = 6;

export function searchRoutes(ctx) {
  const r = Router();
  const { db } = ctx;

  r.get('/search', async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json([]);
    const account = ctx.activeAccount();
    const key = account?.key;
    const hit = (text) => String(text || '').toLowerCase().includes(q);
    const rank = (text) => (String(text).toLowerCase() === q ? 0 : String(text).toLowerCase().startsWith(q) ? 1 : 2);
    const top = (list) => list.sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title)).slice(0, PER_GROUP);
    const out = [];
    const add = (group, list) => out.push(...top(list).map((x) => ({ group, ...x })));

    if (key) {
      const synced = db.prepare('SELECT data FROM wikisync WHERE player = ?').get(key);
      const quests = synced ? JSON.parse(synced.data).quests || [] : [];
      const label = { complete: 'Complete', in_progress: 'In progress', not_started: 'Not started' };
      add('Quests', quests.filter((x) => hit(x.name)).map((x) => ({ title: x.name, sub: label[x.state], href: `#/quests/${encodeURIComponent(x.name)}` })));

      const kc = {};
      for (const a of ctx.latestSnapshot(key)?.activities || []) if (activityGroup(a.name) === 'bosses') kc[a.name] = a.score;
      for (const b of db.prepare('SELECT boss, count FROM boss_records WHERE player = ?').all(key)) kc[b.boss] = Math.max(kc[b.boss] ?? -1, b.count ?? -1);
      for (const b of db.prepare('SELECT boss FROM boss_notes WHERE player = ?').all(key)) kc[b.boss] ??= -1;
      add('Bosses', Object.entries(kc).filter(([n]) => hit(n)).map(([n, c]) => ({
        title: n, sub: c >= 0 ? `${c.toLocaleString('en-AU')} kills` : 'Notes', href: `#/bosses/${encodeURIComponent(n)}`,
      })));

      add('Collection log', db.prepare('SELECT item_name, source, obtained_at FROM clog_items WHERE player = ?').all(key)
        .filter((x) => hit(x.item_name)).map((x) => ({ title: x.item_name, sub: [x.source, x.obtained_at ? 'Obtained' : 'Not yet'].filter(Boolean).join(' · '), href: '#/collection' })));
      add('Supplies', db.prepare('SELECT item_name, qty FROM supplies WHERE player = ?').all(key)
        .filter((x) => hit(x.item_name)).map((x) => ({ title: x.item_name, sub: `${x.qty.toLocaleString('en-AU')} in stock`, href: '#/supplies' })));
      add('Sessions', db.prepare("SELECT note, started_at FROM sessions WHERE player = ? AND note != ''").all(key)
        .filter((x) => hit(x.note)).map((x) => ({ title: x.note, sub: new Date(x.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), href: '#/sessions' })));
    }

    add('Tasks', db.prepare('SELECT title, status FROM tasks').all()
      .filter((x) => hit(x.title)).map((x) => ({ title: x.title, sub: { todo: 'To do', doing: 'Doing', done: 'Done' }[x.status], href: '#/tasks' })));

    add('Guides', GUIDES.flatMap((g) => [
      ...(hit(g.name) ? [{ title: g.name, sub: 'Guide', href: `#/guides/${g.id}` }] : []),
      ...(g.steps || []).filter((st) => hit(st.title)).map((st) => ({ title: st.title, sub: g.name, href: `#/guides/${g.id}` })),
    ]));

    try {
      const items = (await ctx.upstream.itemMapping()).filter((i) => hit(i.name));
      add('Items', items.map((i) => ({ title: i.name, sub: 'Grand Exchange', icon: i.icon, href: `#/prices/${encodeURIComponent(i.name)}` })));
    } catch {
      // Item search is a bonus; skip it if the wiki can't be reached.
    }
    res.json(out);
  });

  return r;
}
