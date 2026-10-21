// Clients for the external data sources. All are public, read-only APIs.
import { xpForLevel } from '../public/js/xp.js';

// The OSRS Wiki asks API users to send a descriptive User-Agent.
const USER_AGENT = 'osrs-companion/0.1 (self-hosted personal tracker)';

export const ACCOUNT_TYPES = {
  main: { label: 'Main', hiscore: 'hiscore_oldschool' },
  ironman: { label: 'Ironman', hiscore: 'hiscore_oldschool_ironman' },
  hardcore: { label: 'Hardcore ironman', hiscore: 'hiscore_oldschool_hardcore_ironman' },
  ultimate: { label: 'Ultimate ironman', hiscore: 'hiscore_oldschool_ultimate' },
  // Group ironmen have no individual ironman board, so use the main one.
  group: { label: 'Group ironman', hiscore: 'hiscore_oldschool' },
};

export const NATURE_RUNE_ID = 561;

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function parseHiscores(json) {
  if (!json || !Array.isArray(json.skills)) throw new UpstreamError('Unexpected hiscores response');
  const skills = json.skills.map((s) => {
    const ranked = s.xp >= 0 && s.rank > 0;
    return {
      name: s.name,
      level: s.level,
      // Unranked skills come back as -1. Use the level's minimum XP instead.
      xp: ranked ? s.xp : s.name === 'Overall' ? null : xpForLevel(s.level),
      rank: ranked ? s.rank : null,
    };
  });
  const overall = skills.find((s) => s.name === 'Overall');
  if (overall && overall.xp === null) {
    overall.xp = skills.filter((s) => s.name !== 'Overall').reduce((sum, s) => sum + s.xp, 0);
  }
  const activities = (json.activities || [])
    .filter((a) => a.score >= 0)
    .map((a) => ({ name: a.name, score: a.score, rank: a.rank > 0 ? a.rank : null }));
  return { skills, activities };
}

// WikiSync quest states: 0 not started, 1 in progress, 2 complete.
const QUEST_STATES = ['not_started', 'in_progress', 'complete'];

export function parseWikiSync(json) {
  if (!json || typeof json !== 'object') throw new UpstreamError('Unexpected WikiSync response');
  const quests = Object.entries(json.quests || {}).map(([name, v]) => ({
    name,
    state: QUEST_STATES[v] ?? 'not_started',
  }));
  const diaries = {};
  for (const [region, tiers] of Object.entries(json.achievement_diaries || {})) {
    diaries[region] = {};
    for (const [tier, value] of Object.entries(tiers || {})) {
      diaries[region][tier] = typeof value === 'object' && value !== null ? Boolean(value.complete) : Boolean(value);
    }
  }
  return { quests, diaries, syncedAt: json.timestamp || null };
}

export function createUpstream({ fetch = globalThis.fetch, now = () => Date.now() } = {}) {
  async function getJson(url, { notFound } = {}) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch (err) {
      throw new UpstreamError(`Couldn't reach ${new URL(url).host}: ${err.message}`);
    }
    if (res.status === 404 || (notFound && res.status === 400)) {
      throw new UpstreamError(notFound || 'Not found', 404);
    }
    if (!res.ok) throw new UpstreamError(`${new URL(url).host} returned ${res.status}`);
    return res.json();
  }

  const cache = {};
  async function cached(key, ttlMs, load) {
    const hit = cache[key];
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    cache[key] = { at: now(), value };
    return value;
  }

  return {
    async hiscores(player, accountType = 'main') {
      const board = (ACCOUNT_TYPES[accountType] || ACCOUNT_TYPES.main).hiscore;
      const url = `https://secure.runescape.com/m=${board}/index_lite.json?player=${encodeURIComponent(player)}`;
      const json = await getJson(url, {
        notFound: `"${player}" isn't on the ${ACCOUNT_TYPES[accountType]?.label ?? 'main'} hiscores. Check the name and account type.`,
      });
      return parseHiscores(json);
    },

    async wikiSync(player) {
      const url = `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(player)}/STANDARD`;
      const json = await getJson(url, {
        notFound: 'No WikiSync data for this player yet. Install the WikiSync plugin in RuneLite and log in once.',
      });
      return parseWikiSync(json);
    },

    // Item metadata (names, alch values, buy limits). Changes rarely.
    itemMapping() {
      return cached('mapping', 24 * 60 * 60 * 1000, () =>
        getJson('https://prices.runescape.wiki/api/v1/osrs/mapping'),
      );
    },

    // Latest GE prices for every item.
    latestPrices() {
      return cached('latest', 5 * 60 * 1000, async () => (await getJson('https://prices.runescape.wiki/api/v1/osrs/latest')).data);
    },
  };
}
