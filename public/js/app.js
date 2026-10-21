import { MAX_LEVEL, levelForXp, levelProgress, xpForLevel } from './xp.js';

const view = document.getElementById('view');
const WIKI = 'https://oldschool.runescape.wiki';

const SKILL_NAMES = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing', 'Defence', 'Herblore', 'Fishing',
  'Ranged', 'Thieving', 'Cooking', 'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Sailing',
];

// Helpers

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU'));
const short = (n) => {
  if (n == null) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  return fmt(n);
};
const gp = (n) => (n == null ? '–' : `${fmt(n)} gp`);
const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const ago = (t) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
const wikiUrl = (page) => `${WIKI}/w/${encodeURIComponent(page.replace(/ /g, '_'))}`;
const skillIcon = (name) => `${WIKI}/images/${name === 'Overall' ? 'Stats' : name}_icon.png`;
const itemIcon = (icon) => (icon ? `${WIKI}/images/${encodeURIComponent(icon.replace(/ /g, '_'))}` : '');
const img = (src, alt = '') => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), error ? 6000 : 2500);
}

// Runs an async action from a button, with a busy state and error toast.
async function busy(button, fn, success) {
  if (button) button.disabled = true;
  try {
    await fn();
    if (success) toast(success);
    return true;
  } catch (err) {
    toast(err.message, { error: true });
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

function emptyState(title, body, action = '') {
  return `<div class="card empty"><h2>${esc(title)}</h2><p>${body}</p>${action}</div>`;
}

const needsPlayer = () => emptyState(
  'Set up your character',
  'Add your player name and account type to start tracking.',
  '<a class="btn btn-primary" href="#/settings">Go to settings</a>',
);

// State shared across views

let settings = null;

async function loadSettings() {
  settings = await api('/settings');
  const card = document.getElementById('player-card');
  card.innerHTML = settings.player
    ? `<div class="small muted">${esc(settings.accountTypes[settings.accountType]?.label)}</div><div><b>${esc(settings.player)}</b></div>`
    : '';
}

// Overview

const overviewState = { period: 'week', skill: 'Overall' };

async function renderOverview() {
  if (!settings.player) return (view.innerHTML = needsPlayer());
  const stats = await api('/stats');
  const head = `
    <div class="page-head">
      <div>
        <h1>${esc(settings.player)}</h1>
        <p class="muted small">${stats.latest ? `Hiscores updated ${ago(stats.latest.takenAt)}` : 'No data yet'}</p>
      </div>
      <button class="btn btn-primary" id="refresh">Refresh stats</button>
    </div>`;

  if (!stats.latest) {
    view.innerHTML = head + emptyState('No stats yet', 'Pull your levels from the official hiscores to get started.');
    return bindRefresh();
  }

  const skills = stats.latest.skills;
  const overall = skills.find((s) => s.name === 'Overall');
  const gains = stats.gains[overviewState.period] || [];
  const gainedOverall = gains.find((g) => g.name === 'Overall');
  const maxed = skills.filter((s) => s.name !== 'Overall' && s.level >= MAX_LEVEL).length;
  const gainRows = gains.filter((g) => g.name !== 'Overall' && g.xp > 0).sort((a, b) => b.xp - a.xp);

  view.innerHTML = `${head}
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total level</div><div class="kpi-value">${fmt(overall?.level)}</div></div>
        <div class="kpi"><div class="kpi-label">Total XP</div><div class="kpi-value">${short(overall?.xp)}</div></div>
        <div class="kpi"><div class="kpi-label">XP this ${overviewState.period}</div><div class="kpi-value">${gainedOverall ? short(gainedOverall.xp) : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Skills at 99</div><div class="kpi-value">${maxed}</div></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Skills</h2><span class="muted small">Select a skill to chart it</span></div>
        <div class="skills">
          ${skills.filter((s) => s.name !== 'Overall').map((s) => `
            <button class="skill" data-skill="${esc(s.name)}" aria-pressed="${s.name === overviewState.skill}"
              title="${esc(s.name)}: ${fmt(s.xp)} XP${s.level < MAX_LEVEL ? `, ${fmt(xpForLevel(s.level + 1) - s.xp)} to level ${s.level + 1}` : ''}">
              ${img(skillIcon(s.name))}
              <span class="skill-name">${esc(s.name)}</span>
              <span class="skill-level">${s.level}</span>
              <div class="bar ${s.level >= MAX_LEVEL ? 'done' : ''}"><span style="width:${(levelProgress(s.xp) * 100).toFixed(1)}%"></span></div>
            </button>`).join('')}
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <h2>${esc(overviewState.skill)} XP</h2>
            ${overviewState.skill !== 'Overall' ? '<button class="btn btn-ghost btn-sm" data-skill="Overall">Show overall</button>' : ''}
          </div>
          <div id="chart"><p class="muted small">Loading…</p></div>
        </section>
        <section class="card">
          <div class="card-head">
            <h2>Gains</h2>
            <div class="segmented" role="group" aria-label="Period">
              ${['day', 'week', 'month'].map((p) => `<button data-period="${p}" aria-pressed="${p === overviewState.period}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
            </div>
          </div>
          ${gainRows.length ? `
            <div class="table-wrap"><table>
              <thead><tr><th>Skill</th><th class="r">XP</th><th class="r">Levels</th></tr></thead>
              <tbody>${gainRows.map((g) => `<tr><td><span class="item">${img(skillIcon(g.name))}${esc(g.name)}</span></td><td class="r pos">${signed(g.xp)}</td><td class="r">${g.levels ? signed(g.levels) : ''}</td></tr>`).join('')}</tbody>
            </table></div>`
            : `<p class="muted small">No XP gained this ${overviewState.period} yet. Gains are measured from your first refresh in the period, so they build up as the app collects snapshots.</p>`}
        </section>
      </div>
    </div>`;

  bindRefresh();
  view.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => {
    overviewState.skill = b.dataset.skill;
    renderOverview();
  }));
  view.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    overviewState.period = b.dataset.period;
    renderOverview();
  }));
  renderChart();
}

function bindRefresh() {
  const btn = document.getElementById('refresh');
  btn?.addEventListener('click', async () => {
    if (await busy(btn, () => api('/stats/refresh', { method: 'POST' }), 'Stats updated')) renderOverview();
  });
}

async function renderChart() {
  const el = document.getElementById('chart');
  const { points } = await api(`/stats/history?skill=${encodeURIComponent(overviewState.skill)}&days=90`);
  if (points.length < 2) {
    el.innerHTML = '<p class="muted small">The chart fills in as the app takes snapshots. It refreshes automatically on the interval set in Settings.</p>';
    return;
  }
  const W = 560, H = 220, L = 48, R = 12, T = 12, B = 26;
  const xs = points.map((p) => p.t), ys = points.map((p) => p.xp);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const x = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.xp).toFixed(1)}`).join('');
  const area = `${line}L${x(x1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
  const date = (t) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const last = points.at(-1);
  el.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="${esc(overviewState.skill)} XP from ${fmt(points[0].xp)} to ${fmt(last.xp)}">
      ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
      <circle class="dot" cx="${x(last.t)}" cy="${y(last.xp)}" r="3.5"/>
      <text class="axis" x="${L}" y="${H - 6}">${date(x0)}</text>
      <text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${date(x1)}</text>
    </svg>
    <p class="muted small">${fmt(last.xp)} XP, level ${last.level}. ${signed(last.xp - points[0].xp)} XP since ${date(x0)}.</p>`;
}

// Goals

async function renderGoals() {
  if (!settings.player) return (view.innerHTML = needsPlayer());
  const [goals, stats] = await Promise.all([api('/goals'), api('/stats')]);
  const known = stats.latest?.skills.filter((s) => s.name !== 'Overall').map((s) => s.name);
  const skillOptions = (known?.length ? known : SKILL_NAMES).slice().sort();

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Goals</h1><p class="muted small">Progress uses your latest hiscores snapshot${stats.latest ? ` (${ago(stats.latest.takenAt)})` : ''}.</p></div>
    </div>
    <div class="stack">
      <form class="card" id="goal-form">
        <div class="card-head"><h2>New goal</h2></div>
        <div class="form-grid">
          <label class="field">Skill
            <select name="skill" required>${skillOptions.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
          </label>
          <label class="field">Target
            <select name="targetType"><option value="level">Level</option><option value="xp">XP</option></select>
          </label>
          <label class="field"><span>Value</span>
            <input name="target" type="number" min="2" max="200000000" value="99" required inputmode="numeric">
          </label>
          <label class="field"><span>XP per action <span class="hint">Optional</span></span>
            <input name="xpPerAction" type="number" min="0" step="any" placeholder="e.g. 125">
          </label>
          <label class="field"><span>XP per hour <span class="hint">Optional</span></span>
            <input name="xpPerHour" type="number" min="0" step="any" placeholder="e.g. 60000">
          </label>
        </div>
        <label class="field" style="margin-top:12px"><span>Note <span class="hint">Optional, e.g. method or location</span></span>
          <input name="note" maxlength="200">
        </label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Add goal</button></div>
      </form>

      ${goals.length ? `<div class="goals">${goals.map(goalCard).join('')}</div>`
        : emptyState('No goals yet', 'Add a target level or XP above. If you add XP per action or per hour, you\'ll also see how many actions or hours are left.')}
    </div>`;

  const form = document.getElementById('goal-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const body = { skill: f.skill, xpPerAction: f.xpPerAction, xpPerHour: f.xpPerHour, note: f.note };
    if (f.targetType === 'xp') body.targetXp = Number(f.target);
    else body.targetLevel = Number(f.target);
    if (await busy(form.querySelector('button'), () => api('/goals', { method: 'POST', body }), 'Goal added')) renderGoals();
  });
  view.querySelectorAll('[data-delete-goal]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/goals/${b.dataset.deleteGoal}`, { method: 'DELETE' }))) renderGoals();
  }));
}

