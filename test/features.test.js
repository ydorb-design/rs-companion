import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { eventsFromSnapshots, eventsFromSync, milestoneCrossed, multipleCrossed } from '../src/events.js';
import { periodStart } from '../src/routes/checklist.js';

const DAY = 86_400_000;
const snap = (attack, zulrah, clog = 95) => ({
  skills: [{ name: 'Overall', level: attack, xp: 0 }, { name: 'Attack', level: attack, xp: 0 }],
  activities: [
    ...(zulrah != null ? [{ name: 'Zulrah', score: zulrah }] : []),
    { name: 'Clue Scrolls (all)', score: 9 },
    { name: 'Collections Logged', score: clog },
    { name: 'Soul Wars Zeal', score: 500 },
  ],
});

let hiscores = snap(60, 40);
const MAPPING = [
  { id: 4151, name: 'Abyssal whip', highalch: 72000, icon: 'Abyssal whip.png' },
  { id: 6570, name: 'Fire cape', highalch: 0, icon: 'Fire cape.png' },
  { id: 12922, name: 'Tanzanite fang', highalch: 60000, icon: 'Tanzanite fang.png' },
];
const LATEST = { data: { 4151: { high: 1_500_000 }, 12922: { high: 2_000_000 } } };
async function fakeFetch(url) {
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  if (url.includes('hiscore')) return json({ skills: hiscores.skills.map((s) => ({ ...s, rank: 1, xp: s.level * 1000 })), activities: hiscores.activities.map((a) => ({ ...a, rank: 1 })) });
  if (url.endsWith('/mapping')) return json(MAPPING);
  if (url.endsWith('/latest')) return json(LATEST);
  throw new Error(`unexpected ${url}`);
}

