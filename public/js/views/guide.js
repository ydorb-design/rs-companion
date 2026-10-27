import {
  api, ago, busy, esc, needsAccount, segmented, state, toast, view, wikiUrl,
} from '../lib.js';

// Filters per guide, kept while you move between guides.
const filters = {};
const uiFor = (id) => (filters[id] ||= { stage: 'all', category: 'all', hideDone: id === 'quests' });
const STATUS_LABEL = { done: 'Done', ready: 'Ready', locked: 'Not yet', todo: 'To do' };

const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) : 0);
const progressBar = (done, total) => `<div class="bar ${total && done === total ? 'done' : ''}" style="margin-top:8px"><span style="width:${pct(done, total)}%"></span></div>`;

// Segmented buttons for a few options, a select for many.
function filterControl(name, options, current, label) {
  if (options.length <= 6) return segmented(name, options, current, label);
  return `<label class="filter-select"><span class="visually-hidden">${esc(label)}</span>
    <select data-filter="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}

// Route steps are named after what ticks them off, so they only list requirements.
const checksList = (s, { requiresOnly = false } = {}) => {
  const checks = requiresOnly ? s.requires : [...s.requires, ...s.done.filter((c) => !c.item || s.requires.length === 0)];
  return checks.length ? `<ul class="checks-list">${checks.map((c) => `<li class="${c.met ? 'met' : ''}"><span aria-hidden="true">${c.met ? '✓' : '○'}</span>${esc(c.label)}</li>`).join('')}</ul>` : '';
};

function stepActions(s) {
  if (s.status === 'done') {
    return s.manual && !s.auto ? `<button class="btn btn-ghost btn-sm" data-undo="${esc(s.id)}">Undo</button>` : '<span class="muted small">Ticked automatically</span>';
  }
  return `<button class="btn btn-sm" data-done="${esc(s.id)}">Mark done</button>
    ${s.onBoard ? '<span class="muted small">On your task board</span>' : `<button class="btn btn-ghost btn-sm" data-task="${esc(s.id)}">Add to tasks</button>`}`;
}

const notesBlock = (s) => (s.notes.length ? `<details class="guide-notes"><summary>Wiki notes</summary><ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '');

function stepCard(s, categoryLabel) {
  return `<article class="guide-step ${s.status}">
    <div class="guide-head">
      <span class="status-pill ${s.status}">${STATUS_LABEL[s.status]}</span>
      ${categoryLabel ? `<span class="tag">${esc(categoryLabel)}</span>` : ''}
    </div>
    <h3><a class="plain" href="${wikiUrl(s.wiki)}" target="_blank" rel="noopener">${esc(s.title)}</a></h3>
    ${s.why ? `<p class="guide-why">${esc(s.why)}</p>` : ''}
    ${checksList(s)}
    ${notesBlock(s)}
    <div class="guide-actions">${stepActions(s)}</div>
  </article>`;
}

// The quest route is long and ordered, so it's a numbered list rather than cards.
function routeRow(s, n) {
  return `<li class="route-step ${s.status}">
    <span class="route-num num">${n}</span>
    <div class="route-body">
      <div class="route-title">
        <a class="plain" href="${wikiUrl(s.wiki)}" target="_blank" rel="noopener">${esc(s.title)}</a>
        <span class="status-pill ${s.status}">${STATUS_LABEL[s.status]}</span>
        ${s.key ? '<span class="tag">Key unlock</span>' : ''}
      </div>
      ${s.why ? `<p class="guide-why">${esc(s.why)}</p>` : ''}
      ${s.status === 'done' ? '' : checksList(s, { requiresOnly: true })}
      ${notesBlock(s)}
      <div class="guide-actions">${stepActions(s)}</div>
    </div>
  </li>`;
}

export async function renderGuides(id) {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  return id ? renderGuide(id) : renderHub();
}

async function renderHub() {
  const list = await api('/guides');
  view.innerHTML = `<div>
    <div class="page-head"><div><h1>Guides</h1><p class="muted small">Routes and checklists that tick off from your stats, WikiSync, collection log and kill counts.</p></div></div>
    <div class="guide-grid">${list.map((g) => `
      <a class="card guide-card" href="#/guides/${g.id}">
        <h2>${esc(g.name)}</h2>
        <p class="muted small">${esc(g.blurb)}</p>
        <div class="guide-card-foot">
          <span class="small"><span class="num">${g.done}</span> <span class="muted">/ ${g.total} done</span></span>
          ${g.ready ? `<span class="status-pill ready">${g.ready} ready</span>` : ''}
        </div>
        ${progressBar(g.done, g.total)}
      </a>`).join('')}</div>
  </div>`;
}

