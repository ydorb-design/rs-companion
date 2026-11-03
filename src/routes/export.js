// Download everything as one JSON file, and restore from one.
import { Router } from 'express';
import { BadRequest } from '../context.js';

const TABLES = [
  'snapshots', 'goals', 'tasks', 'timers', 'wikisync', 'quest_overrides', 'diary_overrides', 'events',
  'slayer_tasks', 'drops', 'clog_items', 'checklist', 'watchlist', 'supplies', 'boss_notes', 'boss_records', 'guide_progress', 'sessions',
];
// Never export credentials or the login signing secret; the quest route is a cache of a wiki page.
const PRIVATE_SETTINGS = ['secret', 'discordWebhook', 'ntfyUrl', 'dinkToken', 'questRoute'];

export function exportRoutes(ctx, { onRestore = () => {} } = {}) {
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

  // Replaces every table included in the backup, and all settings except credentials, in one transaction.
  r.post('/import', (req, res) => {
    const backup = req.body;
    if (backup?.app !== 'rs-companion' || typeof backup.tables !== 'object') {
      throw new BadRequest("That file isn't an RS Companion backup.");
    }
    const { db } = ctx;
    const restored = {};
    db.exec('BEGIN');
    try {
      for (const t of TABLES) {
        const rows = backup.tables[t];
        if (!Array.isArray(rows)) continue;
        const columns = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
        db.prepare(`DELETE FROM ${t}`).run();
        for (const row of rows) {
          const keys = Object.keys(row).filter((k) => columns.includes(k));
          if (!keys.length) continue;
          const values = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
          db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...values);
        }
        restored[t] = rows.length;
      }
      if (backup.settings && typeof backup.settings === 'object') {
        const keep = PRIVATE_SETTINGS.map(() => '?').join(', ');
        db.prepare(`DELETE FROM settings WHERE key NOT IN (${keep})`).run(...PRIVATE_SETTINGS);
        ctx.saveSettings(Object.fromEntries(Object.entries(backup.settings).filter(([k]) => !PRIVATE_SETTINGS.includes(k))));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new BadRequest(`Restore failed, nothing was changed: ${err.message}`);
    }
    onRestore();
    res.json({ ok: true, restored });
  });

  return r;
}
