import {
  ago, api, busy, duration, emptyState, esc, fmt, gp, img, itemIcon, needsAccount, short, skillIcon, state, toast, view, viewInterval,
} from '../lib.js';

export async function renderSessions() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const { active, history, totals } = await api('/sessions');

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Sessions</h1><p class="muted small">Start a session when you log in and end it when you stop. You'll see the XP, kills and loot from that sitting.</p></div>
    </div>
    <div class="stack">
      ${active ? activeCard(active) : `
        <form class="card" id="start-form">
          <div class="card-head"><h2>Start a session</h2></div>
          <div class="form-grid" style="grid-template-columns:minmax(0,1fr) auto">
            <label class="field"><span>What are you doing? <span class="hint">Optional</span></span>
              <input name="note" maxlength="120" placeholder="e.g. Vorkath, or 70-80 Agility at Seers'"></label>
            <button class="btn btn-primary" type="submit">Start session</button>
          </div>
          <p class="hint" style="margin-top:12px">Your stats are read from the hiscores at the start and end. The hiscores can lag behind the game by a minute or two, so end the session after you log out.</p>
        </form>`}

      ${history.length ? `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Sessions</div><div class="kpi-value">${history.length}</div></div>
          <div class="kpi"><div class="kpi-label">Time played</div><div class="kpi-value kpi-text">${duration(totals.hours * 3600000)}</div></div>
          <div class="kpi"><div class="kpi-label">XP gained</div><div class="kpi-value">${short(totals.xp)}</div></div>
          <div class="kpi"><div class="kpi-label">Loot logged</div><div class="kpi-value">${short(totals.loot)}</div></div>
        </div>
        <section class="card">
          <div class="card-head"><h2>Past sessions</h2><span class="count">${history.length}</span></div>
          <div class="sessions">${history.map(pastSession).join('')}</div>
        </section>`
        : active ? '' : emptyState('No sessions yet', 'Your past sessions will be listed here with their XP rates and loot.')}
    </div></div>`;

  document.getElementById('start-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    let warning;
    const body = Object.fromEntries(new FormData(e.target));
    const ok = await busy(e.submitter, async () => ({ warning } = await api('/sessions', { method: 'POST', body })));
    if (!ok) return;
    toast(warning || 'Session started');
    renderSessions();
  });

  if (active) {
    const el = document.getElementById('elapsed');
    viewInterval(() => (el.textContent = duration(Date.now() - active.startedAt)), 30000);
    document.getElementById('update-session').addEventListener('click', async (e) => {
      let warning;
      if (await busy(e.currentTarget, async () => ({ warning } = await api(`/sessions/${active.id}/update`, { method: 'POST' })))) {
        toast(warning || 'Stats updated');
        renderSessions();
      }
    });
    document.getElementById('end-session').addEventListener('click', async (e) => {
      let res;
      if (!(await busy(e.currentTarget, async () => (res = await api(`/sessions/${active.id}/end`, { method: 'POST' }))))) return;
      const s = res.session;
      toast(res.warning || `Session ended: ${duration(s.hours * 3600000)}, ${short(s.xp)} XP${s.lootValue ? `, ${short(s.lootValue)} gp loot` : ''}`);
      renderSessions();
    });
  }

  view.querySelectorAll('[data-delete-session]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this session? Your stats and drops stay as they are.')) return;
    if (await busy(b, () => api(`/sessions/${b.dataset.deleteSession}`, { method: 'DELETE' }))) renderSessions();
  }));
}

function activeCard(s) {
  return `<section class="card session-live">
    <div class="card-head">
      <div>
        <h2>Session running</h2>
        <p class="muted small">${s.note ? `${esc(s.note)} · ` : ''}Started ${new Date(s.startedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}${s.statsAt ? ` · Stats from ${ago(s.statsAt)}` : ''}</p>
      </div>
      <div class="row">
        <button class="btn" id="update-session">Update stats</button>
        <button class="btn btn-primary" id="end-session">End session</button>
      </div>
    </div>
    <dl class="facts">
      <div><dt>Time</dt><dd id="elapsed">${duration(Date.now() - s.startedAt)}</dd></div>
      <div><dt>XP gained</dt><dd>${fmt(s.xp)}</dd></div>
      <div><dt>XP per hour</dt><dd>${s.xp ? fmt(s.xpPerHour) : '–'}</dd></div>
      <div><dt>Loot</dt><dd>${s.lootValue ? gp(s.lootValue) : '–'}</dd></div>
    </dl>
    ${sessionDetail(s)}
  </section>`;
}

function pastSession(s) {
  const date = new Date(s.startedAt);
  const top = s.skills.slice(0, 3).map((x) => x.name).concat(s.activities.slice(0, 2).map((a) => a.name));
  return `<details class="session">
    <summary>
      <span class="session-when"><b>${date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        <span class="muted small">${date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · ${duration(s.hours * 3600000)}</span></span>
      <span class="session-what">${s.note ? esc(s.note) : top.length ? `<span class="muted">${esc(top.join(', '))}</span>` : '<span class="muted">No changes recorded</span>'}</span>
      <span class="session-nums num small"><span>${short(s.xp)} XP</span>${s.lootValue ? `<span>${short(s.lootValue)} gp</span>` : ''}</span>
    </summary>
    <div class="session-body">
      ${sessionDetail(s)}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-sm btn-ghost" data-delete-session="${s.id}">Delete session</button></div>
    </div>
  </details>`;
}

function sessionDetail(s) {
  const parts = [];
  if (s.skills.length) {
    parts.push(`<div class="table-wrap"><table>
      <thead><tr><th>Skill</th><th class="r">XP</th><th class="r">Per hour</th><th class="r">Level</th></tr></thead>
      <tbody>${s.skills.map((x) => `<tr>
        <td><a class="item" href="#/skill/${encodeURIComponent(x.name)}">${img(skillIcon(x.name))}${esc(x.name)}</a></td>
        <td class="r pos num">+${fmt(x.xp)}</td>
        <td class="r num">${fmt(x.perHour)}</td>
        <td class="r num">${x.levels ? `${x.from} → <b>${x.to}</b>` : x.to}</td>
      </tr>`).join('')}</tbody>
    </table></div>`);
  }
  if (s.activities.length) {
    parts.push(`<div class="table-wrap"><table>
      <thead><tr><th>${s.activities.every((a) => a.group === 'clues') ? 'Clues' : 'Kills and clues'}</th><th class="r">Gained</th><th class="r">Per hour</th><th class="r">Total</th></tr></thead>
      <tbody>${s.activities.map((a) => `<tr><td>${esc(a.name)}</td><td class="r pos num">+${fmt(a.gained)}</td><td class="r num">${(a.gained / s.hours).toFixed(1)}</td><td class="r num">${fmt(a.score)}</td></tr>`).join('')}</tbody>
    </table></div>`);
  }
  if (s.drops.length) {
    parts.push(`<div class="table-wrap"><table>
      <thead><tr><th>Drops logged</th><th class="r">Qty</th><th class="r">Value</th></tr></thead>
      <tbody>${s.drops.map((d) => `<tr><td><span class="item">${img(itemIcon(d.icon))}<span>${esc(d.itemName)}${d.source ? ` <span class="muted small">${esc(d.source)}</span>` : ''}</span></span></td><td class="r num">${fmt(d.qty)}</td><td class="r num">${d.value != null ? short(d.value) : '–'}</td></tr>`).join('')}</tbody>
      ${s.lootValue ? `<tfoot><tr><td>Total</td><td></td><td class="r num"><b>${short(s.lootValue)}</b> <span class="muted small">${short(s.lootPerHour)}/h</span></td></tr></tfoot>` : ''}
    </table></div>`);
  }
  if (!parts.length) {
    return `<p class="muted small" style="margin-top:12px">${s.active
      ? 'Nothing gained yet. Press Update stats after you\'ve played for a bit, or log drops on the Drops page (Dink logs them for you).'
      : 'No XP, kills or drops were recorded in this session.'}</p>`;
  }
  return `<div class="session-tables">${parts.join('')}</div>`;
}