function goalCard(g) {
  const pct = Math.min(100, (g.currentXp / g.targetXp) * 100);
  const hours = g.hours != null ? (g.hours < 1 ? `${Math.ceil(g.hours * 60)} min` : `${g.hours.toFixed(1)} h`) : null;
  return `
    <article class="goal">
      <div class="goal-head">
        ${img(skillIcon(g.skill))}
        <div class="grow">
          <h3>${esc(g.skill)} ${g.targetXp === xpForLevel(g.targetLevel) ? `level ${g.targetLevel}` : `${short(g.targetXp)} XP`}</h3>
          ${g.note ? `<p class="muted small">${esc(g.note)}</p>` : ''}
        </div>
        <button class="btn btn-ghost icon-btn" data-delete-goal="${g.id}" aria-label="Delete goal">✕</button>
      </div>
      <div class="bar ${g.complete ? 'done' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="goal-stats">
        ${g.complete ? '<span class="pos"><b>Complete</b></span>' : `
          <span>Remaining <b>${fmt(g.remainingXp)}</b> XP</span>
          <span>Now <b>level ${levelForXp(g.currentXp)}</b></span>
          ${g.actions != null ? `<span><b>${fmt(g.actions)}</b> actions</span>` : ''}
          ${hours ? `<span>About <b>${hours}</b></span>` : ''}`}
      </div>
    </article>`;
}

