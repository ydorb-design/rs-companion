import { Router } from 'express';

const TYPES = ['level', 'kc', 'collection', 'quest', 'diary', 'drop', 'slayer', 'clog'];

export function activityRoutes(ctx) {
  const r = Router();

  r.get('/activity', (req, res) => {
    const { key } = ctx.requireAccount();
    ctx.ensureBackfill(key);
    const type = TYPES.includes(req.query.type) ? req.query.type : undefined;
    res.json(ctx.events.list(key, { type, limit: Number(req.query.limit) || 100, before: Number(req.query.before) || undefined }));
  });

  return r;
}
