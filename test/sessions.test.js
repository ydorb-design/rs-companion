import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { combatFromLevels, nextCombatNeeds } from '../public/js/combat.js';

const HOUR = 3_600_000;
const players = {
  'iron brody': { Attack: 60, Strength: 60, Zulrah: 40 },
  'friend one': { Attack: 70, Strength: 50, Zulrah: 10, Vorkath: 5 },
};
let mine = players['iron brody'];

function hiscoresFor(name) {
  const p = name === 'iron brody' ? mine : players[name];
  if (!p) return null;
  const skills = ['Attack', 'Strength'].map((n) => ({ name: n, level: p[n], xp: p[n] * 1000, rank: 1 }));
  return {
    skills: [{ name: 'Overall', level: p.Attack + p.Strength, xp: skills.reduce((n, s) => n + s.xp, 0), rank: 1 }, ...skills],
    activities: ['Zulrah', 'Vorkath', 'Collections Logged'].filter((a) => p[a] != null).map((a) => ({ name: a, score: p[a], rank: 1 })),
  };
}

const MAPPING = [{ id: 12922, name: 'Tanzanite fang', highalch: 60000, icon: 'Tanzanite fang.png' }];
async function fakeFetch(url) {
  const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  if (url.includes('hiscore')) {
    const name = new URL(url).searchParams.get('player').toLowerCase();
    const data = hiscoresFor(name);
    return data ? json(data) : json({}, 404);
  }
  if (url.endsWith('/mapping')) return json(MAPPING);
  if (url.endsWith('/latest')) return json({ data: { 12922: { high: 2_000_000 } } });
  if (url.includes('api.php')) {
    const title = new URL(url).searchParams.get('titles');
    const content = title === 'Zulrah'
      ? '{{DropsLine|name=Tanzanite fang|rarity=1/1024|rolls=2}}{{DropsLine|name=Pet snakeling|rarity=1/4000}}{{DropsLine|name=Zul-andra teleport|rarity=1/20}}'
      : null;
    return json({ query: { pages: [{ title, ...(content ? { revisions: [{ slots: { main: { content } } }] } : { missing: true }) }] } });
  }
  throw new Error(`unexpected ${url}`);
}

