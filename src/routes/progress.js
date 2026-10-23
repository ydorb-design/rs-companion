import { Router } from 'express';
import { BadRequest, DAY } from '../context.js';
import { checkRequirements, parseRequirements } from '../requirements.js';
import { combatLevel } from './stats.js';
import { eventsFromSync } from '../events.js';

export const DIARY_REGIONS = [
  'Ardougne', 'Desert', 'Falador', 'Fremennik', 'Kandarin', 'Karamja', 'Kourend & Kebos',
  'Lumbridge & Draynor', 'Morytania', 'Varrock', 'Western Provinces', 'Wilderness',
];
export const DIARY_TIERS = ['Easy', 'Medium', 'Hard', 'Elite'];
export const CA_TIERS = ['None', 'Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster'];
const QUEST_STATES = ['not_started', 'in_progress', 'complete'];
const REQUIREMENTS_MAX_AGE = 30 * DAY;

export function progressRoutes(ctx) {
  const r = Router();
  const { db, now } = ctx;

  function synced(key) {
    const row = db.prepare('SELECT fetched_at, data FROM wikisync WHERE player = ?').get(key);
    return row ? { fetchedAt: row.fetched_at, ...JSON.parse(row.data) } : null;
  }

  async function syncProgress(account = ctx.requireAccount()) {
    const data = await ctx.upstream.wikiSync(account.player);
    for (const e of eventsFromSync(synced(account.key), data)) ctx.events.add(account.key, now(), e, { dedupeDays: 30 });
    db.prepare('INSERT INTO wikisync (player, fetched_at, data) VALUES (?, ?, ?) ON CONFLICT(player) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data')
      .run(account.key, now(), JSON.stringify(data));
    return data;
  }

  // Fetches requirements for any quest not cached recently. Returns how many were loaded.
  async function loadRequirements(names, { force = false } = {}) {
    const fresh = new Set(force ? [] : db.prepare('SELECT name FROM quest_requirements WHERE fetched_at >= ?')
      .all(now() - REQUIREMENTS_MAX_AGE).map((row) => row.name));
    const todo = names.filter((n) => !fresh.has(n));
    if (!todo.length) return 0;
    const pages = await ctx.upstream.wikiPages(todo);
    const known = new Set(names);
    const save = db.prepare('INSERT INTO quest_requirements (name, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at');
    for (const name of todo) {
      const parsed = pages[name] ? parseRequirements(pages[name], known, name) : null;
      save.run(name, JSON.stringify(parsed), now());
    }
    return todo.length;
  }

  r.get('/progress', (req, res) => {
    const account = ctx.requireAccount();
    const { key } = account;
    const s = synced(key) || { quests: [], diaries: {}, combatAchievements: null, fetchedAt: null };
    const questOverrides = Object.fromEntries(
      db.prepare('SELECT name, state FROM quest_overrides WHERE player = ?').all(key).map((row) => [row.name, row.state]),
    );
    const diaryOverrides = {};
    for (const row of db.prepare('SELECT region, tier, complete FROM diary_overrides WHERE player = ?').all(key)) {
      diaryOverrides[`${row.region}|${row.tier}`] = Boolean(row.complete);
    }
    const reqs = Object.fromEntries(db.prepare('SELECT name, data FROM quest_requirements').all().map((row) => [row.name, JSON.parse(row.data)]));

    const questStates = {};
    // Also filters data synced before placeholder keys were dropped.
    const quests = s.quests.filter((q) => /[a-z]/i.test(q.name)).map((q) => {
      const state = questOverrides[q.name] ?? q.state;
      questStates[q.name] = state;
      return { name: q.name, state, synced: q.state, manual: q.name in questOverrides };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const questPoints = ctx.getSettings()[`questPoints:${key}`] ?? null;
    const latest = ctx.latestSnapshot(key);
    const levels = Object.fromEntries((latest?.skills || []).map((x) => [x.name, x.level]));
    const cb = latest ? combatLevel(latest.skills) : null;
    for (const q of quests) {
      const req = q.name in reqs ? reqs[q.name] : undefined;
      q.requirements = req ?? null;
      q.check = req === undefined ? { status: 'not_loaded', missing: [] } : checkRequirements(req, { levels, combatLevel: cb, questStates, questPoints });
    }

    const diaries = DIARY_REGIONS.map((region) => ({
      region,
      tiers: DIARY_TIERS.map((tier) => {
        const fromSync = s.diaries?.[region]?.[tier] ?? false;
        const override = diaryOverrides[`${region}|${tier}`];
        return { tier, complete: override ?? fromSync, manual: override !== undefined };
      }),
    }));

    const caTier = ctx.getSettings()[`caTier:${key}`] || 'None';
    const caPoints = ctx.getSettings()[`caPoints:${key}`] || null;
    res.json({
      fetchedAt: s.fetchedAt,
      quests,
      diaries,
      combatAchievements: { completed: s.combatAchievements ?? null, tier: caTier, points: caPoints },
      questPoints,
      music: s.musicTracks ? {
        unlocked: s.musicTracks.filter((m) => m.unlocked).length,
        total: s.musicTracks.length,
        locked: s.musicTracks.filter((m) => !m.unlocked).map((m) => m.name).sort((a, b) => a.localeCompare(b)),
      } : null,
      requirementsLoaded: quests.some((q) => q.check.status !== 'not_loaded'),
      hasStats: Boolean(latest),
    });
  });

  r.post('/progress/sync', async (req, res) => {
    const data = await syncProgress();
    // Requirements are best-effort: a wiki outage shouldn't fail the sync.
    await loadRequirements(data.quests.map((q) => q.name)).catch((err) => console.warn(`Requirements: ${err.message}`));
    res.json({ ok: true });
  });

  r.post('/progress/requirements', async (req, res) => {
    const { key } = ctx.requireAccount();
    const s = synced(key);
    if (!s?.quests.length) throw new BadRequest('Sync from WikiSync first so the app knows your quest list.');
    const loaded = await loadRequirements(s.quests.map((q) => q.name), { force: true });
    res.json({ ok: true, loaded });
  });

  r.put('/progress/quest', (req, res) => {
    const { key } = ctx.requireAccount();
    const { name, state } = req.body;
    if (!QUEST_STATES.includes(state)) throw new BadRequest('Unknown quest state.');
    if (req.body.clear) {
      db.prepare('DELETE FROM quest_overrides WHERE player = ? AND name = ?').run(key, String(name));
    } else {
      db.prepare('INSERT INTO quest_overrides (player, name, state) VALUES (?, ?, ?) ON CONFLICT(player, name) DO UPDATE SET state = excluded.state')
        .run(key, String(name), state);
    }
    res.json({ ok: true });
  });

  r.put('/progress/diary', (req, res) => {
    const { key } = ctx.requireAccount();
    const { region, tier, complete } = req.body;
    if (!DIARY_REGIONS.includes(region) || !DIARY_TIERS.includes(tier)) throw new BadRequest('Unknown diary.');
    if (req.body.clear) {
      db.prepare('DELETE FROM diary_overrides WHERE player = ? AND region = ? AND tier = ?').run(key, region, tier);
    } else {
      db.prepare('INSERT INTO diary_overrides (player, region, tier, complete) VALUES (?, ?, ?, ?) ON CONFLICT(player, region, tier) DO UPDATE SET complete = excluded.complete')
        .run(key, region, tier, complete ? 1 : 0);
    }
    res.json({ ok: true });
  });

  r.put('/progress/combat-achievements', (req, res) => {
    const { key } = ctx.requireAccount();
    if (!CA_TIERS.includes(req.body.tier)) throw new BadRequest('Unknown tier.');
    ctx.saveSettings({ [`caTier:${key}`]: req.body.tier });
    res.json({ ok: true });
  });

  return { router: r, syncProgress };
}
