import { AuthRequired, api, busy, emptyState, esc, state, view } from './lib.js';
import { renderOverview } from './views/overview.js';
import { renderSkill } from './views/skill.js';
import { renderBossing } from './views/bossing.js';
import { renderGoals } from './views/goals.js';
import { renderQuests } from './views/quests.js';
import { renderTimers } from './views/timers.js';
import { renderPrices } from './views/prices.js';
import { renderTasks } from './views/tasks.js';
import { renderSettings } from './views/settings.js';
import { renderActivity } from './views/activity.js';
import { renderSlayer } from './views/slayer.js';
import { renderDrops } from './views/drops.js';
import { renderCollection } from './views/collection.js';
import { renderSupplies } from './views/supplies.js';
import { renderBosses } from './views/bosses.js';
import { renderGuides } from './views/guide.js';
import { renderSessions } from './views/sessions.js';
import { renderCompare } from './views/compare.js';
import { renderCalc } from './views/calc.js';

async function loadSettings() {
  state.settings = await api('/settings');
  renderAccountSwitcher();
}

function renderAccountSwitcher() {
  const { accounts, active } = state.settings;
  const el = document.getElementById('player-card');
  if (!active) return (el.innerHTML = '');
  el.innerHTML = accounts.length > 1
    ? `<label class="field">Account
        <select id="account-switch">${accounts.map((a) => `<option value="${esc(a.player)}" ${a.key === active.key ? 'selected' : ''}>${esc(a.player)}</option>`).join('')}</select>
      </label>`
    : `<div class="small muted">${esc(active.label)}</div><div><b>${esc(active.player)}</b></div>`;
  const sel = document.getElementById('account-switch');
  sel?.addEventListener('change', async () => {
    if (await busy(sel, () => api('/accounts/active', { method: 'PUT', body: { player: sel.value } }))) {
      await loadSettings();
      route();
    }
  });
}

function renderLogin() {
  document.body.classList.add('locked');
  view.innerHTML = `<div class="login">
    <form class="card" id="login-form">
      <h1>RS Companion</h1>
      <p class="muted small">Enter the password set on the container.</p>
      <label class="field">Password<input name="password" type="password" autocomplete="current-password" required autofocus></label>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
  </div>`;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await busy(form.querySelector('button'), () => api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) }));
    if (ok) {
      document.body.classList.remove('locked');
      state.settings = null;
      route();
    }
  });
}
window.addEventListener('auth-required', renderLogin);

const ROUTES = {
  overview: renderOverview,
  skill: renderSkill,
  bossing: renderBossing,
  activity: renderActivity,
  slayer: renderSlayer,
  drops: renderDrops,
  collection: renderCollection,
  supplies: renderSupplies,
  bosses: renderBosses,
  guides: renderGuides,
  sessions: renderSessions,
  compare: renderCompare,
  calc: renderCalc,
  goals: renderGoals,
  quests: renderQuests,
  timers: renderTimers,
  prices: renderPrices,
  tasks: renderTasks,
  settings: () => renderSettings({ reload: loadSettings }),
};

async function route() {
  // The Iron guide used to live at #/guide.
  if (location.hash === '#/guide') return location.replace('#/guides/iron');
  const [name = 'overview', param] = location.hash.replace(/^#\/?/, '').split('/');
  const render = ROUTES[name] || renderOverview;
  const navName = name === 'skill' ? 'overview' : name;
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.route === navName) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    if (!state.settings) await loadSettings();
    await render(param ? decodeURIComponent(param) : undefined);
  } catch (err) {
    if (!(err instanceof AuthRequired)) view.innerHTML = emptyState('Something went wrong', esc(err.message));
  }
}

window.addEventListener('hashchange', () => {
  route();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
route();

// Block pinch zoom. iOS Safari ignores user-scalable=no in the viewport tag, so stop the gestures directly.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