let app, server, base, clock = Date.parse('2026-11-01T08:00:00Z');
before(async () => {
  app = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch }), now: () => clock, fetch: fakeFetch });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function dink(body) {
  const { dinkPath } = await call('/dink-config').then((r) => ({ dinkPath: r.body.path }));
  const res = await fetch(base.replace(/\/api$/, '') + dinkPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.status;
}

async function call(path, method = 'GET', body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('combat level maths', () => {
  const fresh = { Attack: 1, Strength: 1, Defence: 1, Hitpoints: 10, Prayer: 1, Ranged: 1, Magic: 1 };
  assert.equal(combatFromLevels(fresh), 3);
  assert.equal(combatFromLevels({ ...fresh, Attack: 99, Strength: 99, Defence: 99, Hitpoints: 99, Prayer: 99, Ranged: 99, Magic: 99 }), 126);
  const needs = Object.fromEntries(nextCombatNeeds(fresh).map((o) => [o.label, o.levels]));
  // Each option must actually get to the next level, and one fewer must not.
  for (const o of nextCombatNeeds({ ...fresh, Attack: 40, Strength: 45, Defence: 30, Hitpoints: 35, Prayer: 31 })) {
    if (o.levels == null) continue;
    const add = (levels, n) => {
      const t = { ...levels };
      for (let i = 0; i < n; i++) { const s = o.skills.find((x) => t[x] < 99); t[s]++; }
      return combatFromLevels(t);
    };
    const start = { ...fresh, Attack: 40, Strength: 45, Defence: 30, Hitpoints: 35, Prayer: 31 };
    assert.equal(add(start, o.levels), combatFromLevels(start) + 1, o.label);
    assert.equal(add(start, o.levels - 1), combatFromLevels(start), o.label);
  }
  assert.ok(needs['Attack or Strength'] > 0);
});

test('play session records XP, kills and drops', async () => {
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  assert.equal((await call('/sessions/1/end', 'POST')).status, 404);
  assert.equal((await call('/sessions', 'POST', { note: 'Zulrah' })).status, 201);
  assert.equal((await call('/sessions', 'POST', {})).status, 400, 'only one at a time');

  clock += 2 * HOUR;
  mine = { Attack: 61, Strength: 60, Zulrah: 52 };
  await call('/drops', 'POST', { itemId: 12922, qty: 1, source: 'Zulrah' });
  let s = (await call('/sessions')).body.active;
  assert.equal(s.xp, 0, 'stats not refreshed yet');
  assert.equal(s.lootValue, 2_000_000);
  await call(`/sessions/${s.id}/update`, 'POST');
  s = (await call('/sessions')).body.active;
  assert.equal(s.xp, 1000);
  assert.equal(s.xpPerHour, 500);
  assert.deepEqual(s.activities.map((a) => [a.name, a.gained]), [['Zulrah', 12]]);

  const ended = (await call(`/sessions/${s.id}/end`, 'POST')).body.session;
  assert.equal(ended.active, false);
  assert.equal(ended.hours, 2);
  const all = (await call('/sessions')).body;
  assert.equal(all.active, null);
  assert.equal(all.history.length, 1);
  assert.equal(all.totals.loot, 2_000_000);

  // Drops after the session ended don't count towards it.
  clock += HOUR;
  await call('/drops', 'POST', { itemId: 12922, qty: 1, source: 'Zulrah' });
  assert.equal((await call('/sessions')).body.history[0].lootValue, 2_000_000);

  await call(`/sessions/${s.id}`, 'DELETE');
  assert.equal((await call('/sessions')).body.history.length, 0);
});

test('Dink login and logout start and end a session', async () => {
  clock += 24 * HOUR;
  mine = { Attack: 61, Strength: 60, Zulrah: 52 };
  await call('/stats/refresh', 'POST');
  // Dink's XP is exact, and ahead of the hiscores snapshot.
  await dink({
    type: 'LOGIN', playerName: 'Iron Brody',
    extra: { skills: { totalExperience: 121_500, experience: { Attack: 61_500, Strength: 60_000 } }, slayer: { points: 321 }, pets: [{ itemId: 1, name: 'Pet snakeling' }] },
  });
  let s = (await call('/sessions')).body.active;
  assert.equal(s.auto, true);
  assert.equal((await call('/settings')).body.autoSessions, true);

  clock += HOUR;
  mine = { Attack: 62, Strength: 60, Zulrah: 60 };
  await dink({ type: 'LOGOUT', playerName: 'Iron Brody' });
  let all = (await call('/sessions')).body;
  assert.equal(all.active, null);
  assert.equal(all.history[0].pending, true);
  await app.jobs.finishSessions();
  all = (await call('/sessions')).body;
  const done = all.history[0];
  assert.equal(done.pending, false);
  assert.equal(done.xp, 500, 'measured from the XP Dink sent at login');
  assert.equal(done.hours, 1);
  assert.deepEqual(done.activities.map((a) => [a.name, a.gained]), [['Zulrah', 8]]);

  // A second login without a logout closes the old session instead of leaving it running.
  await dink({ type: 'LOGIN', playerName: 'Iron Brody', extra: {} });
  clock += 10 * HOUR;
  await dink({ type: 'LOGIN', playerName: 'Iron Brody', extra: {} });
  all = (await call('/sessions')).body;
  assert.ok(all.active);
  assert.ok(all.history[0].hours < 1, 'stale session ended near its start, not 10 hours later');

  await call('/settings', 'PUT', { autoSessions: false });
  await dink({ type: 'LOGOUT', playerName: 'Iron Brody' });
  assert.ok((await call('/sessions')).body.active, 'ignored when turned off');
});

test('loot per kill and per hour by source', async () => {
  const rows = (await call('/loot/sources')).body;
  const z = rows.find((r) => r.source === 'Zulrah');
  assert.equal(z.drops, 2);
  assert.equal(z.value, 4_000_000);
  // Kill count was 40 before the first drop and is 60 now.
  assert.equal(z.kills, 20);
  assert.equal(z.perKill, 200_000);
});

test('rare drop odds from the wiki and kill count', async () => {
  const d = (await call('/bosses/Zulrah/odds')).body;
  assert.equal(d.found, true);
  assert.equal(d.kc, 60);
  assert.deepEqual(d.items.map((i) => i.itemName), ['Pet snakeling', 'Tanzanite fang'], 'pets first, common drops left out');
  assert.equal(d.items[0].obtained, true, 'pet from Dink login');
  assert.equal(d.items[1].obtained, true, 'logged drop');
  assert.ok(Math.abs(d.items[0].chance - (1 - (1 - 1 / 4000) ** 60)) < 1e-9);
  assert.equal((await call('/bosses/Nothing%20Here/odds')).body.found, false);
});

test('search finds bosses and tasks', async () => {
  await call('/tasks', 'POST', { title: 'Get a zulrah helm' });
  const hits = (await call('/search?q=zul')).body;
  const groups = Object.fromEntries(hits.map((h) => [h.group, h]));
  assert.equal(groups.Bosses.href, '#/bosses/Zulrah');
  assert.ok(groups.Tasks);
  assert.deepEqual((await call('/search?q=t')).body, [], 'too short');
});
