import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { dryness, parseDropRates, parseRarity } from '../src/droprates.js';

test('reads rarities', () => {
  assert.equal(parseRarity('1/512'), 1 / 512);
  assert.equal(parseRarity('~1/2,000'), 1 / 2000);
  assert.equal(parseRarity('3/128'), 3 / 128);
  assert.equal(parseRarity('Always'), 1);
  assert.equal(parseRarity('Rare'), null);
  assert.equal(parseRarity('1/{{#expr:512/(511/512) round 1}}'), 1 / (512 / (511 / 512)));
  assert.equal(parseRarity('1/{{#expr:alert(1)}}'), null, 'only arithmetic is worked out');
});

test('combines lines within a version and picks the best version', () => {
  const page = `==Drops==
===Standard===
{{DropsLine|name=Tanzanite fang|quantity=1|rarity=1/1024|rolls=2}}
{{DropsLine|name=Coins|quantity=100|rarity=1/4}}
{{DropsLine|name=Coins|quantity=500|rarity=1/4|raritynotes={{Refn|group=d|name=x|Note {{SCP|Slayer}}.}}}}
{{DropsLine|name=Abyssal whip|quantity=1|rarity=1/512}}
===Wilderness===
{{DropsLine|name=Abyssal whip|quantity=1|rarity=1/512}}
{{DropsLine|name=Pet|quantity=1|rarity=Rare}}`;
  const rates = parseDropRates(page);
  assert.ok(Math.abs(rates['tanzanite fang'] - (1 - (1023 / 1024) ** 2)) < 1e-12);
  assert.equal(rates.coins, 1 - (3 / 4) ** 2);
  assert.equal(rates['abyssal whip'], 1 / 512, 'not doubled by the second version');
  assert.equal(rates.pet, undefined);
});

test('dryness', () => {
  const d = dryness(512, 1 / 512);
  assert.equal(d.expected, 512);
  assert.equal(d.ratio, 1);
  assert.ok(Math.abs(d.chance - 0.632) < 0.001);
  assert.equal(dryness(null, 1 / 512), null);
  assert.equal(dryness(10, null), null);
});

let server, url, wikiCalls = 0;
before(async () => {
  const fake = async (u) => {
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (u.includes('hiscore')) {
      return json({ skills: [{ name: 'Overall', rank: 1, level: 100, xp: 1 }], activities: [{ name: 'Zulrah', rank: 1, score: 1024 }, { name: 'Barrows Chests', rank: 1, score: 40 }] });
    }
    if (u.includes('api.php')) {
      wikiCalls += 1;
      const titles = new URL(u).searchParams.get('titles').split('|');
      const pages = { Zulrah: '{{DropsLine|name=Tanzanite fang|quantity=1|rarity=1/1024|rolls=2}}' };
      return json({ query: { pages: titles.map((title) => (pages[title] ? { title, revisions: [{ slots: { main: { content: pages[title] } } }] } : { title, missing: true })) } });
    }
    throw new Error(u);
  };
  const app = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fake }), fetch: fake });
  await new Promise((r) => (server = app.listen(0, r)));
  url = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
const call = async (p, method = 'GET', body) => {
  const res = await fetch(url + p, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return res.json();
};

test('collection log shows how dry you are', async () => {
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  await call('/stats/refresh', 'POST');
  await call('/collection-log', 'POST', { itemName: 'Tanzanite fang', source: 'Zulrah' });
  await call('/collection-log', 'POST', { itemName: "Ahrim's hood", source: 'Barrows' });

  let c = await call('/collection-log');
  const by = (name) => c.items.find((i) => i.itemName === name);
  const fang = by('Tanzanite fang');
  assert.deepEqual([fang.kc, fang.kcFrom, fang.rateFrom], [1024, 'tracked', 'wiki']);
  assert.ok(Math.abs(fang.dry.ratio - 2) < 0.01, 'two rolls at 1/1024 is about 1/512');
  const hood = by("Ahrim's hood");
  assert.deepEqual([hood.kc, hood.rate, hood.dry], [40, null, null], 'Barrows Chests kill count, no wiki rate');

  // Your own rate and kill count fill the gaps.
  await call(`/collection-log/${hood.id}`, 'PUT', { rate: '1/2,448', kc: '' });
  c = await call('/collection-log');
  assert.equal(by("Ahrim's hood").rateFrom, 'manual');
  assert.equal(by("Ahrim's hood").obtainedAt, null, 'editing the rate leaves it unticked');
  assert.ok(by("Ahrim's hood").dry.chance > 0);
  await call(`/collection-log/${hood.id}`, 'PUT', { kc: 100 });
  c = await call('/collection-log');
  assert.deepEqual([by("Ahrim's hood").kc, by("Ahrim's hood").kcFrom], [100, 'manual']);
  assert.equal((await call(`/collection-log/${hood.id}`, 'PUT', { rate: 'lots' })).error, 'Enter a drop rate like 1/512.');

  // Drop tables are cached, and obtained items need no rate.
  const calls = wikiCalls;
  await call('/collection-log');
  assert.equal(wikiCalls, calls);
  await call(`/collection-log/${fang.id}`, 'PUT', { obtained: true });
  c = await call('/collection-log');
  assert.equal(by('Tanzanite fang').dry, null);
});
