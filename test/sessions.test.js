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
  throw new Error(`unexpected ${url}`);
}

let server, base, clock = Date.parse('2026-11-01T08:00:00Z');
before(async () => {
  const app = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch }), now: () => clock, fetch: fakeFetch });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

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

test('compare with another player and save friends', async () => {
  assert.equal((await call('/compare?player=Iron%20Brody&accountType=ironman')).status, 400, 'not yourself');
  assert.equal((await call('/compare?player=Nobody&accountType=main')).status, 404);
  const c = (await call('/compare?player=Friend%20One&accountType=main')).body;
  assert.equal(c.theirs.player, 'Friend One');
  assert.equal(c.mine.player, 'Iron Brody');
  assert.equal(c.theirs.skills.find((s) => s.name === 'Attack').level, 70);
  assert.ok(c.theirs.activities.some((a) => a.name === 'Vorkath'));

  assert.equal((await call('/friends', 'POST', { player: '' })).status, 400);
  await call('/friends', 'POST', { player: 'Friend One', accountType: 'main' });
  await call('/friends', 'POST', { player: 'friend one', accountType: 'ironman' });
  let friends = (await call('/friends')).body;
  assert.deepEqual(friends, [{ player: 'friend one', accountType: 'ironman' }], 'same name replaces');
  friends = (await call('/friends/Friend%20One', 'DELETE')).body;
  assert.deepEqual(friends, []);
});
