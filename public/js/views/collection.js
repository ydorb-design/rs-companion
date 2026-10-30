import {
  api, bindItemPicker, busy, esc, fmt, img, itemIcon, itemPickerMarkup, needsAccount, segmented, state, view, wikiUrl,
} from '../lib.js';

const ui = { filter: 'missing', editing: null };

const rateText = (rate) => (rate >= 1 ? 'Always' : `1/${fmt(1 / rate)}`);
const percent = (p) => `${p >= 0.995 && p < 1 ? '>99' : Math.round(p * 100)}%`;

// "412 kills · 1/512 · 55% chance by now", with a Dry tag once you're past the drop rate.
function dryLine(i) {
  const parts = [];
  if (i.kc != null) parts.push(`${fmt(i.kc)} kills${i.kcFrom === 'manual' ? ' (yours)' : ''}`);
  if (i.rate != null) parts.push(`${rateText(i.rate)}${i.rateFrom === 'manual' ? ' (yours)' : ''}`);
  if (i.dry) parts.push(`${percent(i.dry.chance)} chance by now`);
  const tag = i.dry && i.dry.ratio >= 2 ? '<span class="tag tag-danger">Very dry</span>' : i.dry && i.dry.ratio >= 1 ? '<span class="tag tag-warn">Dry</span>' : '';
  const missing = i.rate == null ? 'No drop rate' : i.kc == null ? 'No kill count' : '';
  return `<span class="clog-dry small">${tag}<span class="muted">${esc(parts.join(' · '))}${missing ? `${parts.length ? ' · ' : ''}${missing}` : ''}</span>
    <button class="link-btn small" data-edit="${i.id}">${i.rate == null || i.kc == null ? 'Add' : 'Edit'}</button></span>`;
}

const editForm = (i) => `<form class="clog-edit" data-edit-form="${i.id}">
  <label class="field"><span>Drop rate <span class="hint">e.g. 1/512</span></span><input name="rate" value="${i.rateFrom === 'manual' ? esc(rateText(i.rate)) : ''}" placeholder="${i.rate != null ? esc(rateText(i.rate)) : '1/512'}" maxlength="20"></label>
  <label class="field"><span>Kill count <span class="hint">If it isn't tracked</span></span><input name="kc" type="number" min="0" inputmode="numeric" value="${i.kcFrom === 'manual' ? i.kc : ''}" placeholder="${i.kc ?? ''}"></label>
  <div class="row"><button class="btn btn-sm btn-primary" type="submit">Save</button><button class="btn btn-sm btn-ghost" type="button" data-cancel>Cancel</button></div>
  <p class="hint">Leave a box empty to use the wiki's rate or your tracked kill count.</p>
</form>`;

