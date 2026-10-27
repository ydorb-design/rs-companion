import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { GUIDES, evaluateStep } from '../src/guides/index.js';
import { iron } from '../src/guides/iron.js';
import { parseQuestRoute, questRouteSteps } from '../src/guides/questRoute.js';

test('guide data is well formed', () => {
  for (const g of GUIDES) {
    const ids = g.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${g.id}: unique ids`);
    const stages = new Set(g.stages.map((s) => s.id));
    const categories = new Set((g.categories || []).map(([id]) => id));
    for (const s of g.steps) {
      assert.ok(stages.has(s.stage), `${g.id}/${s.id} stage`);
      if (categories.size) assert.ok(categories.has(s.category), `${g.id}/${s.id} category`);
      assert.ok(s.title && s.why && s.why.length > 20, `${g.id}/${s.id} has a reason`);
      for (const c of [...(s.requires || []), ...(s.done || [])]) {
        assert.ok(c.skill || c.quest || c.diary || c.item || c.kc || c.points || c.combat, `${g.id}/${s.id} check type`);
        if (c.skill) assert.ok(c.level >= 1 && c.level <= 99, `${g.id}/${s.id} level`);
      }
    }
  }
});

test('step status: done, ready or locked', () => {
  const base = { levels: {}, questStates: {}, diaries: {}, obtained: new Set(), kc: {}, manual: new Set() };
  const step = (g, id) => GUIDES.find((x) => x.id === g).steps.find((s) => s.id === id);
  const whip = step('iron', 'whip');
  assert.equal(evaluateStep(whip, base).status, 'locked');
  assert.equal(evaluateStep(whip, { ...base, levels: { Attack: 70, Slayer: 85 } }).status, 'ready');
  assert.equal(evaluateStep(whip, { ...base, obtained: new Set(['abyssal whip']) }).status, 'done');
  const fairy = step('iron', 'fairy-rings');
  assert.equal(evaluateStep(fairy, { ...base, questStates: { 'fairytale ii - cure a queen': 'in_progress' } }).status, 'done');
  const graceful = step('iron', 'graceful');
  assert.equal(evaluateStep(graceful, base).status, 'todo');
  assert.equal(evaluateStep(graceful, { ...base, manual: new Set(['graceful']) }).status, 'done');
  const ds1 = step('iron', 'ds1');
  assert.equal(evaluateStep(ds1, { ...base, questRequirements: () => [{ label: '32 quest points', met: false }] }).status, 'locked');
  assert.equal(evaluateStep(ds1, { ...base, questRequirements: () => [{ label: 'Quest requirements', met: true }] }).status, 'ready');

  // Skill methods: ready from their level, done once you reach the next method's level.
  const canifis = step('skills', 'agility-canifis-rooftop-course');
  const pip = { 'priest in peril': 'complete' };
  assert.equal(evaluateStep(canifis, { ...base, levels: { Agility: 45 }, questStates: pip }).status, 'ready');
  assert.equal(evaluateStep(canifis, { ...base, levels: { Agility: 60 }, questStates: pip }).status, 'done');
  // Bosses tick off with a kill count, Slayer unlocks need points, Slayer masters need combat.
  assert.equal(evaluateStep(step('bosses', 'zulrah'), { ...base, kc: { zulrah: 3 } }).status, 'done');
  assert.equal(evaluateStep(step('slayer', 'helm'), { ...base, levels: { Crafting: 55 }, slayerPoints: 399 }).status, 'locked');
  assert.equal(evaluateStep(step('slayer', 'helm'), { ...base, levels: { Crafting: 55 }, slayerPoints: 400 }).status, 'ready');
  assert.equal(evaluateStep(step('skills', 'slayer-nieve'), { ...base, combatLevel: 85 }).status, 'ready');
  // Diaries need their levels and quests.
  const ardy = step('diaries', 'ardougne-easy');
  assert.equal(evaluateStep(ardy, base).status, 'locked');
  assert.equal(evaluateStep(ardy, { ...base, levels: { Thieving: 5 }, questStates: { biohazard: 'complete', 'rune mysteries': 'complete' } }).status, 'ready');
  assert.equal(evaluateStep(ardy, { ...base, diaries: { Ardougne: { Easy: true } } }).status, 'done');
});

// A cut-down copy of the wiki's route table.
const ROUTE_PAGE = `Intro
{| class="wikitable lighttable sticky-header" data-tableid="OQG-Ironman"
!Quest/Action
|- data-rowid="Cook's Assistant"
|[[Cook's Assistant]]
|[[Cook's Assistant/Quick guide|QG]]
|{{Optimal quest|cooking=300}}
|{{Optimal quest/qp|1}}
|{{Checklist|
*Talk to the [[Cook (Lumbridge)|Cook]] on the {{FloorNumber|uk=0}}.
**Buy {{Coins|100}} worth of [[rope]]s.
}}
|[[Lumbridge]]
|- data-rowid="Partial completion of Pirate's Treasure"
|Partially complete: [[Pirate's Treasure]]
|''N/A''
|
|
|
|- data-rowid="Waterfall Quest"
|[[Waterfall Quest]]
|QG
|
|
|{{Optimal quest/train|agility|25}}
{{Checklist|
*Bring a rope.
}}
|- data-rowid="Easy Ardougne Diary"
|Easy [[Ardougne Diary]]
|
|- data-rowid="All Easy Achievement Diaries"
|All Easy [[Achievement Diaries]]
|
|- data-rowid="Stronghold of Security"
|Unlock: [[Stronghold of Security]]
|
|-
! colspan="7" |Train {{SCP|Combat}} [[Combat]] to 85 (Use Slayer to 69 for efficiency)
|- data-rowid="Alfred Grimhand's Barcrawl"
|[[Alfred Grimhand's Barcrawl]] (miniquest)
|- data-rowid="The Grand Tree"
| data-sort-value="Grand Tree, The" |[[The Grand Tree]]
|}
More text`;

test('reads the wiki quest route', () => {
  const route = parseQuestRoute(ROUTE_PAGE);
  assert.deepEqual(route.map((r) => r.type), ['quest', 'start', 'train', 'quest', 'diary', 'diary', 'unlock', 'combat', 'quest', 'quest']);
  assert.deepEqual(route[0].notes, ['Talk to the Cook on the ground floor.', 'Buy 100 coins worth of ropes.']);
  assert.deepEqual(route[2], { type: 'train', skill: 'Agility', level: 25, notes: [] });
  assert.equal(route[9].name, 'The Grand Tree');
  assert.equal(parseQuestRoute('no table here'), null);

  const steps = questRouteSteps(route, { regions: ['Ardougne', 'Varrock'], keyQuests: { 'waterfall quest': 'Lots of XP.' } });
  assert.deepEqual(steps.map((s) => s.title), [
    "Cook's Assistant", "Start Pirate's Treasure", 'Train Agility to 25', 'Waterfall Quest', 'Easy Ardougne Diary',
    'All Easy diaries', 'Unlock Stronghold of Security', 'Train combat to 85', "Alfred Grimhand's Barcrawl (miniquest)", 'The Grand Tree',
  ]);
  assert.deepEqual(steps[1].done, [{ quest: "Pirate's Treasure", started: true }]);
  assert.equal(steps[3].why, 'Lots of XP.');
  assert.equal(steps[5].done.length, 2);
  assert.deepEqual(steps[7].done, [{ combat: 85 }]);
});

let server, url, routeFetches = 0;
before(async () => {
  const fake = async (u) => {
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (u.includes('hiscore')) {
      return json({
        skills: [{ name: 'Overall', rank: 1, level: 100, xp: 1 }, { name: 'Prayer', rank: 1, level: 45, xp: 61512 }, { name: 'Herblore', rank: 1, level: 40, xp: 37224 }],
        activities: [{ name: 'Zulrah', rank: 1, score: 12 }],
      });
    }
    if (u.includes('sync')) return json({ quests: { 'Waterfall Quest': 2, 'Lost City': 1, "Cook's Assistant": 2 }, achievement_diaries: { Ardougne: { Easy: { complete: true } } } });
    if (u.includes('Optimal')) {
      routeFetches += 1;
      return json({ query: { pages: [{ title: 'Optimal quest guide/Ironman', revisions: [{ slots: { main: { content: ROUTE_PAGE } } }] }] } });
    }
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

test('guide routes reflect the account', async () => {
  await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  await call('/stats/refresh', 'POST');
  await call('/progress/sync', 'POST');

  const list = await call('/guides');
  assert.deepEqual(list.map((g) => g.id), GUIDES.map((g) => g.id));
  assert.ok(list.find((g) => g.id === 'iron').done >= 4);

  let g = await call('/guides/iron');
  const by = (id) => g.steps.find((s) => s.id === id);
  assert.equal(by('waterfall').status, 'done');
  assert.equal(by('lost-city').status, 'todo', 'no wiki requirements loaded in this test');
  assert.equal(by('ardy-cloak').status, 'done');
  assert.equal(by('protect-prayers').status, 'done');
  assert.equal(by('restores').status, 'todo');

  // Manual ticks are kept per guide.
  await call('/guides/iron/graceful', 'PUT', { done: true });
  await call('/guides/farming/seed-box', 'PUT', { done: true });
  g = await call('/guides/iron');
  assert.deepEqual([by('graceful').status, by('graceful').manual], ['done', true]);
  assert.equal(by('seed-box').status, 'todo', 'the iron guide has its own seed box step');
  g = await call('/guides/farming');
  assert.equal(by('seed-box').status, 'done');
  await call('/guides/iron/graceful', 'PUT', { done: false });
  g = await call('/guides/iron');
  assert.equal(by('graceful').status, 'todo');

  g = await call('/guides/bosses');
  assert.equal(by('zulrah').status, 'done', 'from the hiscores kill count');

  // The quest route comes from the wiki, is cached, and tracks quests from WikiSync.
  g = await call('/guides/quests');
  assert.equal(g.routeError, null);
  assert.equal(by('cook-s-assistant').status, 'done');
  assert.equal(by('waterfall-quest').status, 'done');
  assert.equal(by('waterfall-quest').key, true);
  assert.equal(by('diary-ardougne-easy').status, 'done');
  assert.equal(by('the-grand-tree').status, 'todo');
  assert.ok(by('cook-s-assistant').notes.length);
  await call('/guides/quests');
  assert.equal(routeFetches, 1, 'route is cached');
  assert.deepEqual(await call('/guides/quests/reload', 'POST'), { steps: 10 });
  assert.equal(routeFetches, 2);
  await call('/guides/quests/unlock-stronghold-of-security', 'PUT', { done: true });
  g = await call('/guides/quests');
  assert.equal(by('unlock-stronghold-of-security').status, 'done');

  assert.equal((await call('/guides/iron/fire-cape/task', 'POST')).added, true);
  assert.equal((await call('/guides/iron/fire-cape/task', 'POST')).added, false);
  g = await call('/guides/iron');
  assert.equal(by('fire-cape').onBoard, true);
  const tasks = await call('/tasks');
  assert.equal(tasks.find((t) => t.title === 'Fire cape').category, 'Iron guide');
  assert.equal((await call('/guides/iron/nope', 'PUT', { done: true })).error, 'Unknown guide step.');
  assert.equal((await call('/guides/nope')).error, 'Unknown guide.');
});
