import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream, parseHiscores, parseWikiSync } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { levelForXp, xpForLevel } from '../public/js/xp.js';

// Sample responses in the shape the real APIs return.
const SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Magic'];
function hiscoresFixture(xpBoost = 0) {
  const skills = SKILLS.map((name, i) => ({ id: i + 1, name, rank: 1000 + i, level: 0, xp: 100_000 * (i + 1) + xpBoost }));
  skills.forEach((s) => (s.level = levelForXp(s.xp)));
  skills.push({ id: 6, name: 'Sailing', rank: -1, level: 1, xp: -1 });
  const total = skills.filter((s) => s.xp > 0).reduce((n, s) => n + s.xp, 0);
  return {
    skills: [{ id: 0, name: 'Overall', rank: 50, level: skills.reduce((n, s) => n + s.level, 0), xp: total }, ...skills],
    activities: [{ id: 0, name: 'Clue Scrolls (all)', rank: 10, score: 42 }, { id: 1, name: 'Zulrah', rank: -1, score: -1 }],
  };
}
const WIKISYNC = {
  username: 'Iron Brody',
  timestamp: '2026-10-20T10:00:00Z',
  quests: { "Cook's Assistant": 2, 'Dragon Slayer I': 1, 'Monkey Madness I': 0 },
  achievement_diaries: { Ardougne: { Easy: { complete: true, tasks: [true] }, Medium: { complete: false, tasks: [false] } } },
  levels: { Attack: 50 },
};
const MAPPING = [
  { id: 561, name: 'Nature rune', highalch: 4, limit: 18000, members: false, icon: 'Nature rune.png' },
  { id: 1127, name: 'Rune platebody', highalch: 39000, limit: 70, members: false, icon: 'Rune platebody.png' },
  { id: 1319, name: 'Rune 2h sword', highalch: 38400, limit: 70, members: false, icon: 'Rune 2h sword.png' },
];
const LATEST = { data: { 561: { high: 100, low: 95 }, 1127: { high: 38500, low: 38000 }, 1319: { high: 39000, low: 38000 } } };

let xpBoost = 0;
const requested = [];
async function fakeFetch(url) {
  requested.push(url);
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (url.includes('hiscore_oldschool_ironman') && url.includes('Iron%20Brody')) return json(hiscoresFixture(xpBoost));
  if (url.includes('hiscore')) return json({}, 404);
  if (url.includes('sync.runescape.wiki')) return json(WIKISYNC);
  if (url.endsWith('/mapping')) return json(MAPPING);
  if (url.endsWith('/latest')) return json(LATEST);
  throw new Error(`unexpected ${url}`);
}

let server, base, clock = Date.parse('2026-10-21T00:00:00Z');
before(async () => {
  const app = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch, now: () => clock }), now: () => clock });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(path, method = 'GET', body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('xp table matches known values', () => {
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(50), 101_333);
  assert.equal(xpForLevel(92), 6_517_253);
  assert.equal(xpForLevel(99), 13_034_431);
  assert.equal(levelForXp(13_034_430), 98);
  assert.equal(levelForXp(200_000_000), 99);
  assert.equal(levelForXp(200_000_000, { virtual: true }), 126);
});

test('parsers handle unranked skills and wikisync shapes', () => {
  const h = parseHiscores(hiscoresFixture());
  assert.equal(h.skills.find((s) => s.name === 'Sailing').xp, 0);
  assert.equal(h.activities.length, 1);
  const w = parseWikiSync(WIKISYNC);
  assert.deepEqual(w.quests.map((q) => q.state), ['complete', 'in_progress', 'not_started']);
  assert.equal(w.diaries.Ardougne.Easy, true);
});

test('requires a player before tracking', async () => {
  const r = await call('/goals');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /player name/);
});