export async function renderCollection() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const [c, acts] = await Promise.all([api('/collection-log'), api('/activities').catch(() => ({ activities: [] }))]);
  const obtained = c.items.filter((i) => i.obtainedAt).length;
  const driest = c.items.filter((i) => i.dry?.ratio >= 1).sort((a, b) => b.dry.ratio - a.dry.ratio)[0];
  const visible = c.items.filter((i) => ui.filter === 'all' || (ui.filter === 'missing' ? !i.obtainedAt : i.obtainedAt));
  const groups = new Map();
  for (const i of visible) {
    const key = i.source || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const sources = [...new Set([...c.items.map((i) => i.source).filter(Boolean), ...(acts.activities || []).filter((a) => a.group === 'bosses').map((a) => a.name)])].sort();

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Collection log</h1><p class="muted small">Items you're chasing. They tick off automatically when you log the drop, or tick them yourself. Drop rates come from the wiki and kill counts from the hiscores or Dink, so you can see how dry you are.</p></div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Slots logged in game</div><div class="kpi-value">${c.live ? `${fmt(c.live.completed)}${c.live.total ? `<span class="kpi-sub muted"> / ${fmt(c.live.total)}</span>` : ''}` : c.hiscoresLogged != null ? fmt(c.hiscoresLogged) : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">On your list</div><div class="kpi-value">${c.items.length}</div></div>
        <div class="kpi"><div class="kpi-label">Obtained</div><div class="kpi-value">${obtained}<span class="kpi-sub muted"> / ${c.items.length}</span></div></div>
        ${driest ? `<div class="kpi"><div class="kpi-label">Driest</div><div class="kpi-value kpi-text">${esc(driest.itemName)}</div><div class="kpi-sub muted">${driest.dry.ratio.toFixed(1)}× the drop rate</div></div>` : ''}
      </div>

      <form class="card" id="clog-form">
        <div class="card-head"><h2>Add an item to chase</h2></div>
        <div class="form-grid" style="grid-template-columns:2fr 1.5fr auto">
          <label class="field">Item${itemPickerMarkup('e.g. Tanzanite fang')}</label>
          <label class="field">From<input name="source" maxlength="60" list="clog-sources" required placeholder="e.g. Zulrah"></label>
          <datalist id="clog-sources">${sources.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
      </form>

      <div class="row">${segmented('filter', [['missing', 'Still chasing'], ['obtained', 'Obtained'], ['all', 'All']], ui.filter, 'Filter')}</div>

      ${groups.size ? `<div class="clog-groups">${[...groups].map(([source, items]) => {
        const all = c.items.filter((i) => (i.source || 'Other') === source);
        const got = all.filter((i) => i.obtainedAt).length;
        return `<section class="card">
          <div class="card-head">
            <h2><a class="plain" href="${wikiUrl(source)}" target="_blank" rel="noopener">${esc(source)}</a></h2>
            <span class="count">${got} / ${all.length}</span>
          </div>
          <ul class="clog-items">${items.map((i) => `<li class="${i.obtainedAt ? 'got' : ''}">
            <label class="clog-check">
              <input type="checkbox" data-obtained="${i.id}" ${i.obtainedAt ? 'checked' : ''}>
              ${img(itemIcon(i.icon))}<span>${esc(i.itemName)}</span>
            </label>
            ${i.obtainedAt ? `<span class="muted small">${new Date(i.obtainedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}</span>` : ''}
            <button class="btn btn-ghost btn-sm icon-btn" data-remove="${i.id}" aria-label="Remove ${esc(i.itemName)}">✕</button>
            ${i.obtainedAt ? '' : dryLine(i)}
            ${ui.editing === i.id ? editForm(i) : ''}
          </li>`).join('')}</ul>
        </section>`;
      }).join('')}</div>`
        : `<div class="card empty"><p>${c.items.length ? 'Nothing here with this filter.' : 'Add items above to start your list.'}</p></div>`}
    </div></div>`;

  const form = document.getElementById('clog-form');
  bindItemPicker(form.querySelector('.picker'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(e.submitter, () => api('/collection-log', { method: 'POST', body }), 'Added')) renderCollection();
  });
  view.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.filter; renderCollection(); }));
  view.querySelectorAll('[data-obtained]').forEach((box) => box.addEventListener('change', async () => {
    if (await busy(box, () => api(`/collection-log/${box.dataset.obtained}`, { method: 'PUT', body: { obtained: box.checked } }))) renderCollection();
  }));
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { ui.editing = Number(b.dataset.edit); renderCollection(); }));
  view.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { ui.editing = null; renderCollection(); }));
  view.querySelectorAll('[data-edit-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { rate: f.rate.value.trim(), kc: f.kc.value };
    if (await busy(e.submitter, () => api(`/collection-log/${f.dataset.editForm}`, { method: 'PUT', body }), 'Saved')) {
      ui.editing = null;
      renderCollection();
    }
  }));
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/collection-log/${b.dataset.remove}`, { method: 'DELETE' }))) renderCollection();
  }));
}
