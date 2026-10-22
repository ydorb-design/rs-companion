import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createUpstream, parseHiscores, parseWikiSync } from '../src/upstream.js';
import { createApp } from '../src/app.js';
import { parseRequirements, checkRequirements } from '../src/requirements.js';
import { combatLevel, activityGroup } from '../src/routes/stats.js';
import { nextDailyReset } from '../src/routes/timers.js';
import { levelForXp, xpForLevel } from '../public/js/xp.js';

// Sample responses in the shape the real APIs return.
const SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Magic', 'Prayer', 'Ranged'];
function hiscoresFixture(xpBoost = 0, kills = 0) {
  const skills = SKILLS.map((name, i) => ({ id: i + 1, name, rank: 1000 + i, level: 0, xp: 100_000 * (i + 1) + xpBoost }));
  skills.forEach((s) => (s.level = levelForXp(s.xp)));
  skills.push({ id: 8, name: 'Sailing', rank: -1, level: 1, xp: -1 });
  const total = skills.filter((s) => s.xp > 0).reduce((n, s) => n + s.xp, 0);
  return {
    skills: [{ id: 0, name: 'Overall', rank: 50, level: skills.reduce((n, s) => n + s.level, 0), xp: total }, ...skills],
    activities: [
      { id: 0, name: 'Clue Scrolls (all)', rank: 10, score: 42 },
      { id: 1, name: 'Zulrah', rank: 99, score: 100 + kills },
      { id: 2, name: 'Vorkath', rank: -1, score: -1 },
      { id: 3, name: 'Collections Logged', rank: 5, score: 300 },
    ],
  };
}
const WIKISYNC = {
  username: 'Iron Brody',
  timestamp: '2026-10-20T10:00:00Z',
  quests: { '.': 0, "Cook's Assistant": 2, 'Dragon Slayer I': 1, 'Monkey Madness I': 0, 'The Grand Tree': 2, 'Tree Gnome Village': 0 },
  achievement_diaries: { Ardougne: { Easy: { complete: true, tasks: [true] }, Medium: { complete: false, tasks: [false] } } },
  combat_achievements: [1, 4, 9],
};
const WIKI = {
  "Cook's Assistant": '{{Quest details\n|start = Talk to the [[Cook]]\n|requirements = None\n|items = * [[Egg]]\n}}',
  // Served via a redirect to check titles map back to the requested name.
  'Dragon Slayer I (quest)': '{{Quest details\n|difficulty = Experienced\n|requirements =\n* {{SCP|Quest|32|link=yes}} [[Quest points]]\n* {{SCP|Magic|33}} (to cast Telegrab)\n* Ability to enter the [[Champions\' Guild]]\n|items = * [[Anti-dragon shield]]\n}}',
  'Monkey Madness I': '{{Quest details\n|requirements =\n* {{SCP|Combat|43}}\n* Completion of the following quests:\n** [[The Grand Tree]]\n** [[Tree Gnome Village|Tree Gnome Village]]\n|kills = [[Jungle Demon]]\n}}',
  'The Grand Tree': '{{Quest details\n|requirements =\n* {{SCP|Agility|25|link=yes}}\n}}',
};
const MAPPING = [
  { id: 561, name: 'Nature rune', highalch: 4, limit: 18000, members: false, icon: 'Nature rune.png' },
  { id: 1127, name: 'Rune platebody', highalch: 39000, limit: 70, members: false, icon: 'Rune platebody.png' },
  { id: 1319, name: 'Rune 2h sword', highalch: 38400, limit: 70, members: false, icon: 'Rune 2h sword.png' },
];
const LATEST = { data: { 561: { high: 100, low: 95 }, 1127: { high: 38500, low: 38000 }, 1319: { high: 39000, low: 38000 } } };

