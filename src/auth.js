// Optional password login, turned on by the APP_PASSWORD environment variable.
import crypto from 'node:crypto';
import { Router } from 'express';

const COOKIE = 'rsc_session';
const MAX_AGE_S = 90 * 24 * 60 * 60;

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
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

  let lastFail = 0;
  router.post('/auth/login', async (req, res) => {
    if (!enabled) return res.json({ ok: true });
    // Slow down guessing: at most one failed attempt per second.
    const wait = lastFail + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const given = crypto.createHash('sha256').update(String(req.body.password || '')).digest();
    const want = crypto.createHash('sha256').update(password).digest();
    if (!crypto.timingSafeEqual(given, want)) {
      lastFail = Date.now();
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
