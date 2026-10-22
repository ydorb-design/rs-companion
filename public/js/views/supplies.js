import {
  api, bindItemPicker, busy, esc, fmt, img, itemIcon, itemPickerMarkup, needsAccount, short, state, view,
} from '../lib.js';

export async function renderSupplies() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const data = await api('/supplies');
  const low = data.items.filter((i) => i.low);

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Supplies</h1><p class="muted small">Keep count of your stockpile. Set a target to aim for, and a low level to get a warning on the Overview.</p></div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Items tracked</div><div class="kpi-value">${data.items.length}</div></div>
        <div class="kpi"><div class="kpi-label">Running low</div><div class="kpi-value ${low.length ? 'warn' : ''}">${low.length}</div></div>
        <div class="kpi"><div class="kpi-label">Stockpile value</div><div class="kpi-value">${short(data.totalValue)}</div></div>
      </div>

      <form class="card" id="supply-form">
        <div class="card-head"><h2>Add a supply</h2></div>
        <div class="form-grid" style="grid-template-columns:2fr 1fr 1fr 1fr auto">
          <label class="field">Item${itemPickerMarkup('e.g. Prayer potion(4)')}</label>
          <label class="field">Have<input name="qty" type="number" min="0" value="0" inputmode="numeric"></label>
          <label class="field"><span>Target <span class="hint">Optional</span></span><input name="target" type="number" min="0" inputmode="numeric"></label>
          <label class="field"><span>Low at <span class="hint">Optional</span></span><input name="lowAt" type="number" min="0" inputmode="numeric"></label>
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
      </form>

      ${data.items.length ? `<section class="supplies">${data.items.map((i) => {
        const pct = i.target ? Math.min(100, (i.qty / i.target) * 100) : null;
        return `<article class="supply ${i.low ? 'low' : ''}" data-id="${i.id}">
          <div class="supply-head">
            <span class="item">${img(itemIcon(i.icon))}<b>${esc(i.itemName)}</b></span>
            ${i.low ? '<span class="tag warn-tag">Low</span>' : ''}
            <button class="btn btn-ghost btn-sm icon-btn" data-remove aria-label="Remove ${esc(i.itemName)}">✕</button>
          </div>
          <div class="supply-count num">${fmt(i.qty)}${i.target ? `<span class="muted"> / ${fmt(i.target)}</span>` : ''}</div>
          ${pct != null ? `<div class="bar ${pct >= 100 ? 'done' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>` : ''}
          <div class="supply-meta muted small">${[i.lowAt != null ? `Low at ${fmt(i.lowAt)}` : '', i.value != null ? `${short(i.value)} gp` : ''].filter(Boolean).join(' · ') || '&nbsp;'}</div>
          <form class="supply-adjust">
            <input name="amount" type="number" placeholder="Amount" aria-label="Amount" inputmode="numeric">
            <button class="btn btn-sm" type="submit" data-op="add" title="Add to stock">Add</button>
            <button class="btn btn-sm" type="submit" data-op="use" title="Take from stock">Use</button>
            <button class="btn btn-sm" type="submit" data-op="set" title="Set exact count">Set</button>
          </form>
          <details class="supply-edit"><summary class="small muted">Edit target</summary>
            <form class="form-grid supply-targets" style="grid-template-columns:1fr 1fr auto;margin-top:8px">
              <label class="field">Target<input name="target" type="number" min="0" value="${i.target ?? ''}" inputmode="numeric"></label>
              <label class="field">Low at<input name="lowAt" type="number" min="0" value="${i.lowAt ?? ''}" inputmode="numeric"></label>
              <button class="btn btn-sm" type="submit">Save</button>
            </form>
          </details>
        </article>`;
      }).join('')}</section>`
        : '<div class="card empty"><p>Add the supplies you want to keep stocked, like potions, food, runes or herbs.</p></div>'}
    </div></div>`;

  const form = document.getElementById('supply-form');
  bindItemPicker(form.querySelector('.picker'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(e.submitter, () => api('/supplies', { method: 'POST', body }), 'Added')) renderSupplies();
  });

  view.querySelectorAll('.supply').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('.supply-adjust').addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = Number(e.target.amount.value);
      if (e.target.amount.value === '' || !Number.isFinite(n)) return e.target.amount.focus();
      const op = e.submitter?.dataset.op || 'add';
      const body = op === 'set' ? { qty: n } : { add: op === 'use' ? -n : n };
      if (await busy(e.submitter, () => api(`/supplies/${id}`, { method: 'PUT', body }))) renderSupplies();
    });
    card.querySelector('.supply-targets').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { target: e.target.target.value, lowAt: e.target.lowAt.value };
      if (await busy(e.submitter, () => api(`/supplies/${id}`, { method: 'PUT', body }), 'Saved')) renderSupplies();
    });
    card.querySelector('[data-remove]').addEventListener('click', async (e) => {
      if (!confirm('Remove this supply?')) return;
      if (await busy(e.currentTarget, () => api(`/supplies/${id}`, { method: 'DELETE' }))) renderSupplies();
    });
  });
}
