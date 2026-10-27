// Guides, checked against the account's stats, quests, diaries, collection log, kill counts and Slayer points.
import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';
import { GUIDES, evaluateStep, guideById, progressId } from '../guides/index.js';
import { iron } from '../guides/iron.js';
import { ROUTE_PAGE, parseQuestRoute, questRouteSteps } from '../guides/questRoute.js';
import { DIARY_REGIONS, DIARY_TIERS } from './progress.js';
import { combatLevel } from './stats.js';
import { checkRequirements } from '../requirements.js';

const ROUTE_MAX_AGE = 7 * DAY;

// Iron guide reasons for the quests it covers, shown on the quest order guide.
const KEY_QUESTS = Object.fromEntries(iron.steps.flatMap((s) => (s.category === 'quest' ? (s.done || []).filter((c) => c.quest).map((c) => [c.quest.toLowerCase(), s.why]) : [])));

export function guideRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  function accountState(key) {
    const latest = ctx.latestSnapshot(key);
    const levels = Object.fromEntries((latest?.skills || []).map((s) => [s.name, s.level]));
    const row = db.prepare('SELECT data FROM wikisync WHERE player = ?').get(key);
    const synced = row ? JSON.parse(row.data) : { quests: [], diaries: {} };
    const questStates = {};
    for (const q of synced.quests || []) questStates[q.name.toLowerCase()] = q.state;
    for (const o of db.prepare('SELECT name, state FROM quest_overrides WHERE player = ?').all(key)) questStates[o.name.toLowerCase()] = o.state;
    const diaries = {};
    for (const region of DIARY_REGIONS) {
      diaries[region] = {};
      for (const tier of DIARY_TIERS) diaries[region][tier] = Boolean(synced.diaries?.[region]?.[tier]);
    }
    for (const o of db.prepare('SELECT region, tier, complete FROM diary_overrides WHERE player = ?').all(key)) {
      if (diaries[o.region]) diaries[o.region][o.tier] = Boolean(o.complete);
    }
    const obtained = new Set(db.prepare('SELECT item_name FROM clog_items WHERE player = ? AND obtained_at IS NOT NULL').all(key).map((i) => i.item_name.toLowerCase()));
    const manualIds = new Set(db.prepare('SELECT step_id FROM guide_progress WHERE player = ?').all(key).map((x) => x.step_id));

    // Kill counts from the hiscores, or Dink when it's ahead.
    const kc = {};
    for (const a of latest?.activities || []) kc[a.name.toLowerCase()] = a.score;
    for (const b of db.prepare('SELECT boss, count FROM boss_records WHERE player = ?').all(key)) {
      if (b.count != null && b.count > (kc[b.boss.toLowerCase()] ?? -1)) kc[b.boss.toLowerCase()] = b.count;
    }

    // Quest steps use the requirements loaded from the wiki (the same ones as the Quests page).
    const reqs = new Map(db.prepare('SELECT name, data FROM quest_requirements').all().map((q) => [q.name.toLowerCase(), JSON.parse(q.data)]));
    const cb = latest ? combatLevel(latest.skills) : null;
    const settings = ctx.getSettings();
    const questPoints = settings[`questPoints:${key}`] ?? null;
    const statesByName = Object.fromEntries((synced.quests || []).map((q) => [q.name, questStates[q.name.toLowerCase()]]));
    const questRequirements = (step) => {
      const q = (step.done || []).find((c) => c.quest && !c.started);
      const req = q && reqs.get(q.quest.toLowerCase());
      if (!req) return [];
      const { missing } = checkRequirements(req, { levels, combatLevel: cb, questStates: statesByName, questPoints });
      const label = (m) => (m.type === 'quest' ? m.name : m.type === 'qp' ? `${m.level} quest points` : `${m.level} ${m.name}`);
      // Show what's missing; when nothing is, a single met line for the quest's requirements.
      return missing.length ? missing.map((m) => ({ label: label(m), met: false })) : [{ label: 'Quest requirements', met: true }];
    };
    return {
      levels, questStates, diaries, obtained, kc, manualIds, questRequirements,
      combatLevel: cb, slayerPoints: settings[`slayerPoints:${key}`] ?? null,
      hasStats: Object.keys(levels).length > 0, hasSync: Boolean(row),
    };
  }

  // The wiki's ironman quest route, cached for a week. Returns { route, error }.
  let lastFailure = null;
  async function questRoute(force = false) {
    const cached = ctx.getSettings().questRoute;
    if (!force && cached?.route && now() - cached.fetchedAt < ROUTE_MAX_AGE) return { route: cached.route };
    // Don't retry a failed fetch on every page load.
    if (!force && lastFailure && now() - lastFailure.at < 10 * 60 * 1000) return { route: cached?.route || null, error: lastFailure.error };
    try {
      const page = (await ctx.upstream.wikiPages([ROUTE_PAGE]))[ROUTE_PAGE];
      const route = page && parseQuestRoute(page);
      if (!route) throw new Error('the page layout has changed');
      ctx.saveSettings({ questRoute: { route, fetchedAt: now() } });
      lastFailure = null;
      return { route };
    } catch (err) {
      lastFailure = { at: now(), error: `Couldn't load the quest route from the wiki: ${err.message}` };
      // Keep using an older copy if there is one.
      return { route: cached?.route || null, error: lastFailure.error };
    }
  }

  async function guideSteps(guide) {
    if (guide.id !== 'quests') return { steps: guide.steps };
    const { route, error } = await questRoute();
    return { steps: route ? questRouteSteps(route, { regions: DIARY_REGIONS, keyQuests: KEY_QUESTS }) : [], error };
  }

  function evaluate(guide, steps, state) {
    const prefix = progressId(guide, '');
    const manual = new Set([...state.manualIds].filter((id) => (prefix ? id.startsWith(prefix) : !id.includes(':'))).map((id) => id.slice(prefix.length)));
    const onBoard = new Set(db.prepare('SELECT title FROM tasks').all().map((t) => t.title.toLowerCase()));
    return steps.map((step) => ({
      id: step.id, stage: step.stage || 'route', category: step.category || null, title: step.title, why: step.why,
      notes: step.notes || [], key: Boolean(step.key), wiki: step.wiki || step.title, onBoard: onBoard.has(step.title.toLowerCase()),
      ...evaluateStep(step, { ...state, manual }),
    }));
  }

  const summary = (steps) => ({
    total: steps.length,
    done: steps.filter((s) => s.status === 'done').length,
    ready: steps.filter((s) => s.status === 'ready').length,
  });

  r.get('/guides', async (req, res) => {
    const { key } = ctx.requireAccount();
    const state = accountState(key);
    const list = [];
    for (const g of GUIDES) {
      const { steps } = await guideSteps(g);
      list.push({ id: g.id, name: g.name, blurb: g.blurb, ...summary(evaluate(g, steps, state)) });
    }
    res.json(list);
  });

  r.get('/guides/:id', async (req, res) => {
    const guide = guideById(req.params.id);
    if (!guide) throw new BadRequest('Unknown guide.');
    const { key } = ctx.requireAccount();
    const state = accountState(key);
    const { steps, error } = await guideSteps(guide);
    res.json({
      id: guide.id, name: guide.name, blurb: guide.blurb, stages: guide.stages, categories: guide.categories || [],
      fromWiki: Boolean(guide.fromWiki), routeError: error || null,
      routeFetchedAt: guide.fromWiki ? ctx.getSettings().questRoute?.fetchedAt ?? null : null,
      steps: evaluate(guide, steps, state), hasStats: state.hasStats, hasSync: state.hasSync,
    });
  });

  r.post('/guides/quests/reload', async (req, res) => {
    const { route, error } = await questRoute(true);
    if (error) throw new BadRequest(error);
    res.json({ steps: route.length });
  });

  async function findStep(params) {
    const guide = guideById(params.id);
    if (!guide) throw new BadRequest('Unknown guide.');
    const step = (await guideSteps(guide)).steps.find((s) => s.id === params.step);
    if (!step) throw new BadRequest('Unknown guide step.');
    return { guide, step };
  }

  // Tick or untick a step by hand.
  r.put('/guides/:id/:step', async (req, res) => {
    const { key } = ctx.requireAccount();
    const { guide, step } = await findStep(req.params);
    const id = progressId(guide, step.id);
    if (req.body.done) db.prepare('INSERT OR IGNORE INTO guide_progress (player, step_id, done_at) VALUES (?, ?, ?)').run(key, id, now());
    else db.prepare('DELETE FROM guide_progress WHERE player = ? AND step_id = ?').run(key, id);
    res.json({ ok: true });
  });

  // Copy a step onto the task board.
  r.post('/guides/:id/:step/task', async (req, res) => {
    const { guide, step } = await findStep(req.params);
    const exists = db.prepare('SELECT id FROM tasks WHERE lower(title) = lower(?)').get(step.title);
    if (!exists) {
      db.prepare("INSERT INTO tasks (title, category, notes, status, created_at, updated_at) VALUES (?, ?, ?, 'todo', ?, ?)")
        .run(step.title, guide.name, step.why || '', now(), now());
    }
    res.json({ added: !exists });
  });

  return r;
}