// Quests and diaries

const questState = { filter: 'all', q: '' };
const STATE_LABELS = { not_started: 'Not started', in_progress: 'In progress', complete: 'Complete' };

async function renderQuests() {
  if (!settings.player) return (view.innerHTML = needsPlayer());
  const progress = await api('/progress');
  const counts = { all: progress.quests.length, not_started: 0, in_progress: 0, complete: 0 };
  progress.quests.forEach((q) => counts[q.state]++);
  const visible = progress.quests.filter((q) =>
    (questState.filter === 'all' || q.state === questState.filter) && q.name.toLowerCase().includes(questState.q.toLowerCase()));
  const diariesDone = progress.diaries.reduce((n, d) => n + d.tiers.filter((t) => t.complete).length, 0);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Quests &amp; diaries</h1>
        <p class="muted small">${progress.fetchedAt ? `Synced from WikiSync ${ago(progress.fetchedAt)}` : 'Not synced yet'}. Changes you make here are kept as manual overrides.</p>
      </div>
      <button class="btn btn-primary" id="sync">Sync from WikiSync</button>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Quests complete</div><div class="kpi-value">${counts.complete}<span class="muted" style="font-size:var(--text-md)"> / ${counts.all}</span></div></div>
        <div class="kpi"><div class="kpi-label">In progress</div><div class="kpi-value">${counts.in_progress}</div></div>
        <div class="kpi"><div class="kpi-label">Diary tiers done</div><div class="kpi-value">${diariesDone}<span class="muted" style="font-size:var(--text-md)"> / 48</span></div></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <h2>Quests</h2>
            <div class="segmented" role="group" aria-label="Filter quests">
              ${['all', 'not_started', 'in_progress', 'complete'].map((f) => `<button data-filter="${f}" aria-pressed="${f === questState.filter}">${f === 'all' ? 'All' : STATE_LABELS[f]}</button>`).join('')}
            </div>
          </div>
          ${progress.quests.length ? `
            <input id="quest-search" type="search" placeholder="Search quests" value="${esc(questState.q)}" aria-label="Search quests" style="margin-bottom:12px">
            <div class="quest-list">
              ${visible.map((q) => `
                <div class="quest">
                  <span class="dot-state ${q.state}" aria-hidden="true"></span>
                  <span class="quest-name"><a href="${wikiUrl(q.name)}" target="_blank" rel="noopener">${esc(q.name)}</a></span>
                  ${q.manual ? `<button class="btn btn-ghost btn-sm" data-reset-quest="${esc(q.name)}" title="Revert to WikiSync value">Manual ✕</button>` : ''}
                  <select data-quest="${esc(q.name)}" aria-label="Status of ${esc(q.name)}">
                    ${Object.entries(STATE_LABELS).map(([v, l]) => `<option value="${v}" ${v === q.state ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>`).join('') || '<p class="muted small">No quests match.</p>'}
            </div>`
            : `<p class="muted small">Your quest list comes from WikiSync. In RuneLite, install the <b>WikiSync</b> plugin from the Plugin Hub, log in to the game once, then press Sync.</p>`}
        </section>

        <section class="card">
          <div class="card-head"><h2>Achievement diaries</h2><span class="muted small">Tap a tier to toggle</span></div>
          <div class="diaries">
            <span></span>${['Easy', 'Medium', 'Hard', 'Elite'].map((t) => `<span class="head">${t}</span>`).join('')}
            ${progress.diaries.map((d) => `
              <a href="${wikiUrl(`${d.region} Diary`)}" target="_blank" rel="noopener" class="small">${esc(d.region)}</a>
              ${d.tiers.map((t) => `<button class="tier ${t.manual ? 'manual' : ''}" data-region="${esc(d.region)}" data-tier="${t.tier}" aria-pressed="${t.complete}"
                aria-label="${esc(d.region)} ${t.tier}">${t.complete ? '✓' : ''}</button>`).join('')}`).join('')}
          </div>
          <p class="hint" style="margin-top:12px">Dashed outline means you've set it manually. Tap again to switch it back.</p>
        </section>
      </div>
    </div>`;

  const syncBtn = document.getElementById('sync');
  syncBtn.addEventListener('click', async () => {
    if (await busy(syncBtn, () => api('/progress/sync', { method: 'POST' }), 'Synced')) renderQuests();
  });
  view.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    questState.filter = b.dataset.filter;
    renderQuests();
  }));
  const search = document.getElementById('quest-search');
  search?.addEventListener('input', () => {
    questState.q = search.value;
    renderQuests().then(() => {
      const s = document.getElementById('quest-search');
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    });
  });
  view.querySelectorAll('[data-quest]').forEach((sel) => sel.addEventListener('change', async () => {
    const quest = progress.quests.find((q) => q.name === sel.dataset.quest);
    const body = { name: quest.name, state: sel.value, clear: sel.value === quest.synced && progress.fetchedAt != null };
    if (await busy(sel, () => api('/progress/quest', { method: 'PUT', body }))) renderQuests();
  }));
  view.querySelectorAll('[data-reset-quest]').forEach((b) => b.addEventListener('click', async () => {
    const quest = progress.quests.find((q) => q.name === b.dataset.resetQuest);
    if (await busy(b, () => api('/progress/quest', { method: 'PUT', body: { name: quest.name, state: quest.synced, clear: true } }))) renderQuests();
  }));
  view.querySelectorAll('.tier').forEach((b) => b.addEventListener('click', async () => {
    const tier = progress.diaries.find((d) => d.region === b.dataset.region).tiers.find((t) => t.tier === b.dataset.tier);
    // A manual override toggled back clears itself, returning to the synced value.
    const body = { region: b.dataset.region, tier: b.dataset.tier, complete: !tier.complete, clear: tier.manual };
    if (await busy(b, () => api('/progress/diary', { method: 'PUT', body }))) renderQuests();
  }));
}

