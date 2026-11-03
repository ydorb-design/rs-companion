// Compare your stats with another player's, and keep a list of friends to compare with.
import { Router } from 'express';
import { ACCOUNT_TYPES } from '../upstream.js';
import { BadRequest, playerKey } from '../context.js';
import { combatLevel } from './stats.js';

const CACHE_MS = 5 * 60 * 1000;
const MAX_FRIENDS = 30;

export function compareRoutes(ctx) {
  const r = Router();
  const cache = new Map();

  function parsePlayer(b) {
    const player = String(b.player || '').trim();
    if (!player) throw new BadRequest('Enter a player name.');
    if (player.length > 12) throw new BadRequest('Player names are 12 characters or fewer.');
    const accountType = ACCOUNT_TYPES[b.accountType] ? b.accountType : 'main';
    return { player, accountType };
  }

  async function lookup({ player, accountType }) {
    const k = `${playerKey(player)}|${accountType}`;
    const hit = cache.get(k);
    if (hit && ctx.now() - hit.at < CACHE_MS) return hit.data;
    const data = await ctx.upstream.hiscores(player, accountType);
    cache.set(k, { at: ctx.now(), data });
    return data;
  }

  const side = (name, label, data, takenAt = null) => (data ? {
    player: name, label, takenAt, skills: data.skills, activities: data.activities, combatLevel: combatLevel(data.skills),
  } : null);

  r.get('/compare', async (req, res) => {
    const account = ctx.requireAccount();
    const other = parsePlayer(req.query);
    if (playerKey(other.player) === account.key && other.accountType === account.accountType) {
      throw new BadRequest("That's the account you're on. Pick someone else.");
    }
    const theirs = await lookup(other);
    const mine = ctx.latestSnapshot(account.key);
    res.json({
      mine: side(account.player, account.label, mine, mine?.takenAt),
      theirs: side(other.player, ACCOUNT_TYPES[other.accountType].label, theirs, ctx.now()),
      accountType: other.accountType,
    });
  });

  r.get('/friends', (req, res) => res.json(ctx.getSettings().friends || []));

  r.post('/friends', (req, res) => {
    const friend = parsePlayer(req.body);
    const list = (ctx.getSettings().friends || []).filter((f) => playerKey(f.player) !== playerKey(friend.player));
    if (list.length >= MAX_FRIENDS) throw new BadRequest(`You can save up to ${MAX_FRIENDS} players.`);
    const friends = [...list, friend].sort((a, b) => a.player.localeCompare(b.player));
    ctx.saveSettings({ friends });
    res.status(201).json(friends);
  });

  r.delete('/friends/:player', (req, res) => {
    const key = playerKey(req.params.player);
    const friends = (ctx.getSettings().friends || []).filter((f) => playerKey(f.player) !== key);
    ctx.saveSettings({ friends });
    res.json(friends);
  });

  return r;
}