let server, base, db, clock = Date.parse('2026-10-21T10:00:00Z'); // a Wednesday
before(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, upstream: createUpstream({ fetch: fakeFetch }), now: () => clock, fetch: fakeFetch });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(path, method = 'GET', body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('milestones', () => {
  assert.equal(milestoneCrossed(40, 55), 50);
  assert.equal(milestoneCrossed(90, 260), 250);
  assert.equal(milestoneCrossed(1990, 3005), 3000);
  assert.equal(milestoneCrossed(51, 60), null);
  assert.equal(multipleCrossed(95, 104, 100), 100);
  assert.equal(multipleCrossed(105, 150, 100), null);
});

test('events from snapshots and syncs', () => {
  const titles = eventsFromSnapshots(snap(60, 40), snap(62, 52, 101)).map((e) => e.title);
  assert.deepEqual(titles, ['Attack level 62', 'Zulrah: 50 kills', '100 collection log slots']);
  assert.deepEqual(eventsFromSnapshots(snap(98, null), snap(99, 7)).map((e) => e.title), ['99 Attack', 'Now ranked: Zulrah']);
  assert.deepEqual(eventsFromSnapshots(null, snap(1, 1)), []);
  const sync = (state, easy) => ({ quests: [{ name: 'Lost City', state }], diaries: { Varrock: { Easy: easy } } });
  assert.deepEqual(eventsFromSync(sync('in_progress', false), sync('complete', true)).map((e) => e.title),
    ['Quest complete: Lost City', 'Varrock Easy diary complete']);
  assert.deepEqual(eventsFromSync(null, sync('complete', true)), [], 'first sync adds nothing');
});

test('weekly reset is Wednesday 00:00 UTC', () => {
  assert.equal(periodStart('weekly', Date.parse('2026-10-21T10:00:00Z')), Date.parse('2026-10-21T00:00:00Z')); // Wed
  assert.equal(periodStart('weekly', Date.parse('2026-10-27T23:59:00Z')), Date.parse('2026-10-21T00:00:00Z')); // Tue
  assert.equal(periodStart('weekly', Date.parse('2026-10-20T08:00:00Z')), Date.parse('2026-10-14T00:00:00Z')); // Tue before
  assert.equal(periodStart('daily', Date.parse('2026-10-21T10:00:00Z')), Date.parse('2026-10-21T00:00:00Z'));
});

test('activity feed backfills older snapshots once, then records new events', async () => {
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  // Simulate history from before the feed existed.
  db.prepare('INSERT INTO snapshots (player, taken_at, data) VALUES (?, ?, ?), (?, ?, ?)')
    .run('iron brody', clock - 2 * DAY, JSON.stringify(snap(58, 20)), 'iron brody', clock - DAY, JSON.stringify(snap(60, 40)));
  let feed = (await call('/activity')).body;
  assert.deepEqual(feed.map((e) => e.title), ['Attack level 60', 'Zulrah: 25 kills']);
  assert.equal(feed[0].detail, 'Up from 58');

  hiscores = snap(61, 50);
  await call('/stats/refresh', 'POST');
  feed = (await call('/activity')).body;
  assert.deepEqual(feed.slice(0, 2).map((e) => e.title), ['Attack level 61', 'Zulrah: 50 kills']);
  assert.equal(feed.length, 4, 'no duplicate backfill');
  assert.equal((await call('/activity?type=kc')).body.length, 2);
});

test('slayer tracker', async () => {
  assert.equal((await call('/slayer/task', 'POST', { monster: '', amount: 10 })).status, 400);
  await call('/slayer/task', 'POST', { monster: 'Abyssal demons', amount: 150, master: 'Duradel' });
  let s = (await call('/slayer')).body;
  assert.deepEqual([s.current.monster, s.current.kills], ['Abyssal demons', 0]);
  await call('/slayer/task', 'PUT', { add: 5 });
  await call('/slayer/task', 'PUT', { add: 1 });
  assert.equal((await call('/slayer')).body.current.kills, 6);
  await call('/slayer/task', 'PUT', { kills: 999 });
  assert.equal((await call('/slayer')).body.current.kills, 150, 'clamped to amount');

  await call('/slayer/points', 'PUT', { points: 100 });
  await call('/slayer/task/end', 'POST', { outcome: 'complete', points: 15 });
  s = (await call('/slayer')).body;
  assert.equal(s.current, null);
  assert.deepEqual([s.points, s.completed, s.history[0].points], [115, 1, 15]);
  assert.ok((await call('/activity?type=slayer')).body[0].title.includes('150 Abyssal demons'));

  // A new task while one is active marks the old one skipped.
  await call('/slayer/task', 'POST', { monster: 'Hellhounds', amount: 120 });
  await call('/slayer/task', 'POST', { monster: 'Gargoyles', amount: 130 });
  s = (await call('/slayer')).body;
  assert.deepEqual([s.current.monster, s.skipped, s.monsters.length], ['Gargoyles', 1, 3]);
  await call(`/slayer/task/${s.history.find((h) => h.monster === 'Abyssal demons').id}`, 'DELETE');
  assert.equal((await call('/activity?type=slayer')).body.length, 0, 'deleting a task removes its feed entry');
});

test('drop log and collection log', async () => {
  assert.equal((await call('/collection-log', 'POST', { itemId: 12922, source: 'Zulrah' })).status, 201);
  assert.equal((await call('/collection-log', 'POST', { itemId: 12922, source: 'Zulrah' })).status, 400);
  await call('/collection-log', 'POST', { itemId: 6570, source: 'TzHaar Fight Cave' });

  const drop = await call('/drops', 'POST', { itemId: 12922, qty: 1, source: 'Zulrah' });
  assert.equal(drop.body.collectionLog, true);
  await call('/drops', 'POST', { itemId: 4151, qty: 2, source: 'Abyssal demons' });
  await call('/drops', 'POST', { itemName: 'Some untracked thing', qty: 1 });
  assert.equal((await call('/drops', 'POST', { qty: 1 })).status, 400);

  const d = (await call('/drops')).body;
  assert.equal(d.totals.count, 3);
  assert.equal(d.totals.value, 2_000_000 + 3_000_000);
  assert.equal(d.totals.biggest.itemName, 'Abyssal whip');
  assert.deepEqual(d.sources, ['Abyssal demons', 'Zulrah']);

  // Totals count every drop, not just the 500 the list shows.
  const key = 'iron brody';
  const insert = db.prepare("INSERT INTO drops (player, item_name, qty, source, value_each, note, at) VALUES (?, 'Coins', 1, '', 10, '', ?)");
  for (let i = 0; i < 600; i++) insert.run(key, clock - DAY);
  const many = (await call('/drops')).body;
  assert.equal(many.drops.length, 500);
  assert.deepEqual([many.totals.count, many.totals.value], [603, 5_000_000 + 6000]);
  db.prepare("DELETE FROM drops WHERE item_name = 'Coins'").run();

  const clog = (await call('/collection-log')).body;
  assert.equal(clog.items.find((i) => i.itemName === 'Tanzanite fang').obtainedAt != null, true);
  assert.equal(clog.hiscoresLogged, 95);
  const cape = clog.items.find((i) => i.itemName === 'Fire cape');
  await call(`/collection-log/${cape.id}`, 'PUT', { obtained: true });
  assert.equal((await call('/activity?type=clog')).body.length, 2);
  await call(`/collection-log/${cape.id}`, 'PUT', { obtained: false });
  assert.equal((await call('/activity?type=clog')).body.length, 1);

  const whip = d.drops.find((x) => x.itemName === 'Abyssal whip');
  await call(`/drops/${whip.id}`, 'DELETE');
  assert.equal((await call('/activity?type=drop')).body.length, 2);
});

test('daily and weekly checklist resets', async () => {
  assert.equal((await call('/checklist', 'POST', { label: 'Battlestaves', freq: 'monthly' })).status, 400);
  const daily = (await call('/checklist', 'POST', { label: 'Battlestaves', freq: 'daily' })).body;
  const weekly = (await call('/checklist', 'POST', { label: 'Miscellania', freq: 'weekly' })).body;
  await call(`/checklist/${daily.id}`, 'PUT', { done: true });
  await call(`/checklist/${weekly.id}`, 'PUT', { done: true });
  let list = (await call('/checklist')).body;
  assert.deepEqual(list.map((x) => x.done), [true, true]);
  clock += DAY; // Thursday
  list = (await call('/checklist')).body;
  assert.deepEqual(list.map((x) => [x.label, x.done]), [['Battlestaves', false], ['Miscellania', true]]);
  clock += 6 * DAY; // next Wednesday
  assert.equal((await call('/checklist')).body.find((x) => x.freq === 'weekly').done, false);
});

test('export leaves out secrets', async () => {
  await call('/settings', 'PUT', { discordWebhook: 'https://discord.test/hook' });
  const res = await call('/export');
  assert.match(res.headers.get('content-disposition'), /rs-companion-\d{4}-\d{2}-\d{2}\.json/);
  assert.equal(res.body.settings.discordWebhook, undefined);
  assert.equal(res.body.settings.secret, undefined);
  assert.ok(res.body.tables.snapshots.length >= 3);
  assert.equal(typeof res.body.tables.snapshots[0].data, 'object');
  assert.ok(res.body.tables.drops.length >= 1);
});

test('supply stockpile', async () => {
  assert.equal((await call('/supplies', 'POST', { qty: 5 })).status, 400);
  assert.equal((await call('/supplies', 'POST', { itemId: 4151, qty: 340, target: 500, lowAt: 100 })).status, 201);
  assert.equal((await call('/supplies', 'POST', { itemId: 4151 })).status, 400, 'no duplicates');
  await call('/supplies', 'POST', { itemName: 'Prayer potion(4)', qty: 20, lowAt: 50 });
  let s = (await call('/supplies')).body;
  const whip = s.items.find((i) => i.itemName === 'Abyssal whip');
  assert.equal(whip.value, 340 * 1_500_000);
  assert.equal(s.items.find((i) => i.itemName === 'Prayer potion(4)').low, true);
  await call(`/supplies/${whip.id}`, 'PUT', { add: -300 });
  s = (await call('/supplies')).body;
  assert.deepEqual([s.items.find((i) => i.id === whip.id).qty, s.items.find((i) => i.id === whip.id).low], [40, true]);
  await call(`/supplies/${whip.id}`, 'PUT', { add: -1000 });
  assert.equal((await call('/supplies')).body.items.find((i) => i.id === whip.id).qty, 0, 'never below zero');
  await call(`/supplies/${whip.id}`, 'PUT', { qty: 600, lowAt: '' });
  assert.equal((await call('/supplies')).body.items.find((i) => i.id === whip.id).low, false);
});

test('boss notes', async () => {
  let list = (await call('/bosses')).body;
  assert.ok(list.some((b) => b.name === 'Zulrah' && b.kc === 50));
  await call('/bosses/Vorkath', 'PUT', { gear: 'Dragon hunter crossbow', inventory: 'Antifire', notes: 'Walk the acid' });
  list = (await call('/bosses')).body;
  assert.equal(list[0].name, 'Vorkath', 'bosses with notes first');
  const z = (await call('/bosses/Zulrah')).body;
  assert.equal(z.kc, 50);
  assert.equal(z.notes, null);
  assert.ok(z.collectionLog.some((c) => c.itemName === 'Tanzanite fang'));
  assert.ok(z.drops.some((d) => d.itemName === 'Tanzanite fang'));
  assert.equal((await call('/bosses/Vorkath')).body.notes.gear, 'Dragon hunter crossbow');
  await call('/bosses/Vorkath', 'DELETE');
  assert.equal((await call('/bosses/Vorkath')).body.notes, null);
});

test('restore from backup', async () => {
  assert.equal((await call('/import', 'POST', { hello: 'world' })).status, 400);
  await call('/settings', 'PUT', { discordWebhook: 'https://discord.test/hook' });
  const backup = (await call('/export')).body;
  const goalsBefore = backup.tables.goals.length;
  const snapshotsBefore = backup.tables.snapshots.length;

  // Change things, then restore.
  await call('/goals', 'POST', { skill: 'Attack', targetLevel: 70 });
  await call('/tasks', 'POST', { title: 'Will be removed' });
  await call('/settings', 'PUT', { refreshHours: 12 });
  const res = await call('/import', 'POST', backup);
  assert.equal(res.status, 200);
  assert.equal(res.body.restored.snapshots, snapshotsBefore);

  assert.equal((await call('/goals')).body.length, goalsBefore);
  assert.equal((await call('/tasks')).body.some((t) => t.title === 'Will be removed'), false);
  const settings = (await call('/settings')).body;
  assert.equal(settings.refreshHours, backup.settings.refreshHours);
  assert.equal(settings.discordWebhook, 'https://discord.test/hook', 'credentials kept');
  assert.equal(settings.active.player, 'Iron Brody');
  const stats = (await call('/stats')).body;
  assert.ok(stats.latest.skills.length > 0, 'snapshot JSON restored');
});
