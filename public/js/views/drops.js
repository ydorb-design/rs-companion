import {
  api, bindItemPicker, busy, esc, fmt, gp, img, itemIcon, itemPickerMarkup, needsAccount, short, state, toast, view,
} from '../lib.js';

export async function renderDrops() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const [d, acts] = await Promise.all([api('/drops'), api('/activities').catch(() => ({ activities: [] }))]);
  // Suggest sources you've used before plus bosses you're ranked at.
  const sources = [...new Set([...d.sources, ...(acts.activities || []).filter((a) => a.group === 'bosses').map((a) => a.name)])].sort();
  const t = d.totals;

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Drops</h1><p class="muted small">Log notable drops. Value uses the GE price when you logged it; untradeable items use their high alch value.</p></div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total value logged</div><div class="kpi-value">${short(t.value)}</div></div>
        <div class="kpi"><div class="kpi-label">Last 30 days</div><div class="kpi-value">${short(t.month)}</div></div>
        <div class="kpi"><div class="kpi-label">Drops logged</div><div class="kpi-value">${fmt(t.count)}</div></div>
        <div class="kpi"><div class="kpi-label">Biggest drop</div><div class="kpi-value kpi-text">${t.biggest ? esc(t.biggest.itemName) : '–'}</div></div>
      </div>

      <form class="card" id="drop-form">
        <div class="card-head"><h2>Log a drop</h2></div>
        <div class="form-grid" style="grid-template-columns:2fr 0.7fr 1.5fr">
          <label class="field">Item${itemPickerMarkup('e.g. Abyssal whip')}</label>
          <label class="field">Quantity<input name="qty" type="number" min="1" value="1" required inputmode="numeric"></label>
          <label class="field"><span>From <span class="hint">Optional</span></span><input name="source" maxlength="60" list="sources" placeholder="e.g. Abyssal demons"></label>
          <datalist id="sources">${sources.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        </div>
        <label class="field" style="margin-top:12px"><span>Note <span class="hint">Optional</span></span><input name="note" maxlength="200"></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Log drop</button></div>
      </form>

      <section class="card">
        <div class="card-head"><h2>Recent drops</h2></div>
        ${d.drops.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Item</th><th class="r">Qty</th><th>From</th><th class="r">Value</th><th class="r">Worth now</th><th>Date</th><th></th></tr></thead>
          <tbody>${d.drops.map((x) => `<tr>
            <td><span class="item">${img(itemIcon(x.icon))}<span>${esc(x.itemName)}${x.note ? `<br><span class="muted small">${esc(x.note)}</span>` : ''}</span></span></td>
            <td class="r">${fmt(x.qty)}</td>
            <td class="muted">${esc(x.source)}</td>
            <td class="r">${gp(x.valueThen)}</td>
            <td class="r muted">${x.valueNow != null ? gp(x.valueNow) : '–'}</td>
            <td class="muted nowrap">${new Date(x.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
            <td class="r"><button class="btn btn-ghost btn-sm" data-delete="${x.id}" aria-label="Delete ${esc(x.itemName)}">Delete</button></td>
          </tr>`).join('')}</tbody></table></div>`
          : '<p class="muted small">Nothing logged yet.</p>'}
      </section>
    </div></div>`;

  const form = document.getElementById('drop-form');
  const picker = bindItemPicker(form.querySelector('.picker'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    let result;
    if (await busy(e.submitter, async () => (result = await api('/drops', { method: 'POST', body })))) {
      toast(result.collectionLog ? `Logged, and ticked off your collection log` : 'Drop logged');
      picker.reset();
      renderDrops();
    }
  });
  view.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this drop?')) return;
    if (await busy(b, () => api(`/drops/${b.dataset.delete}`, { method: 'DELETE' }))) renderDrops();
  }));
}
