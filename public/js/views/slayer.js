import {
  api, busy, esc, fmt, needsAccount, state, toast, view, wikiUrl,
} from '../lib.js';

export async function renderSlayer() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const [s, stats] = await Promise.all([api('/slayer'), api('/stats')]);
  const level = stats.latest?.skills.find((x) => x.name === 'Slayer')?.level;
  const t = s.current;
  const masterOptions = (selected) => `<option value="">Master (optional)</option>${s.masters.map((m) => `<option ${m === selected ? 'selected' : ''}>${esc(m)}</option>`).join('')}`;
  const lastMaster = s.history.find((h) => h.master)?.master || '';

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Slayer</h1><p class="muted small">Track your task as you go. Points and task details are entered by you, as the hiscores only show Slayer XP.</p></div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Slayer level</div><div class="kpi-value">${level ?? '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Points</div><div class="kpi-value">${s.points != null ? fmt(s.points) : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Tasks completed</div><div class="kpi-value">${fmt(s.completed)}<span class="kpi-sub muted"> · ${s.skipped} skipped</span></div></div>
        <div class="kpi"><div class="kpi-label">Most assigned</div><div class="kpi-value kpi-text">${s.topMonster ? esc(s.topMonster.monster) : '–'}</div></div>
      </div>

      <div class="grid-2">
        <section class="card">
          ${t ? `
            <div class="card-head">
              <div><p class="muted small">Current task${t.master ? ` from ${esc(t.master)}` : ''}</p><h2><a href="${wikiUrl(t.monster)}" target="_blank" rel="noopener" class="plain">${esc(t.monster)}</a></h2></div>
              <span class="task-count num">${fmt(t.kills)} <span class="muted">/ ${fmt(t.amount)}</span></span>
            </div>
            <div class="bar ${t.kills >= t.amount ? 'done' : ''}" style="height:10px"><span style="width:${((t.kills / t.amount) * 100).toFixed(1)}%"></span></div>
            <p class="muted small" style="margin-top:6px">${t.kills >= t.amount ? 'Task finished. Mark it complete below.' : `${fmt(t.amount - t.kills)} left`}</p>
            <div class="row" style="margin-top:16px">
              ${[-1, 1, 5, 10].map((n) => `<button class="btn" data-add="${n}">${n > 0 ? '+' : ''}${n}</button>`).join('')}
              <form id="set-kills" class="row" style="gap:6px">
                <input name="kills" type="number" min="0" max="${t.amount}" placeholder="Set" aria-label="Set kill count" style="width:90px" inputmode="numeric">
                <button class="btn" type="submit">Set</button>
              </form>
            </div>
            <form id="end-task" class="form-grid" style="margin-top:20px;grid-template-columns:1fr auto auto">
              <label class="field"><span>Points earned <span class="hint">Optional, added to your total</span></span>
                <input name="points" type="number" min="0" max="10000" inputmode="numeric">
              </label>
              <button class="btn btn-primary" type="submit" data-outcome="complete">Complete</button>
              <button class="btn" type="submit" data-outcome="skip">Skip</button>
            </form>`
            : `<div class="card-head"><h2>New task</h2></div>`}
          <form id="new-task" class="form-grid" style="margin-top:${t ? '24px' : '0'};${t ? 'padding-top:20px;border-top:1px solid var(--border)' : ''}">
            ${t ? '<p class="small muted" style="grid-column:1/-1">Got a new task? Starting one marks the current task as skipped.</p>' : ''}
            <label class="field">Monster<input name="monster" required maxlength="60" list="monsters" placeholder="e.g. Abyssal demons"></label>
            <datalist id="monsters">${s.monsters.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
            <label class="field">Amount<input name="amount" type="number" min="1" max="1000" required inputmode="numeric"></label>
            <label class="field">Master<select name="master">${masterOptions(t?.master || lastMaster)}</select></label>
            <button class="btn ${t ? '' : 'btn-primary'}" type="submit">Start task</button>
          </form>
        </section>

        <section class="card">
          <div class="card-head"><h2>Points</h2></div>
          <form id="points" class="form-grid" style="grid-template-columns:1fr auto">
            <label class="field"><span>Current points <span class="hint">Check the Slayer rewards screen in game</span></span>
              <input name="points" type="number" min="0" max="100000" value="${s.points ?? ''}" inputmode="numeric">
            </label>
            <button class="btn" type="submit">Save</button>
          </form>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>Task history</h2></div>
        ${s.history.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Monster</th><th class="r">Amount</th><th>Master</th><th>Result</th><th class="r">Points</th><th></th></tr></thead>
          <tbody>${s.history.map((h) => `<tr>
            <td class="muted nowrap">${new Date(h.endedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
            <td>${esc(h.monster)}</td>
            <td class="r">${h.outcome === 'skip' && h.kills ? `${fmt(h.kills)} / ` : ''}${fmt(h.amount)}</td>
            <td class="muted">${esc(h.master)}</td>
            <td>${h.outcome === 'complete' ? '<span class="pos">Complete</span>' : '<span class="muted">Skipped</span>'}</td>
            <td class="r">${h.points ?? ''}</td>
            <td class="r"><button class="btn btn-ghost btn-sm" data-delete="${h.id}" aria-label="Delete task">Delete</button></td>
          </tr>`).join('')}</tbody></table></div>`
          : '<p class="muted small">Finished tasks show up here.</p>'}
      </section>
    </div></div>`;

  const reload = () => renderSlayer();
  view.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api('/slayer/task', { method: 'PUT', body: { add: Number(b.dataset.add) } }))) reload();
  }));
  document.getElementById('set-kills')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kills = e.target.kills.value;
    if (kills === '') return;
    if (await busy(e.submitter, () => api('/slayer/task', { method: 'PUT', body: { kills: Number(kills) } }))) reload();
  });
  document.getElementById('end-task')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const outcome = e.submitter?.dataset.outcome || 'complete';
    const body = { outcome, points: e.target.points.value };
    if (await busy(e.submitter, () => api('/slayer/task/end', { method: 'POST', body }), outcome === 'complete' ? 'Task complete' : 'Task skipped')) reload();
  });
  document.getElementById('new-task').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (await busy(e.submitter, () => api('/slayer/task', { method: 'POST', body }), 'Task started')) reload();
  });
  document.getElementById('points').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await busy(e.submitter, () => api('/slayer/points', { method: 'PUT', body: { points: e.target.points.value } }), 'Points saved')) reload();
  });
  view.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this task from your history?')) return;
    if (await busy(b, () => api(`/slayer/task/${b.dataset.delete}`, { method: 'DELETE' }))) {
      toast('Task deleted');
      reload();
    }
  }));
}