test('settings validation', async () => {
  assert.equal((await call('/settings', 'PUT', { accountType: 'nope' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { player: 'waytoolongname' })).status, 400);
  const r = await call('/settings', 'PUT', { player: 'Wrong Name', accountType: 'ironman', refreshHours: 6 });
  assert.equal(r.status, 200);
});

test('unknown player gives a clear 404', async () => {
  const r = await call('/stats/refresh', 'POST');
  assert.equal(r.status, 404);
  assert.match(r.body.error, /isn't on the Ironman hiscores/);
  await call('/settings', 'PUT', { player: 'Iron Brody' });
});

test('stats refresh, gains and history', async () => {
  assert.equal((await call('/stats/refresh', 'POST')).status, 200);
  clock += 60 * 60 * 1000;
  xpBoost = 5000;
  await call('/stats/refresh', 'POST');
  clock += 60 * 1000;
  await call('/stats/refresh', 'POST'); // unchanged, should not add a row

  const stats = (await call('/stats')).body;
  assert.equal(stats.latest.skills.length, 7);
  assert.equal(stats.gains.day.find((g) => g.name === 'Attack').xp, 5000);
  assert.ok(requested.some((u) => u.includes('hiscore_oldschool_ironman')));

  const hist = (await call('/stats/history?skill=Attack&days=30')).body;
  assert.equal(hist.points.length, 2);
});

test('goals compute remaining xp, actions and hours', async () => {
  const created = await call('/goals', 'POST', { skill: 'Attack', targetLevel: 60, xpPerAction: 100, xpPerHour: 50000 });
  assert.equal(created.status, 201);
  const g = created.body;
  assert.equal(g.targetXp, xpForLevel(60));
  assert.equal(g.remainingXp, xpForLevel(60) - 105_000);
  assert.equal(g.actions, Math.ceil(g.remainingXp / 100));
  assert.equal(g.targetLevel, 60);
  assert.equal((await call('/goals', 'POST', { skill: 'Overall', targetLevel: 99 })).status, 400);
  const done = (await call('/goals', 'POST', { skill: 'Magic', targetXp: 1000 })).body;
  assert.equal(done.complete, true);
  assert.equal((await call('/goals')).body.length, 2);
  await call(`/goals/${done.id}`, 'DELETE');
  assert.equal((await call('/goals')).body.length, 1);
});

test('quests and diaries merge sync with manual overrides', async () => {
  let p = (await call('/progress')).body;
  assert.equal(p.quests.length, 0);
  assert.equal(p.diaries.length, 12);
  await call('/progress/sync', 'POST');
  p = (await call('/progress')).body;
  assert.equal(p.quests.find((q) => q.name === 'Dragon Slayer I').state, 'in_progress');
  assert.equal(p.diaries.find((d) => d.region === 'Ardougne').tiers[0].complete, true);

  await call('/progress/quest', 'PUT', { name: 'Dragon Slayer I', state: 'complete' });
  await call('/progress/diary', 'PUT', { region: 'Varrock', tier: 'Hard', complete: true });
  p = (await call('/progress')).body;
  const ds = p.quests.find((q) => q.name === 'Dragon Slayer I');
  assert.deepEqual([ds.state, ds.manual, ds.synced], ['complete', true, 'in_progress']);
  assert.equal(p.diaries.find((d) => d.region === 'Varrock').tiers[2].manual, true);

  await call('/progress/quest', 'PUT', { name: 'Dragon Slayer I', state: 'in_progress', clear: true });
  p = (await call('/progress')).body;
  assert.equal(p.quests.find((q) => q.name === 'Dragon Slayer I').manual, false);
  assert.equal((await call('/progress/diary', 'PUT', { region: 'Atlantis', tier: 'Easy', complete: true })).status, 400);
});

test('price search, alch profit and watchlist', async () => {
  const results = (await call('/prices/search?q=rune')).body;
  assert.equal(results[0].name, 'Rune 2h sword'); // starts-with matches first, then alphabetical
  const plate = results.find((r) => r.id === 1127);
  assert.equal(plate.price, 38500);
  assert.equal(plate.alchProfit, 39000 - 38500 - 100);
  assert.deepEqual((await call('/prices/search?q=r')).body, []);

  await call('/prices/watchlist', 'POST', { id: 1127 });
  await call('/prices/watchlist', 'POST', { id: 1127 });
  assert.equal((await call('/prices/watchlist')).body.length, 1);
  await call('/prices/watchlist/1127', 'DELETE');
  assert.equal((await call('/prices/watchlist')).body.length, 0);
  assert.equal(requested.filter((u) => u.endsWith('/mapping')).length, 1, 'mapping is cached');
});

test('tasks board', async () => {
  assert.equal((await call('/tasks', 'POST', { title: '  ' })).status, 400);
  const t = (await call('/tasks', 'POST', { title: 'Barrows gloves', category: 'Unlocks' })).body;
  assert.equal(t.status, 'todo');
  const moved = (await call(`/tasks/${t.id}`, 'PUT', { status: 'doing', notes: 'Need RFD subquests' })).body;
  assert.deepEqual([moved.status, moved.notes, moved.title], ['doing', 'Need RFD subquests', 'Barrows gloves']);
  assert.equal((await call(`/tasks/${t.id}`, 'PUT', { status: 'archived' })).status, 400);
  await call(`/tasks/${t.id}`, 'DELETE');
  assert.equal((await call('/tasks')).body.length, 0);
});

test('static frontend and unknown api routes', async () => {
  const res = await fetch(base.replace('/api', '/'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /OSRS Companion/);
  assert.equal((await call('/nope')).status, 404);
});
