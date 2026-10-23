import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { formatDuration, parseDuration } from '../src/routes/dink.js';

// Payload shapes from https://github.com/pajlads/DinkPlugin/blob/master/docs/json-examples.md
const base = { playerName: 'Iron Brody', accountType: 'IRONMAN', dinkAccountHash: 'abc', content: '', embeds: [] };
const MAPPING = [{ id: 4151, name: 'Abyssal whip', icon: 'Abyssal whip.png' }, { id: 10372, name: 'Zamorak chaps', icon: 'Zamorak chaps.png' }];
async function fakeFetch(url) {
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  if (url.endsWith('/mapping')) return json(MAPPING);
  if (url.endsWith('/latest')) return json({ data: { 4151: { high: 1_500_000 } } });
  if (url.includes('sync.runescape.wiki')) {
    return json({ quests: { 'Dragon Slayer I': 1, 'Lost City': 2 }, achievement_diaries: { Varrock: { Easy: { complete: true } } } });
  }
  if (url.includes('api.php')) {
    return json({ query: { pages: [{ title: 'Dragon Slayer I', revisions: [{ slots: { main: { content: '{{Quest details\n|requirements =\n* {{SCP|Quest|32}}\n|items = x\n}}' } } }] }] } });
  }
  throw new Error(`unexpected ${url}`);
}

let server, base_, path, clock = Date.parse('2026-10-23T10:00:00Z');
before(async () => {
  const app = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch }), now: () => clock, fetch: fakeFetch, password: 'pw' });
  await new Promise((r) => (server = app.listen(0, r)));
  base_ = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

let cookie;
async function call(p, method = 'GET', body) {
  const res = await fetch(base_ + '/api' + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const dink = (payload, url = path) => fetch(base_ + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...payload }) });

test('duration helpers', () => {
  assert.equal(parseDuration('PT46M34S'), 2794);
  assert.equal(parseDuration('PT1H2M3.4S'), 3723.4);
  assert.equal(parseDuration('nope'), null);
  assert.equal(formatDuration(2794), '46:34');
  assert.equal(formatDuration(58.2), '0:58.2');
  assert.equal(formatDuration(3723), '1:02:03');
});