async function renderGuide(id) {
  const g = await api(`/guides/${encodeURIComponent(id)}`);
  const ui = uiFor(g.id);
  const isRoute = g.fromWiki;
  const categoryName = Object.fromEntries(g.categories);
  const doneCount = (list) => list.filter((s) => s.status === 'done').length;
  const visible = g.steps.filter((s) => (ui.stage === 'all' || s.stage === ui.stage)
    && (ui.category === 'all' || s.category === ui.category)
    && !(ui.hideDone && s.status === 'done'));
  // A route is done in order, so "up next" is the next unfinished steps; elsewhere it's what you can do now.
  const upNext = isRoute ? g.steps.filter((s) => s.status !== 'done').slice(0, 5) : g.steps.filter((s) => s.status === 'ready').slice(0, 4);
  const position = new Map(g.steps.map((s, i) => [s.id, i + 1]));

  const notices = [];
  if (!g.hasStats || !g.hasSync) {
    notices.push(`${!g.hasStats ? 'Refresh your stats on the Overview' : ''}${!g.hasStats && !g.hasSync ? ' and ' : ''}${!g.hasSync ? 'sync from WikiSync on Quests &amp; diaries' : ''} so the guide can tick steps off for you.`);
  }
  if (g.routeError) notices.push(esc(g.routeError));

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <p class="muted small"><a href="#/guides">Guides</a> /</p>
        <h1>${esc(g.name)}</h1>
        <p class="muted small">${esc(g.blurb)}</p>
      </div>
      ${isRoute ? '<div class="row"><a class="btn" href="https://oldschool.runescape.wiki/w/Optimal_quest_guide/Ironman" target="_blank" rel="noopener">Wiki page</a><button class="btn" id="reload-route">Reload route</button></div>' : ''}
    </div>
    <div class="stack">
      ${notices.map((n) => `<p class="notice">${n}</p>`).join('')}
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Overall</div><div class="kpi-value">${doneCount(g.steps)}<span class="kpi-sub muted"> / ${g.steps.length}</span></div>${progressBar(doneCount(g.steps), g.steps.length)}</div>
        ${g.stages.length > 1 && g.stages.length <= 4 ? g.stages.map((st) => {
          const list = g.steps.filter((s) => s.stage === st.id);
          return `<div class="kpi"><div class="kpi-label">${esc(st.name)}</div><div class="kpi-value">${doneCount(list)}<span class="kpi-sub muted"> / ${list.length}</span></div>${progressBar(doneCount(list), list.length)}</div>`;
        }).join('') : ''}
        ${isRoute && g.routeFetchedAt ? `<div class="kpi"><div class="kpi-label">Route loaded</div><div class="kpi-value kpi-text">${ago(g.routeFetchedAt)}</div></div>` : ''}
      </div>

      ${upNext.length ? `<section class="card">
        <div class="card-head"><h2>Up next</h2><span class="muted small">${isRoute ? 'The next steps on the route' : 'Steps you meet the requirements for'}</span></div>
        ${isRoute ? `<ol class="route-list">${upNext.map((s) => routeRow(s, position.get(s.id))).join('')}</ol>` : `<div class="guide-grid">${upNext.map((s) => stepCard(s, categoryName[s.category])).join('')}</div>`}
      </section>` : ''}

      <div class="filter-bar">
        ${g.stages.length > 1 ? filterControl('stage', [['all', 'All'], ...g.stages.map((s) => [s.id, s.name])], ui.stage, 'Section') : ''}
        ${g.categories.length ? filterControl('category', [['all', 'All'], ...g.categories], ui.category, 'Type') : ''}
        <label class="check-inline"><input type="checkbox" id="hide-done" ${ui.hideDone ? 'checked' : ''}> Hide done</label>
      </div>

      ${isRoute
        ? (visible.length ? `<section class="card"><ol class="route-list">${visible.map((s) => routeRow(s, position.get(s.id))).join('')}</ol></section>` : '')
        : g.stages.filter((st) => ui.stage === 'all' || st.id === ui.stage).map((st) => {
          const list = visible.filter((s) => s.stage === st.id);
          if (!list.length) return '';
          return `<section>
            <div class="section-head"><h2>${esc(st.name)}</h2>${st.blurb ? `<p class="muted small">${esc(st.blurb)}</p>` : ''}</div>
            <div class="guide-grid">${list.map((s) => stepCard(s, categoryName[s.category])).join('')}</div>
          </section>`;
        }).join('')}
      ${visible.length ? '' : `<div class="card empty"><p>${g.steps.length ? 'Nothing matches these filters.' : 'Nothing to show yet.'}</p></div>`}

      <p class="hint">${isRoute ? 'From the OSRS Wiki\'s Optimal quest guide for ironmen. Quests tick off from WikiSync; tick unlocks and anything else by hand.' : 'A general route, not the only one. Use the wiki links to check details, and tick off anything you\'ve done another way.'}</p>
    </div></div>`;

  const rerender = () => renderGuide(g.id);
  view.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { ui.stage = b.dataset.stage; rerender(); }));
  view.querySelectorAll('[data-category]').forEach((b) => b.addEventListener('click', () => { ui.category = b.dataset.category; rerender(); }));
  view.querySelectorAll('[data-filter]').forEach((sel) => sel.addEventListener('change', () => { ui[sel.dataset.filter] = sel.value; rerender(); }));
  document.getElementById('hide-done').addEventListener('change', (e) => { ui.hideDone = e.target.checked; rerender(); });
  const stepPath = (stepId) => `/guides/${encodeURIComponent(g.id)}/${encodeURIComponent(stepId)}`;
  view.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(stepPath(b.dataset.done), { method: 'PUT', body: { done: true } }))) rerender();
  }));
  view.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(stepPath(b.dataset.undo), { method: 'PUT', body: { done: false } }))) rerender();
  }));
  view.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`${stepPath(b.dataset.task)}/task`, { method: 'POST' }))) {
      toast('Added to your task board');
      rerender();
    }
  }));
  document.getElementById('reload-route')?.addEventListener('click', async (e) => {
    if (await busy(e.currentTarget, () => api('/guides/quests/reload', { method: 'POST' }), 'Quest route reloaded')) rerender();
  });
}