let xpBoost = 0, kills = 0;
const requested = [];
const alerts = [];
async function fakeFetch(url, opts = {}) {
  requested.push(url);
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (url.startsWith('https://discord.test')) {
    alerts.push(JSON.parse(opts.body).embeds[0].title);
    return json({}, 204);
  }
  if (url.includes('hiscore_oldschool_ironman') && url.includes('Iron%20Brody')) return json(hiscoresFixture(xpBoost, kills));
  if (url.includes('hiscore_oldschool/') && url.includes('Main%20Alt')) return json(hiscoresFixture(0));
  if (url.includes('hiscore')) return json({}, 404);
  if (url.includes('sync.runescape.wiki')) return json(WIKISYNC);
  if (url.includes('api.php')) {
    const titles = new URL(url).searchParams.get('titles').split('|');
    const redirects = titles.includes('Dragon Slayer I') ? [{ from: 'Dragon Slayer I', to: 'Dragon Slayer I (quest)' }] : [];
    const resolved = titles.map((t) => redirects.find((r) => r.from === t)?.to ?? t);
    const pages = resolved.map((title) => (WIKI[title]
      ? { title, revisions: [{ slots: { main: { content: WIKI[title] } } }] }
      : { title, missing: true }));
    return json({ query: { redirects, pages } });
  }
  if (url.endsWith('/mapping')) return json(MAPPING);
  if (url.endsWith('/latest')) return json(LATEST);
  throw new Error(`unexpected ${url}`);
}

let server, base, app, clock = Date.parse('2026-10-21T00:00:00Z');
before(async () => {
  app = createApp({
    db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch, now: () => clock }), now: () => clock, fetch: fakeFetch,
  });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(path, method = 'GET', body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json(), headers: res.headers };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('xp table matches known values', () => {
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(50), 101_333);
  assert.equal(xpForLevel(92), 6_517_253);
  assert.equal(xpForLevel(99), 13_034_431);
  assert.equal(levelForXp(13_034_430), 98);
  assert.equal(levelForXp(200_000_000), 99);
  assert.equal(levelForXp(200_000_000, { virtual: true }), 126);
});

test('parsers handle unranked entries and wikisync shapes', () => {
  const h = parseHiscores(hiscoresFixture());
  assert.equal(h.skills.find((s) => s.name === 'Sailing').xp, 0);
  assert.deepEqual(h.activities.map((a) => a.name), ['Clue Scrolls (all)', 'Zulrah', 'Collections Logged']);
  const w = parseWikiSync(WIKISYNC);
  assert.equal(w.quests.some((q) => q.name === '.'), false);
  assert.equal(w.quests.find((q) => q.name === 'Dragon Slayer I').state, 'in_progress');
  assert.equal(w.diaries.Ardougne.Easy, true);
  assert.equal(w.combatAchievements, 3);
  assert.equal(parseWikiSync({ combat_achievements: { 1: true, 2: false } }).combatAchievements, 1);
  assert.equal(parseWikiSync({}).combatAchievements, null);
});

test('combat level, activity groups and daily reset', () => {
  const lv = (o) => Object.entries(o).map(([name, level]) => ({ name, level }));
  assert.equal(combatLevel(lv({ Attack: 1, Strength: 1, Defence: 1, Hitpoints: 10, Prayer: 1, Ranged: 1, Magic: 1 })), 3);
  assert.equal(combatLevel(lv({ Attack: 99, Strength: 99, Defence: 99, Hitpoints: 99, Prayer: 99, Ranged: 99, Magic: 99 })), 126);
  assert.equal(activityGroup('Clue Scrolls (hard)'), 'clues');
  assert.equal(activityGroup('Soul Wars Zeal'), 'other');
  assert.equal(activityGroup('Bounty Hunter - Rogue'), 'other');
  assert.equal(activityGroup('Vorkath'), 'bosses');
  assert.equal(nextDailyReset(Date.parse('2026-10-21T13:45:00Z')), Date.parse('2026-10-22T00:00:00Z'));
});