// Prices

const priceState = { q: '', results: [] };

async function renderPrices() {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Prices</h1><p class="muted small">Live Grand Exchange prices from the OSRS Wiki. Useful for judging drop value and what's worth alching.</p></div>
    </div>
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Watchlist</h2></div>
        <div id="watchlist"><p class="muted small">Loading…</p></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Search items</h2></div>
        <input id="item-search" type="search" placeholder="e.g. rune platebody" value="${esc(priceState.q)}" aria-label="Search items" autocomplete="off">
        <div id="results" style="margin-top:12px"></div>
      </section>
    </div>`;

  const search = document.getElementById('item-search');
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => runSearch(search.value), 250);
  });
  loadWatchlist();
  if (priceState.q) runSearch(priceState.q);
}

function priceTable(rows, { watched }) {
  if (!rows.length) return '';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Item</th><th class="r">GE price</th><th class="r">High alch</th><th class="r" title="High alch value minus item price and a nature rune">Alch profit</th><th class="r">Buy limit</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><a class="item" href="${wikiUrl(r.name)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${img(itemIcon(r.icon))}<span>${esc(r.name)}</span></a></td>
        <td class="r">${gp(r.price)}</td>
        <td class="r">${gp(r.highAlch)}</td>
        <td class="r ${r.alchProfit > 0 ? 'pos' : r.alchProfit < 0 ? 'neg' : ''}">${r.alchProfit == null ? '–' : signed(r.alchProfit)}</td>
        <td class="r">${fmt(r.limit)}</td>
        <td class="r">${watched.has(r.id)
          ? `<button class="btn btn-ghost btn-sm" data-unwatch="${r.id}">Remove</button>`
          : `<button class="btn btn-sm" data-watch="${r.id}">Watch</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

let watchedIds = new Set();

async function loadWatchlist() {
  const el = document.getElementById('watchlist');
  try {
    const rows = await api('/prices/watchlist');
    watchedIds = new Set(rows.map((r) => r.id));
    el.innerHTML = rows.length ? priceTable(rows, { watched: watchedIds }) : '<p class="muted small">Search for items below and add them to keep an eye on their value.</p>';
    bindWatchButtons(el);
  } catch (err) {
    el.innerHTML = `<p class="small neg">${esc(err.message)}</p>`;
  }
}

async function runSearch(q) {
  priceState.q = q;
  const el = document.getElementById('results');
  if (!el) return;
  if (q.trim().length < 2) return (el.innerHTML = '');
  try {
    priceState.results = await api(`/prices/search?q=${encodeURIComponent(q)}`);
    if (priceState.q !== q) return;
    el.innerHTML = priceState.results.length ? priceTable(priceState.results, { watched: watchedIds }) : '<p class="muted small">No items found.</p>';
    bindWatchButtons(el);
  } catch (err) {
    el.innerHTML = `<p class="small neg">${esc(err.message)}</p>`;
  }
}

function bindWatchButtons(root) {
  root.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api('/prices/watchlist', { method: 'POST', body: { id: Number(b.dataset.watch) } }), 'Added to watchlist')) {
      await loadWatchlist();
      runSearch(priceState.q);
    }
  }));
  root.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/prices/watchlist/${b.dataset.unwatch}`, { method: 'DELETE' }))) {
      await loadWatchlist();
      runSearch(priceState.q);
    }
  }));
}

// Tasks

const COLUMNS = [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']];

async function renderTasks() {
  const tasks = await api('/tasks');
  const categories = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort();

  view.innerHTML = `
    <div class="page-head"><div><h1>Tasks</h1><p class="muted small">Your own objectives: unlocks, bosses, collection log targets, anything.</p></div></div>
    <div class="stack">
      <form class="card" id="task-form">
        <div class="form-grid" style="grid-template-columns:2fr 1fr auto">
          <label class="field">Task<input name="title" required maxlength="200" placeholder="e.g. Get Barrows gloves"></label>
          <label class="field"><span>Category <span class="hint">Optional</span></span>
            <input name="category" maxlength="40" list="categories" placeholder="e.g. Unlocks">
            <datalist id="categories">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
          </label>
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
      </form>
      <div class="board">
        ${COLUMNS.map(([status, label], i) => {
          const items = tasks.filter((t) => t.status === status);
          return `<section class="column ${status}">
            <div class="column-head"><h2>${label}</h2><span class="count">${items.length}</span></div>
            ${items.map((t) => `
              <article class="task">
                <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
                  <span class="task-title">${esc(t.title)}</span>
                  ${t.category ? `<span class="tag">${esc(t.category)}</span>` : ''}
                </div>
                ${t.notes ? `<p class="task-notes">${esc(t.notes)}</p>` : ''}
                <div class="task-actions">
                  <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Notes</button>
                  <button class="btn btn-ghost btn-sm" data-del="${t.id}" aria-label="Delete task">Delete</button>
                  ${i > 0 ? `<button class="btn btn-sm" data-move="${t.id}" data-to="${COLUMNS[i - 1][0]}" aria-label="Move to ${COLUMNS[i - 1][1]}">←</button>` : ''}
                  ${i < 2 ? `<button class="btn btn-sm" data-move="${t.id}" data-to="${COLUMNS[i + 1][0]}" aria-label="Move to ${COLUMNS[i + 1][1]}">→</button>` : ''}
                </div>
              </article>`).join('') || '<p class="muted small">Nothing here.</p>'}
          </section>`;
        }).join('')}
      </div>
    </div>`;

  const form = document.getElementById('task-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(form.querySelector('button'), () => api('/tasks', { method: 'POST', body }))) renderTasks();
  });
  view.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/tasks/${b.dataset.move}`, { method: 'PUT', body: { status: b.dataset.to } }))) renderTasks();
  }));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this task?')) return;
    if (await busy(b, () => api(`/tasks/${b.dataset.del}`, { method: 'DELETE' }))) renderTasks();
  }));
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const task = tasks.find((t) => t.id === Number(b.dataset.edit));
    const notes = prompt('Notes', task.notes);
    if (notes === null) return;
    if (await busy(b, () => api(`/tasks/${task.id}`, { method: 'PUT', body: { notes } }))) renderTasks();
  }));
}

