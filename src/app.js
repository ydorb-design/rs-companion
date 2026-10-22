import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { UpstreamError } from './upstream.js';
import { BadRequest, createContext } from './context.js';
import { createNotifier } from './notify.js';
import { createAuth } from './auth.js';
import { settingsRoutes } from './routes/settings.js';
import { statsRoutes } from './routes/stats.js';
import { goalsRoutes } from './routes/goals.js';
import { progressRoutes } from './routes/progress.js';
import { pricesRoutes } from './routes/prices.js';
import { tasksRoutes } from './routes/tasks.js';
import { timersRoutes } from './routes/timers.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp({ db, upstream, now = () => Date.now(), password = '', fetch = globalThis.fetch }) {
  const app = express();
  // Behind Nginx Proxy Manager, trust its X-Forwarded-* headers (for secure cookies).
  app.set('trust proxy', true);
  app.use(express.json());

  const ctx = createContext({ db, upstream, now });
  ctx.notify = createNotifier({ fetch, getSettings: ctx.getSettings });

  const auth = createAuth({
    password,
    getSecret() {
      let { secret } = ctx.getSettings();
      if (!secret) ctx.saveSettings({ secret: (secret = crypto.randomBytes(32).toString('hex')) });
      return secret;
    },
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', auth.router);
  app.use('/api', auth.guard);

  const goals = goalsRoutes(ctx);

  // Level-up and goal alerts, after any stats refresh (manual or scheduled).
  function onRefreshed(account, { previous, latest, levelUps }) {
    const s = ctx.getSettings();
    if (s.alertLevels) {
      for (const l of levelUps) ctx.notify.fire(`${l.skill} level ${l.to}`, `${account.player} reached level ${l.to} ${l.skill}.`);
    }
    if (s.alertGoals) {
      for (const g of goals.newlyCompleted(account, previous, latest)) {
        ctx.notify.fire('Goal complete', `${account.player} reached ${g.skill} level ${g.targetLevel}.${g.note ? ` (${g.note})` : ''}`);
      }
    }
  }

  const stats = statsRoutes(ctx, { onRefreshed });
  const progress = progressRoutes(ctx);
  const timers = timersRoutes(ctx);
  let onSettingsChange = () => {};

  app.use('/api', settingsRoutes(ctx, { onChange: () => onSettingsChange() }));
  app.use('/api', stats.router);
  app.use('/api', goals.router);
  app.use('/api', progress.router);
  app.use('/api', pricesRoutes(ctx));
  app.use('/api', tasksRoutes(ctx));
  app.use('/api', timers.router);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(express.static(PUBLIC_DIR));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof UpstreamError || err instanceof BadRequest ? err.status : err.status || 500;
    if (err instanceof UpstreamError) console.warn(err.message);
    else if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Check the container logs.' : err.message });
  });

  // Background jobs, run by the scheduler in server.js.
  app.jobs = {
    async refreshAll() {
      for (const account of ctx.allAccounts()) {
        for (const job of [stats.refreshStats, progress.syncProgress]) {
          try {
            await job(account);
          } catch (err) {
            console.warn(`Scheduled refresh for ${account.player}: ${err.message}`);
          }
        }
      }
    },
    checkTimers() {
      const due = timers.collectDue();
      if (!ctx.getSettings().alertTimers) return;
      const names = Object.fromEntries(ctx.allAccounts().map((a) => [a.key, a.player]));
      for (const t of due) ctx.notify.fire(`${t.label} ready`, `${t.label} is ready${names[t.player] ? ` on ${names[t.player]}` : ''}.`);
    },
  };
  app.setSettingsListener = (fn) => (onSettingsChange = fn);
  app.ctx = ctx;
  return app;
}
