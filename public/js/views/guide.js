import {
  api, busy, esc, needsAccount, segmented, state, toast, view, wikiUrl,
} from '../lib.js';

const ui = { stage: 'all', category: 'all', hideDone: false };
const CATEGORIES = [['all', 'All'], ['quest', 'Quests'], ['gear', 'Gear'], ['item', 'Items'], ['skill', 'Skills'], ['diary', 'Diaries']];
const CATEGORY_LABEL = { quest: 'Quest', gear: 'Gear', item: 'Item', skill: 'Skill', diary: 'Diary' };
const STATUS_LABEL = { done: 'Done', ready: 'Ready', locked: 'Not yet', todo: 'To do' };

function stepCard(s) {
  const checks = [...s.requires, ...s.done.filter((c) => !c.item || s.requires.length === 0)];
  return `<article class="guide-step ${s.status}">
    <div class="guide-head">
      <span class="status-pill ${s.status}">${STATUS_LABEL[s.status]}</span>
      <span class="tag">${CATEGORY_LABEL[s.category]}</span>
    </div>
    <h3><a class="plain" href="${wikiUrl(s.wiki)}" target="_blank" rel="noopener">${esc(s.title)}</a></h3>
    <p class="guide-why">${esc(s.why)}</p>
    ${checks.length ? `<ul class="checks-list">${checks.map((c) => `<li class="${c.met ? 'met' : ''}"><span aria-hidden="true">${c.met ? '✓' : '○'}</span>${esc(c.label)}</li>`).join('')}</ul>` : ''}
    <div class="guide-actions">
      ${s.status === 'done'
        ? (s.manual && !s.auto ? `<button class="btn btn-ghost btn-sm" data-undo="${s.id}">Undo</button>` : '<span class="muted small">Ticked automatically</span>')
        : `<button class="btn btn-sm" data-done="${s.id}">Mark done</button>
           ${s.onBoard ? '<span class="muted small">On your task board</span>' : `<button class="btn btn-ghost btn-sm" data-task="${s.id}">Add to tasks</button>`}`}
    </div>
  </article>`;
}

export async function renderGuide() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const g = await api('/guide');
  const doneCount = (list) => list.filter((s) => s.status === 'done').length;
  const upNext = g.steps.filter((s) => s.status === 'ready').slice(0, 4);
  const visible = g.steps.filter((s) => (ui.stage === 'all' || s.stage === ui.stage)
    && (ui.category === 'all' || s.category === ui.category)
    && !(ui.hideDone && s.status === 'done'));

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <h1>Iron guide</h1>
        <p class="muted small">Key ironman milestones and why they matter. Quests, skills and diaries tick off from your stats and WikiSync; gear and items tick off from your collection log list, or by hand.</p>
      </div>
    </div>
    <div class="stack">
      ${!g.hasStats || !g.hasSync ? `<p class="notice">${!g.hasStats ? 'Refresh your stats on the Overview' : ''}${!g.hasStats && !g.hasSync ? ' and ' : ''}${!g.hasSync ? 'sync from WikiSync on Quests &amp; diaries' : ''} so the guide can tick steps off for you.</p>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Overall</div><div class="kpi-value">${doneCount(g.steps)}<span class="kpi-sub muted"> / ${g.steps.length}</span></div>
          <div class="bar" style="margin-top:8px"><span style="width:${((doneCount(g.steps) / g.steps.length) * 100).toFixed(1)}%"></span></div></div>
        ${g.stages.map((st) => {
          const list = g.steps.filter((s) => s.stage === st.id);
          return `<div class="kpi"><div class="kpi-label">${esc(st.name)}</div><div class="kpi-value">${doneCount(list)}<span class="kpi-sub muted"> / ${list.length}</span></div>
            <div class="bar ${doneCount(list) === list.length ? 'done' : ''}" style="margin-top:8px"><span style="width:${((doneCount(list) / list.length) * 100).toFixed(1)}%"></span></div></div>`;
        }).join('')}
      </div>

      ${upNext.length ? `<section class="card">
        <div class="card-head"><h2>Up next</h2><span class="muted small">Steps you meet the requirements for</span></div>
        <div class="guide-grid">${upNext.map(stepCard).join('')}</div>
      </section>` : ''}

      <div class="filter-bar">
        ${segmented('stage', [['all', 'All stages'], ...g.stages.map((s) => [s.id, s.name])], ui.stage, 'Stage')}
        ${segmented('category', CATEGORIES, ui.category, 'Category')}
        <label class="check-inline"><input type="checkbox" id="hide-done" ${ui.hideDone ? 'checked' : ''}> Hide done</label>
      </div>

      ${g.stages.filter((st) => ui.stage === 'all' || st.id === ui.stage).map((st) => {
        const list = visible.filter((s) => s.stage === st.id);
        if (!list.length) return '';
        return `<section>
          <div class="section-head"><h2>${esc(st.name)}</h2><p class="muted small">${esc(st.blurb)}</p></div>
          <div class="guide-grid">${list.map(stepCard).join('')}</div>
        </section>`;
      }).join('') || '<div class="card empty"><p>Nothing matches these filters.</p></div>'}

      <p class="hint">A general route, not the only one. Use the wiki links to check details, and tick off anything you've done another way.</p>
    </div></div>`;

  view.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { ui.stage = b.dataset.stage; renderGuide(); }));
  view.querySelectorAll('[data-category]').forEach((b) => b.addEventListener('click', () => { ui.category = b.dataset.category; renderGuide(); }));
  document.getElementById('hide-done').addEventListener('change', (e) => { ui.hideDone = e.target.checked; renderGuide(); });
  view.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/guide/${b.dataset.done}`, { method: 'PUT', body: { done: true } }))) renderGuide();
  }));
  view.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/guide/${b.dataset.undo}`, { method: 'PUT', body: { done: false } }))) renderGuide();
  }));
  view.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/guide/${b.dataset.task}/task`, { method: 'POST' }))) {
      toast('Added to your task board');
      renderGuide();
    }
  }));
}
