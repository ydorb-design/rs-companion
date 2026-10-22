// Shared helpers passed to every route module.
import { ACCOUNT_TYPES } from './upstream.js';

export const DAY = 24 * 60 * 60 * 1000;

export class BadRequest extends Error {
  status = 400;
}

// OSRS treats spaces, underscores and hyphens in names as the same character.
export const playerKey = (name) => name.trim().toLowerCase().replace(/[_-]/g, ' ');

const DEFAULT_SETTINGS = {
  accounts: [],
  active: '',
  refreshHours: 6,
  discordWebhook: '',
  ntfyUrl: '',
  alertLevels: true,
  alertGoals: true,
  alertTimers: true,
};

export function createContext({ db, upstream, now = () => Date.now(), notify }) {
  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const s = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])) };
    // Version 0.1 stored a single player. Move it into the accounts list once.
    if ('player' in s) {
      if (!s.accounts.length && s.player) {
        s.accounts = [{ player: s.player, accountType: s.accountType || 'ironman' }];
        s.active = s.player;
        saveSettings({ accounts: s.accounts, active: s.active });
      }
      db.prepare("DELETE FROM settings WHERE key IN ('player', 'accountType')").run();
      delete s.player;
      delete s.accountType;
    }
    return s;
  }

  function saveSettings(values) {
    for (const [k, v] of Object.entries(values)) upsertSetting.run(k, JSON.stringify(v));
  }

  function toAccount(a) {
    return { player: a.player, accountType: a.accountType, key: playerKey(a.player), label: ACCOUNT_TYPES[a.accountType]?.label };
  }

  function activeAccount() {
    const { accounts, active } = getSettings();
    const a = accounts.find((x) => playerKey(x.player) === playerKey(active || '')) || accounts[0];
    return a ? toAccount(a) : null;
  }

  function requireAccount() {
    const a = activeAccount();
    if (!a) throw new BadRequest('Add your player name in Settings first.');
    return a;
  }

  function allAccounts() {
    return getSettings().accounts.map(toAccount);
  }

  function latestSnapshot(key) {
    const row = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? ORDER BY taken_at DESC LIMIT 1').get(key);
    return row ? { takenAt: row.taken_at, ...JSON.parse(row.data) } : null;
  }

  return { db, upstream, now, notify, getSettings, saveSettings, activeAccount, requireAccount, allAccounts, latestSnapshot };
}