test('requirements parser', () => {
  const known = new Set(Object.keys(WIKISYNC.quests));
  assert.deepEqual(parseRequirements(WIKI['Monkey Madness I'], known, 'Monkey Madness I'),
    { skills: {}, combat: 43, questPoints: null, quests: ['The Grand Tree', 'Tree Gnome Village'] });
  const ds = parseRequirements(WIKI['Dragon Slayer I (quest)'], known, 'Dragon Slayer I');
  assert.deepEqual([ds.skills, ds.questPoints, ds.quests], [{ Magic: 33 }, 32, []]);
  assert.deepEqual(parseRequirements(WIKI["Cook's Assistant"], known).skills, {});
  assert.equal(parseRequirements('No template here', known), null);
  const check = checkRequirements({ skills: { Agility: 25 }, combat: 43, quests: ['The Grand Tree'] },
    { levels: { Agility: 20 }, combatLevel: 50, questStates: { 'The Grand Tree': 'complete' } });
  assert.deepEqual(check, { status: 'locked', missing: [{ type: 'skill', name: 'Agility', level: 25, have: 20 }] });
  assert.equal(checkRequirements(null, {}).status, 'unknown');
});

test('requires an account before tracking', async () => {
  const r = await call('/goals');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /player name/);
  assert.equal((await call('/stats')).body.account, null);
});

