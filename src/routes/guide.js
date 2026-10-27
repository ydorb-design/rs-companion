// Ironman progression guide, checked against the account's stats, quests, diaries and collection log.
import { Router } from 'express';
import { BadRequest } from '../context.js';
import { GUIDE_STAGES, GUIDE_STEPS, evaluateStep } from '../guide.js';
import { DIARY_REGIONS, DIARY_TIERS } from './progress.js';
import { combatLevel } from './stats.js';
import { checkRequirements } from '../requirements.js';

export function guideRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  function accountState(key) {
    const levels = Object.fromEntries((ctx.latestSnapshot(key)?.skills || []).map((s) => [s.name, s.level]));
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
    const manual = new Set(db.prepare('SELECT step_id FROM guide_progress WHERE player = ?').all(key).map((x) => x.step_id));

    // Quest steps use the requirements loaded from the wiki (the same ones as the Quests page).
    const reqs = new Map(db.prepare('SELECT name, data FROM quest_requirements').all().map((q) => [q.name.toLowerCase(), JSON.parse(q.data)]));
    const latest = ctx.latestSnapshot(key);
    const cb = latest ? combatLevel(latest.skills) : null;
    const questPoints = ctx.getSettings()[`questPoints:${key}`] ?? null;
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
    return { levels, questStates, diaries, obtained, manual, questRequirements, hasStats: Object.keys(levels).length > 0, hasSync: Boolean(row) };
  }

  r.get('/guide', (req, res) => {
    const { key } = ctx.requireAccount();
    const state = accountState(key);
    const onBoard = new Set(db.prepare('SELECT title FROM tasks').all().map((t) => t.title.toLowerCase()));
    const steps = GUIDE_STEPS.map((step) => ({
      id: step.id, stage: step.stage, category: step.category, title: step.title, why: step.why,
      wiki: step.wiki || step.title, onBoard: onBoard.has(step.title.toLowerCase()),
      ...evaluateStep(step, state),
    }));
    res.json({ stages: GUIDE_STAGES, steps, hasStats: state.hasStats, hasSync: state.hasSync });
  });

  // Tick or untick a step by hand.
  r.put('/guide/:id', (req, res) => {
    const { key } = ctx.requireAccount();
    const step = GUIDE_STEPS.find((s) => s.id === req.params.id);
    if (!step) throw new BadRequest('Unknown guide step.');
    if (req.body.done) db.prepare('INSERT OR IGNORE INTO guide_progress (player, step_id, done_at) VALUES (?, ?, ?)').run(key, step.id, now());
    else db.prepare('DELETE FROM guide_progress WHERE player = ? AND step_id = ?').run(key, step.id);
    res.json({ ok: true });
  });

  // Copy a step onto the task board.
  r.post('/guide/:id/task', (req, res) => {
    const step = GUIDE_STEPS.find((s) => s.id === req.params.id);
    if (!step) throw new BadRequest('Unknown guide step.');
    const exists = db.prepare('SELECT id FROM tasks WHERE lower(title) = lower(?)').get(step.title);
    if (!exists) {
      db.prepare("INSERT INTO tasks (title, category, notes, status, created_at, updated_at) VALUES (?, 'Iron guide', ?, 'todo', ?, ?)")
        .run(step.title, step.why, now(), now());
    }
    res.json({ added: !exists });
  });

  return r;
}