// Settings

async function renderSettings() {
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <form class="card" id="settings-form" style="max-width:560px">
      <div class="stack" style="gap:16px">
        <label class="field">Player name
          <input name="player" value="${esc(settings.player)}" maxlength="12" required autocomplete="off" spellcheck="false">
        </label>
        <label class="field"><span>Account type <span class="hint">Picks which hiscores board to read from</span></span>
          <select name="accountType">
            ${Object.entries(settings.accountTypes).map(([k, v]) => `<option value="${k}" ${k === settings.accountType ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Auto-refresh every (hours) <span class="hint">Pulls hiscores and WikiSync in the background. 0 turns it off.</span></span>
          <input name="refreshHours" type="number" min="0" max="168" step="0.5" value="${settings.refreshHours}">
        </label>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save</button></div>
    </form>`;

  const form = document.getElementById('settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    const changedPlayer = body.player.trim() !== settings.player || body.accountType !== settings.accountType;
    if (!(await busy(btn, () => api('/settings', { method: 'PUT', body }), 'Settings saved'))) return;
    await loadSettings();
    // Pull fresh data straight away for a new character so Overview isn't empty.
    if (changedPlayer) {
      await busy(btn, async () => {
        await api('/stats/refresh', { method: 'POST' });
        await api('/progress/sync', { method: 'POST' }).catch(() => {});
      }, 'Stats loaded');
      location.hash = '#/overview';
    }
  });
}

// Router

const ROUTES = { overview: renderOverview, goals: renderGoals, quests: renderQuests, prices: renderPrices, tasks: renderTasks, settings: renderSettings };

async function route() {
  const name = location.hash.replace('#/', '') || 'overview';
  const render = ROUTES[name] || renderOverview;
  document.querySelectorAll('.nav a').forEach((a) => a.removeAttribute('aria-current'));
  document.querySelector(`.nav a[data-route="${name}"]`)?.setAttribute('aria-current', 'page');
  try {
    if (!settings) await loadSettings();
    await render();
  } catch (err) {
    view.innerHTML = emptyState('Something went wrong', esc(err.message));
  }
}

window.addEventListener('hashchange', () => {
  route();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
route();