test('settings and account validation', async () => {
  assert.equal((await call('/accounts', 'POST', { player: 'x', accountType: 'nope' })).status, 400);
  assert.equal((await call('/accounts', 'POST', { player: 'waytoolongname', accountType: 'main' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { discordWebhook: 'not a url' })).status, 400);
  assert.equal((await call('/settings', 'PUT', { refreshHours: 500 })).status, 400);
  const r = await call('/settings', 'PUT', { refreshHours: 3, discordWebhook: 'https://discord.test/hook' });
  assert.equal(r.body.refreshHours, 3);
  assert.equal(r.body.secret, undefined);
});

test('unknown player gives a clear 404', async () => {
  await call('/accounts', 'POST', { player: 'Wrong Name', accountType: 'ironman' });
  const r = await call('/stats/refresh', 'POST');
  assert.equal(r.status, 404);
  assert.match(r.body.error, /isn't on the Ironman hiscores/);
  await call('/accounts/Wrong Name', 'DELETE');
  const added = await call('/accounts', 'POST', { player: 'Iron Brody', accountType: 'ironman' });
  assert.equal(added.body.active.player, 'Iron Brody');
  assert.equal(added.body.accounts.length, 1);
});

test('stats refresh, gains, history, rates and level-up alerts', async () => {
  assert.equal((await call('/stats/refresh', 'POST')).status, 200);
  await call('/goals', 'POST', { skill: 'Attack', targetXp: 110_000 });
  clock += 60 * 60 * 1000;
  xpBoost = 50_000;
  kills = 7;
  const refreshed = await call('/stats/refresh', 'POST');
  assert.ok(refreshed.body.levelUps.some((l) => l.skill === 'Attack'));
  await settle();
  assert.ok(alerts.some((a) => a.startsWith('Attack level')));
  assert.ok(alerts.includes('Goal complete'));
  clock += 60 * 1000;
  await call('/stats/refresh', 'POST'); // unchanged, should not add a row

  const stats = (await call('/stats')).body;
  assert.equal(stats.latest.skills.length, 9);
  assert.equal(stats.gains.day.find((g) => g.name === 'Attack').xp, 50_000);
  assert.ok(stats.combatLevel > 3);

  assert.equal((await call('/stats/history?skill=Attack&days=30')).body.points.length, 2);
  const kc = (await call('/stats/history?activity=Zulrah&days=30')).body.points;
  assert.deepEqual(kc.map((p) => p.score), [100, 107]);

  const rates = (await call('/stats/rates')).body;
  assert.equal(Math.round(rates.week.Attack), 50_000); // spread over a minimum of one day
});

test('activities: groups and gains', async () => {
  const a = (await call('/activities')).body;
  assert.deepEqual(a.activities.map((x) => x.group), ['clues', 'bosses', 'other']);
  assert.equal(a.gains.day.Zulrah, 7);
  assert.equal(a.gains.day['Clue Scrolls (all)'], 0);
});

test('goals compute remaining xp, actions and hours', async () => {
  const created = await call('/goals', 'POST', { skill: 'Strength', targetLevel: 70, xpPerAction: 100, xpPerHour: 50000 });
  assert.equal(created.status, 201);
  const g = created.body;
  assert.equal(g.targetXp, xpForLevel(70));
  assert.equal(g.remainingXp, xpForLevel(70) - 250_000);
  assert.equal(g.actions, Math.ceil(g.remainingXp / 100));
  assert.equal((await call('/goals', 'POST', { skill: 'Overall', targetLevel: 99 })).status, 400);
  assert.equal((await call('/goals')).body.length, 2);
  await call(`/goals/${g.id}`, 'DELETE');
  assert.equal((await call('/goals')).body.length, 1);
});

test('quests, requirements, diaries and combat achievements', async () => {
  let p = (await call('/progress')).body;
  assert.equal(p.quests.length, 0);
  assert.equal(p.diaries.length, 12);
  await call('/progress/sync', 'POST');
  p = (await call('/progress')).body;
  const q = Object.fromEntries(p.quests.map((x) => [x.name, x]));
  assert.equal(q['Dragon Slayer I'].state, 'in_progress');
  assert.equal(q["Cook's Assistant"].check.status, 'ready');
  assert.equal(q['Dragon Slayer I'].requirements.questPoints, 32);
  assert.equal(q['Monkey Madness I'].check.status, 'locked');
  assert.deepEqual(q['Monkey Madness I'].check.missing.map((m) => m.name), ['Tree Gnome Village']);
  assert.equal(q['Tree Gnome Village'].check.status, 'unknown'); // page missing
  assert.equal(p.combatAchievements.completed, 3);
  assert.ok(p.requirementsLoaded);

  // Manual override unlocks the dependant quest.
  await call('/progress/quest', 'PUT', { name: 'Tree Gnome Village', state: 'complete' });
  p = (await call('/progress')).body;
  assert.equal(p.quests.find((x) => x.name === 'Monkey Madness I').check.status, 'ready');

  await call('/progress/diary', 'PUT', { region: 'Varrock', tier: 'Hard', complete: true });
  p = (await call('/progress')).body;
  assert.equal(p.diaries.find((d) => d.region === 'Varrock').tiers[2].manual, true);
  assert.equal((await call('/progress/diary', 'PUT', { region: 'Atlantis', tier: 'Easy', complete: true })).status, 400);

  assert.equal((await call('/progress/combat-achievements', 'PUT', { tier: 'Elite' })).status, 200);
  assert.equal((await call('/progress')).body.combatAchievements.tier, 'Elite');
  assert.equal((await call('/progress/combat-achievements', 'PUT', { tier: 'Legend' })).status, 400);

  const wikiCalls = requested.filter((u) => u.includes('api.php')).length;
  await call('/progress/sync', 'POST');
  assert.equal(requested.filter((u) => u.includes('api.php')).length, wikiCalls, 'requirements are cached');
  await call('/progress/requirements', 'POST');
  assert.equal(requested.filter((u) => u.includes('api.php')).length, wikiCalls + 1, 'manual reload refetches');
});

test('multiple accounts keep separate data', async () => {
  await call('/accounts', 'POST', { player: 'Main Alt', accountType: 'main' });
  assert.equal((await call('/goals')).body.length, 0);
  await call('/stats/refresh', 'POST');
  assert.equal((await call('/stats')).body.account.player, 'Main Alt');
  await call('/accounts/active', 'PUT', { player: 'iron_brody' });
  assert.equal((await call('/goals')).body.length, 1);
  assert.equal((await call('/accounts/active', 'PUT', { player: 'Nobody' })).status, 400);
  const settings = (await call('/settings')).body;
  assert.deepEqual(settings.accounts.map((a) => a.player), ['Iron Brody', 'Main Alt']);
});

test('timers: presets, custom, restart and alerts', async () => {
  const t = await call('/timers', 'POST', { preset: 'herbs' });
  assert.equal(t.body.endsAt - t.body.startedAt, 80 * 60 * 1000);
  const daily = (await call('/timers', 'POST', { preset: 'daily' })).body;
  assert.equal(daily.endsAt, nextDailyReset(clock));
  assert.equal((await call('/timers', 'POST', { label: 'Contract', minutes: 0 })).status, 400);
  const custom = (await call('/timers', 'POST', { label: 'Tithe', minutes: 30 })).body;

  clock += 31 * 60 * 1000;
  alerts.length = 0;
  app.jobs.checkTimers();
  await settle();
  assert.deepEqual(alerts, ['Tithe ready']);
  app.jobs.checkTimers();
  await settle();
  assert.equal(alerts.length, 1, 'each timer alerts once');

  const restarted = (await call(`/timers/${custom.id}/restart`, 'POST')).body;
  assert.equal(restarted.done, false);
  const list = (await call('/timers')).body;
  assert.equal(list.timers.length, 3);
  assert.ok(list.presets.length >= 5);
  await call(`/timers/${t.body.id}`, 'DELETE');
  assert.equal((await call('/timers')).body.timers.length, 2);
});

test('notification test endpoint', async () => {
  alerts.length = 0;
  assert.equal((await call('/notifications/test', 'POST')).status, 200);
  assert.deepEqual(alerts, ['Test alert']);
  await call('/settings', 'PUT', { discordWebhook: '' });
  assert.equal((await call('/notifications/test', 'POST')).status, 400);
});

test('price search, alch profit and watchlist', async () => {
  const results = (await call('/prices/search?q=rune')).body;
  assert.equal(results[0].name, 'Rune 2h sword');
  const plate = results.find((r) => r.id === 1127);
  assert.equal(plate.alchProfit, 39000 - 38500 - 100);
  await call('/prices/watchlist', 'POST', { id: 1127 });
  await call('/prices/watchlist', 'POST', { id: 1127 });
  assert.equal((await call('/prices/watchlist')).body.length, 1);
  await call('/prices/watchlist/1127', 'DELETE');
  assert.equal((await call('/prices/watchlist')).body.length, 0);
});

test('tasks board and templates', async () => {
  assert.equal((await call('/tasks', 'POST', { title: '  ' })).status, 400);
  const t = (await call('/tasks', 'POST', { title: 'Fire cape', category: 'Bosses' })).body;
  const moved = (await call(`/tasks/${t.id}`, 'PUT', { status: 'doing', notes: 'Bring brews' })).body;
  assert.deepEqual([moved.status, moved.notes], ['doing', 'Bring brews']);
  assert.equal((await call(`/tasks/${t.id}`, 'PUT', { status: 'archived' })).status, 400);

  const templates = (await call('/tasks/templates')).body;
  const gear = templates.find((x) => x.id === 'iron-gear');
  assert.equal(gear.remaining, gear.count - 1); // Fire cape already on the board
  const { added } = (await call('/tasks/templates/iron-gear', 'POST')).body;
  assert.equal(added, gear.count - 1);
  assert.equal((await call('/tasks/templates/iron-gear', 'POST')).body.added, 0);
  assert.equal((await call('/tasks/templates/nope', 'POST')).status, 400);
});

test('static frontend and unknown api routes', async () => {
  const res = await fetch(base.replace('/api', '/'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /RS Companion/);
  assert.equal((await call('/nope')).status, 404);
});

test('migrates the single player from version 0.1', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO settings (key, value) VALUES ('player', '\"Old Iron\"'), ('accountType', '\"hardcore\"')").run();
  const { ctx } = createApp({ db, upstream: createUpstream({ fetch: fakeFetch }) });
  assert.deepEqual(ctx.allAccounts().map((a) => [a.player, a.accountType]), [['Old Iron', 'hardcore']]);
  ctx.saveSettings({ accounts: [] });
  assert.equal(ctx.allAccounts().length, 0, 'deleted account stays deleted');
});

test('password login', async () => {
  const locked = createApp({ db: openDb(':memory:'), upstream: createUpstream({ fetch: fakeFetch }), password: 'hunter2' });
  let srv;
  await new Promise((r) => (srv = locked.listen(0, r)));
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  try {
    assert.equal((await fetch(`${url}/settings`)).status, 401);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.deepEqual(await (await fetch(`${url}/auth`)).json(), { required: true, authenticated: false });
    const post = (body) => fetch(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ password: 'wrong' })).status, 401);
    const ok = await post({ password: 'hunter2' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${url}/settings`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${url}/settings`, { headers: { cookie: 'rsc_session=forged' } })).status, 401);
  } finally {
    srv.close();
  }
});
