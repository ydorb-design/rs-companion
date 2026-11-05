import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { createUpstream } from './upstream.js';
import { createApp } from './app.js';
import { LOGOUT_DELAY } from './routes/sessions.js';

const PORT = Number(process.env.PORT) || 8417;
const DATA_DIR = process.env.DATA_DIR || './data';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'companion.db'));
const app = createApp({ db, upstream: createUpstream(), password: process.env.APP_PASSWORD || '' });
const { ctx } = app;

// First run: seed an account from environment variables if provided.
if (process.env.PLAYER && !ctx.allAccounts().length) {
  ctx.saveSettings({
    accounts: [{ player: process.env.PLAYER.trim(), accountType: process.env.ACCOUNT_TYPE || 'ironman' }],
    active: process.env.PLAYER.trim(),
  });
}

// Refresh hiscores and WikiSync for every account on the configured interval.
let timer;
function schedule() {
  clearTimeout(timer);
  const { refreshHours } = ctx.getSettings();
  if (!refreshHours) return;
  timer = setTimeout(async () => {
    await app.jobs.refreshAll();
    schedule();
  }, refreshHours * 60 * 60 * 1000);
}
app.setSettingsListener(schedule);
schedule();

// Check for finished farming and custom timers.
setInterval(() => app.jobs.checkTimers(), 30 * 1000);

// Sessions ended by a Dink logout get their final stats a few minutes later. This also catches any
// left waiting by a restart, which would otherwise wait for the next scheduled refresh (or forever if that's off).
setInterval(() => {
  app.jobs.finishSessions({ minAge: LOGOUT_DELAY }).catch((err) => console.warn(`Session end: ${err.message}`));
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`RS Companion running on port ${PORT}${process.env.APP_PASSWORD ? ' (password login on)' : ''}`);
});
