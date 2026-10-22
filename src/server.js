import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { createUpstream } from './upstream.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 8417;
const DATA_DIR = process.env.DATA_DIR || './data';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'companion.db'));
const app = createApp({ db, upstream: createUpstream() });

// First run: seed settings from environment variables if provided.
const env = {};
if (process.env.PLAYER && !app.getSettings().player) env.player = process.env.PLAYER;
if (process.env.ACCOUNT_TYPE) env.accountType = process.env.ACCOUNT_TYPE;
for (const [k, v] of Object.entries(env)) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').run(k, JSON.stringify(v));
}

// Background refresh of hiscores and WikiSync on the configured interval.
let timer;
function schedule() {
  clearTimeout(timer);
  const { player, refreshHours } = app.getSettings();
  if (!player || !refreshHours) return;
  timer = setTimeout(async () => {
    for (const job of [app.refreshStats, app.syncProgress]) {
      try {
        await job();
      } catch (err) {
        console.warn(`Scheduled refresh: ${err.message}`);
      }
    }
    schedule();
  }, refreshHours * 60 * 60 * 1000);
}
app.on('settings', schedule);
schedule();

app.listen(PORT, () => console.log(`OSRS Companion running on port ${PORT}`));