test('setup: sign in, add account, get the Dink address', async () => {
  const res = await fetch(base_ + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  await call('/progress/sync', 'POST');
  await call('/slayer/points', 'PUT', { points: 100 });
  const d = (await call('/dink-config')).body;
  assert.match(d.path, /^\/api\/dink\/[\w-]{20,}$/);
  path = d.path;
});

test('rejects a wrong token without signing in', async () => {
  assert.equal((await dink({ type: 'LEVEL', extra: {} }, '/api/dink/wrong')).status, 404);
});

test('ignores other players and unused types', async () => {
  assert.equal((await dink({ playerName: 'Someone Else', type: 'LOOT', extra: {} })).status, 202);
  assert.equal((await dink({ type: 'XP_MILESTONE', extra: {} })).status, 202);
  const recent = (await call('/dink-config')).body.recent;
  assert.match(recent[0].outcome, /not used/);
  assert.match(recent[1].outcome, /not added/);
});

test('loot from JSON', async () => {
  const res = await dink({
    type: 'LOOT',
    extra: { items: [{ id: 4151, quantity: 1, priceEach: 1_500_000, name: 'Abyssal whip' }, { id: 995, quantity: 5000, priceEach: 1, name: 'Coins' }], source: 'Abyssal demon', killCount: 412, category: 'NPC' },
  });
  assert.equal(res.status, 204);
  const d = (await call('/drops')).body;
  assert.equal(d.totals.count, 2);
  assert.equal(d.totals.value, 1_505_000);
  assert.equal(d.drops.find((x) => x.itemName === 'Abyssal whip').icon, 'Abyssal whip.png');
  const feed = (await call('/activity?type=drop')).body;
  assert.deepEqual([feed.length, feed[0].title], [1, '2 items from Abyssal demon']);
  assert.equal((await call('/bosses/Abyssal%20demon')).body.kc, 412);
});

test('loot with a screenshot (multipart)', async () => {
  const boundary = '----dinktest';
  const payload = JSON.stringify({ ...base, type: 'LOOT', extra: { items: [{ id: 4151, quantity: 1, priceEach: 1_500_000, name: 'Abyssal whip' }], source: 'Abyssal demon' } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.alloc(2048, 7),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(base_ + path, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
  assert.equal(res.status, 204);
  assert.equal((await call('/drops')).body.totals.count, 3);
});

test('collection log slot ticks the list or adds it', async () => {
  await call('/collection-log', 'POST', { itemId: 10372, source: 'Hard clues' });
  await dink({ type: 'COLLECTION', extra: { itemName: 'Zamorak chaps', itemId: 10372, completedEntries: 420, totalEntries: 1443, dropperName: 'Clue Scroll (Hard)' } });
  await dink({ type: 'COLLECTION', extra: { itemName: 'Pet snakeling', itemId: 12921, completedEntries: 421, totalEntries: 1443, dropperName: 'Zulrah' } });
  const c = (await call('/collection-log')).body;
  assert.equal(c.items.length, 2);
  assert.ok(c.items.every((i) => i.obtainedAt));
  assert.deepEqual([c.live.completed, c.live.total], [421, 1443]);
  // A repeat doesn't duplicate.
  await dink({ type: 'COLLECTION', extra: { itemName: 'Pet snakeling', itemId: 12921 } });
  assert.equal((await call('/collection-log')).body.items.length, 2);
});

test('levels, deduplicated against hiscores events', async () => {
  await dink({ type: 'LEVEL', extra: { levelledSkills: { Attack: 61, Strength: 127 }, allSkills: {}, combatLevel: { value: 90 } } });
  await dink({ type: 'LEVEL', extra: { levelledSkills: { Attack: 61 } } });
  const feed = (await call('/activity?type=level')).body;
  assert.deepEqual(feed.map((e) => e.title), ['Attack level 61']);
});

test('kill counts, milestones and personal bests', async () => {
  await dink({ type: 'KILL_COUNT', extra: { boss: 'Zulrah', count: 99, time: 'PT1M5S' } });
  await dink({ type: 'KILL_COUNT', extra: { boss: 'Zulrah', count: 100, time: 'PT58.2S', isPersonalBest: true } });
  await dink({ type: 'KILL_COUNT', extra: { boss: 'Zulrah', count: 101, time: 'PT1M1S', isPersonalBest: false, personalBest: 'PT58.2S' } });
  const z = (await call('/bosses/Zulrah')).body;
  assert.deepEqual([z.kc, z.personalBest], [101, 58.2]);
  const titles = (await call('/activity')).body.map((e) => e.title);
  assert.ok(titles.includes('Zulrah: 100 kills'));
  assert.ok(titles.includes('New personal best: Zulrah'));
});

test('slayer task completion', async () => {
  await call('/slayer/task', 'POST', { monster: 'Abyssal demons', amount: 150, master: 'Duradel' });
  await dink({ type: 'SLAYER', extra: { slayerTask: '150 Abyssal demons', slayerCompleted: '1,230', slayerPoints: '15', killCount: 150, monster: 'Abyssal demons' } });
  let s = (await call('/slayer')).body;
  assert.equal(s.current, null);
  assert.deepEqual([s.history[0].monster, s.history[0].master, s.history[0].points, s.points, s.gameTasks], ['Abyssal demons', 'Duradel', 15, 115, 1230]);
  // Without an active task, it records the task from Dink's details.
  await dink({ type: 'SLAYER', extra: { slayerTask: '120 Hellhounds', slayerCompleted: '1231', slayerPoints: '15', monster: 'Hellhounds' } });
  s = (await call('/slayer')).body;
  assert.deepEqual([s.history[0].monster, s.history[0].amount, s.points], ['Hellhounds', 120, 130]);
});

test('quests, quest points and diaries update progress', async () => {
  let p = (await call('/progress')).body;
  const ds = () => p.quests.find((q) => q.name === 'Dragon Slayer I');
  assert.equal(ds().check.status, 'ready', 'quest points unknown, so not checked');
  await dink({ type: 'QUEST', extra: { questName: 'Lost City', completedQuests: 22, totalQuests: 156, questPoints: 20, totalQuestPoints: 293 } });
  p = (await call('/progress')).body;
  assert.equal(p.questPoints, 20);
  assert.deepEqual([ds().check.status, ds().check.missing[0].type], ['locked', 'qp']);

  await dink({ type: 'QUEST', extra: { questName: 'Dragon Slayer I', questPoints: 34 } });
  p = (await call('/progress')).body;
  assert.equal(ds().state, 'complete');
  assert.equal(ds().manual, false, 'updates the synced data, not a manual override');

  await dink({ type: 'ACHIEVEMENT_DIARY', extra: { area: 'Kourend & Kebos', difficulty: 'HARD', total: 15 } });
  p = (await call('/progress')).body;
  assert.equal(p.diaries.find((d) => d.region === 'Kourend & Kebos').tiers[2].complete, true);
});

test('combat achievements, clues, pets and deaths go to the feed', async () => {
  await dink({ type: 'COMBAT_ACHIEVEMENT', extra: { tier: 'MASTER', task: 'Peach Conjurer', taskPoints: 5, totalPoints: 1337, totalPossiblePoints: 14814, justCompletedTier: 'ELITE' } });
  const p = (await call('/progress')).body;
  assert.equal(p.combatAchievements.tier, 'Elite');
  assert.equal(p.combatAchievements.points.total, 1337);
  await dink({ type: 'CLUE', extra: { clueType: 'Hard', numberCompleted: 123, items: [{ id: 1, quantity: 2, priceEach: 1000, name: 'x' }] } });
  await dink({ type: 'PET', extra: { petName: 'Ikkle hydra', duplicate: false } });
  await dink({ type: 'DEATH', extra: { valueLost: 3000, isPvp: false, killerName: 'Vorkath' } });
  const titles = (await call('/activity')).body.map((e) => e.title);
  for (const t of ['Combat task: Peach Conjurer', 'Elite combat achievements complete', 'Hard clue #123', 'New pet: Ikkle hydra', 'Died to Vorkath']) {
    assert.ok(titles.includes(t), t);
  }
});

test('token can be changed, and the old one stops working', async () => {
  const old = path;
  path = (await call('/dink-config/token', 'POST')).body.path;
  assert.notEqual(path, old);
  assert.equal((await dink({ type: 'PET', extra: {} }, old)).status, 404);
  assert.equal((await dink({ type: 'PET', extra: {} })).status, 204);
  const backup = (await call('/export')).body;
  assert.equal(backup.settings.dinkToken, undefined);
});
