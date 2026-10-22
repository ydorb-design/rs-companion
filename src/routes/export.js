// Download everything as one JSON file, for backups or spreadsheets.
import { Router } from 'express';

const TABLES = [
  'snapshots', 'goals', 'tasks', 'timers', 'wikisync', 'quest_overrides', 'diary_overrides', 'events',
  'slayer_tasks', 'drops', 'clog_items', 'checklist', 'watchlist',
];
// Never export credentials or the login signing secret.
const PRIVATE_SETTINGS = ['secret', 'discordWebhook', 'ntfyUrl'];

export function exportRoutes(ctx) {
  const r = Router();

  r.get('/export', (req, res) => {
    const settings = Object.fromEntries(Object.entries(ctx.getSettings()).filter(([k]) => !PRIVATE_SETTINGS.includes(k)));
    const data = { app: 'rs-companion', exportedAt: new Date(ctx.now()).toISOString(), settings, tables: {} };
    for (const t of TABLES) {
      data.tables[t] = ctx.db.prepare(`SELECT * FROM ${t}`).all().map((row) => {
        // Snapshot and sync payloads are stored as JSON text; export them as objects.
        if (typeof row.data === 'string') return { ...row, data: JSON.parse(row.data) };
        return row;
      });
    }
    const date = new Date(ctx.now()).toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="rs-companion-${date}.json"`);
    res.json(data);
  });

  return r;
}
