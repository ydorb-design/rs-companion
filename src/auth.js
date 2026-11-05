// Optional password login, turned on by the APP_PASSWORD environment variable.
import crypto from 'node:crypto';
import { Router } from 'express';

const COOKIE = 'rsc_session';
const MAX_AGE_S = 90 * 24 * 60 * 60;

function parseCookies(header = '') {
  const decode = (v) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v; // a malformed cookie from another app on the same host shouldn't break sign-in
    }
  };
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decode(v.join('='))]));
}

export function createAuth({ password, getSecret }) {
  const enabled = Boolean(password);
  // The token changes if the password changes, which signs everyone out.
  const token = () => crypto.createHmac('sha256', getSecret()).update(password).digest('base64url');

  function isAuthed(req) {
    if (!enabled) return true;
    const got = Buffer.from(parseCookies(req.headers.cookie)[COOKIE] || '');
    const want = Buffer.from(token());
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  const router = Router();
  router.get('/auth', (req, res) => res.json({ required: enabled, authenticated: isAuthed(req) }));

  // Slow down guessing: attempts are checked one at a time, at most one failed attempt per second.
  let lastFail = 0;
  let queue = Promise.resolve();
  function checkPassword(given) {
    const attempt = queue.then(async () => {
      const wait = lastFail + 1000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const a = crypto.createHash('sha256').update(given).digest();
      const b = crypto.createHash('sha256').update(password).digest();
      const ok = crypto.timingSafeEqual(a, b);
      if (!ok) lastFail = Date.now();
      return ok;
    });
    queue = attempt.catch(() => {});
    return attempt;
  }

  router.post('/auth/login', async (req, res) => {
    if (!enabled) return res.json({ ok: true });
    if (!(await checkPassword(String(req.body?.password || '')))) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure}`);
    res.json({ ok: true });
  });

  router.post('/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  // Blocks every other API route until signed in. The page shell itself has no data, so it stays public.
  function guard(req, res, next) {
    if (isAuthed(req)) return next();
    res.status(401).json({ error: 'Sign in required.', auth: true });
  }

  return { router, guard, enabled };
}
