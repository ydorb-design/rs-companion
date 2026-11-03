import { Router } from 'express';
import { ACCOUNT_TYPES } from '../upstream.js';
import { BadRequest, playerKey } from '../context.js';

const BOOL_KEYS = ['alertLevels', 'alertGoals', 'alertTimers', 'autoSessions'];

export function settingsRoutes(ctx, { onChange }) {
  const r = Router();

  function view() {
    const s = ctx.getSettings();
    return {
      accounts: ctx.allAccounts(),
      active: ctx.activeAccount(),
      refreshHours: s.refreshHours,
      discordWebhook: s.discordWebhook,
      ntfyUrl: s.ntfyUrl,
      alertLevels: s.alertLevels,
      alertGoals: s.alertGoals,
      alertTimers: s.alertTimers,
      autoSessions: s.autoSessions,
      accountTypes: ACCOUNT_TYPES,
    };
  }

  function checkUrl(value, label) {
    const v = String(value || '').trim();
    if (v && !/^https?:\/\/\S+$/.test(v)) throw new BadRequest(`${label} must be a full http(s) URL.`);
    return v;
  }

  r.get('/settings', (req, res) => res.json(view()));

  r.put('/settings', (req, res) => {
    const b = req.body;
    const next = {};
    if (b.refreshHours !== undefined) {
      const hours = Number(b.refreshHours);
      if (!(hours >= 0 && hours <= 168)) throw new BadRequest('Refresh interval must be 0 to 168 hours.');
      next.refreshHours = hours;
    }
    if (b.discordWebhook !== undefined) next.discordWebhook = checkUrl(b.discordWebhook, 'Discord webhook');
    if (b.ntfyUrl !== undefined) next.ntfyUrl = checkUrl(b.ntfyUrl, 'ntfy URL');
    for (const k of BOOL_KEYS) if (b[k] !== undefined) next[k] = Boolean(b[k]);
    ctx.saveSettings(next);
    onChange();
    res.json(view());
  });

  // Accounts

  function parseAccount(b) {
    const player = String(b.player || '').trim();
    if (!player) throw new BadRequest('Enter a player name.');
    if (player.length > 12) throw new BadRequest('Player names are 12 characters or fewer.');
    if (!ACCOUNT_TYPES[b.accountType]) throw new BadRequest('Unknown account type.');
    return { player, accountType: b.accountType };
  }

  // Adds an account, or updates its type if it already exists, and makes it active.
  r.post('/accounts', (req, res) => {
    const account = parseAccount(req.body);
    const { accounts } = ctx.getSettings();
    const rest = accounts.filter((a) => playerKey(a.player) !== playerKey(account.player));
    ctx.saveSettings({ accounts: [...rest, account], active: account.player });
    onChange();
    res.status(201).json(view());
  });

  r.put('/accounts/active', (req, res) => {
    const { accounts } = ctx.getSettings();
    const match = accounts.find((a) => playerKey(a.player) === playerKey(String(req.body.player || '')));
    if (!match) throw new BadRequest('Unknown account.');
    ctx.saveSettings({ active: match.player });
    res.json(view());
  });

  // Removes the account from the list. Its history stays in the database in case it's re-added.
  r.delete('/accounts/:player', (req, res) => {
    const { accounts, active } = ctx.getSettings();
    const key = playerKey(req.params.player);
    const rest = accounts.filter((a) => playerKey(a.player) !== key);
    const next = { accounts: rest };
    if (playerKey(active || '') === key) next.active = rest[0]?.player || '';
    ctx.saveSettings(next);
    onChange();
    res.json(view());
  });

  r.post('/notifications/test', async (req, res) => {
    const sent = await ctx.notify.send('Test alert', 'Alerts from RS Companion are working.').catch((err) => {
      throw new BadRequest(`Couldn't send: ${err.message}`);
    });
    if (!sent) throw new BadRequest('Add a Discord webhook or ntfy URL first.');
    res.json({ ok: true });
  });

  return r;
}
