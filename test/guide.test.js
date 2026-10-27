import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { GUIDE_STAGES, GUIDE_STEPS, evaluateStep } from '../src/guide.js';

test('guide data is well formed', () => {
  const ids = GUIDE_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const stages = new Set(GUIDE_STAGES.map((s) => s.id));
  for (const s of GUIDE_STEPS) {
    assert.ok(stages.has(s.stage), `${s.id} stage`);
    assert.ok(['quest', 'gear', 'item', 'skill', 'diary'].includes(s.category), `${s.id} category`);
    assert.ok(s.title && s.why && s.why.length > 20, `${s.id} has a reason`);
    for (const c of [...(s.requires || []), ...(s.done || [])]) {
      assert.ok(c.skill || c.quest || c.diary || c.item, `${s.id} check type`);
      if (c.skill) assert.ok(c.level >= 1 && c.level <= 99, `${s.id} level`);
    }
  }
});

test('step status: done, ready or locked', () => {
  const base = { levels: {}, questStates: {}, diaries: {}, obtained: new Set(), manual: new Set() };
  const whip = GUIDE_STEPS.find((s) => s.id === 'whip');
  assert.equal(evaluateStep(whip, base).status, 'locked');
  assert.equal(evaluateStep(whip, { ...base, levels: { Attack: 70, Slayer: 85 } }).status, 'ready');
  assert.equal(evaluateStep(whip, { ...base, obtained: new Set(['abyssal whip']) }).status, 'done');
  const fairy = GUIDE_STEPS.find((s) => s.id === 'fairy-rings');
  assert.equal(evaluateStep(fairy, { ...base, questStates: { 'fairytale ii - cure a queen': 'in_progress' } }).status, 'done');
  const graceful = GUIDE_STEPS.find((s) => s.id === 'graceful');
  assert.equal(evaluateStep(graceful, base).status, 'todo');
  const ds1 = GUIDE_STEPS.find((s) => s.id === 'ds1');
  assert.equal(evaluateStep(ds1, { ...base, questRequirements: () => [{ label: '32 quest points', met: false }] }).status, 'locked');
  assert.equal(evaluateStep(ds1, { ...base, questRequirements: () => [{ label: 'Quest requirements', met: true }] }).status, 'ready');
  assert.equal(evaluateStep(graceful, { ...base, manual: new Set(['graceful']) }).status, 'done');
});

let server, url;
before(async () => {
  const fake = async (u) => {
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (u.includes('hiscore')) return json({ skills: [{ name: 'Overall', rank: 1, level: 100, xp: 1 }, { name: 'Prayer', rank: 1, level: 45, xp: 61512 }, { name: 'Herblore', rank: 1, level: 40, xp: 37224 }], activities: [] });
    if (u.includes('sync')) return json({ quests: { 'Waterfall Quest': 2, 'Lost City': 1 }, achievement_diaries: { Ardougne: { Easy: { complete: true } } } });
    if (u.includes('api.php')) return json({ query: { pages: [] } });
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

test('guide route reflects the account', async () => {
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  await call('/stats/refresh', 'POST');
  await call('/progress/sync', 'POST');
  let g = await call('/guide');
  const by = (id) => g.steps.find((s) => s.id === id);
  assert.equal(by('waterfall').status, 'done');
  assert.equal(by('lost-city').status, 'todo', 'no wiki requirements loaded in this test');
  assert.equal(by('ardy-cloak').status, 'done');
  assert.equal(by('protect-prayers').status, 'done');
  assert.equal(by('prayer-pots').status, 'done');
  assert.equal(by('restores').status, 'todo');

  await call('/guide/graceful', 'PUT', { done: true });
  g = await call('/guide');
  assert.deepEqual([by('graceful').status, by('graceful').manual], ['done', true]);
  await call('/guide/graceful', 'PUT', { done: false });
  g = await call('/guide');
  assert.equal(by('graceful').status, 'todo');

  assert.equal((await call('/guide/fire-cape/task', 'POST')).added, true);
  assert.equal((await call('/guide/fire-cape/task', 'POST')).added, false);
  g = await call('/guide');
  assert.equal(by('fire-cape').onBoard, true);
  const tasks = await call('/tasks');
  assert.equal(tasks.find((t) => t.title === 'Fire cape').category, 'Iron guide');
  assert.equal((await call('/guide/nope', 'PUT', { done: true })).error, 'Unknown guide step.');
});
