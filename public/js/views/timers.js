import {
  api, busy, duration, esc, needsAccount, state, view, viewInterval,
} from '../lib.js';

export async function renderTimers() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const data = await api('/timers');
  // Count down from the server's clock so a wrong device clock doesn't skew timers.
  const offset = data.now - Date.now();
  const nowMs = () => Date.now() + offset;
  const alertsOn = state.settings.discordWebhook || state.settings.ntfyUrl;

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <h1>Timers</h1>
        <p class="muted small">Farming and other run timers for ${esc(state.settings.active.player)}. Growth times are approximate.</p>
      </div>
    </div>
    <div class="stack">
      ${alertsOn ? '' : '<p class="notice">Add a Discord webhook or ntfy URL in <a href="#/settings">Settings</a> to get an alert when a timer finishes.</p>'}
      <section class="card">
        <div class="card-head"><h2>Start a timer</h2></div>
        <div class="presets">
          ${data.presets.map((p) => `<button class="btn" data-preset="${p.id}">${esc(p.label)}<span class="muted small">${p.daily ? '00:00 UTC' : duration(p.minutes * 60000)}</span></button>`).join('')}
        </div>
        <form id="custom-timer" class="form-grid" style="margin-top:16px;grid-template-columns:2fr 1fr auto">
          <label class="field">Custom timer<input name="label" maxlength="60" required placeholder="e.g. Farming contract"></label>
          <label class="field">Minutes<input name="minutes" type="number" min="1" max="20160" required inputmode="numeric"></label>
          <button class="btn btn-primary" type="submit">Start</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Running</h2></div>
        ${data.timers.length ? `<div class="timers">${data.timers.map((t) => `
          <div class="timer" data-ends="${t.endsAt}" data-start="${t.startedAt}">
            <div class="timer-main">
              <span class="timer-label">${esc(t.label)}</span>
              <span class="timer-left num"></span>
            </div>
            <div class="bar"><span></span></div>
            <div class="timer-actions">
              <span class="muted small">Ready ${new Date(t.endsAt - offset).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              <span class="row" style="gap:4px">
                <button class="btn btn-sm" data-restart="${t.id}">Restart</button>
                <button class="btn btn-ghost btn-sm" data-delete="${t.id}" aria-label="Delete ${esc(t.label)} timer">Delete</button>
              </span>
            </div>
          </div>`).join('')}</div>` : '<p class="muted small">No timers running. Start one above when you plant or set up a run.</p>'}
      </section>
    </div></div>`;

  function tick() {
    view.querySelectorAll('.timer').forEach((el) => {
      const ends = Number(el.dataset.ends), start = Number(el.dataset.start);
      const left = ends - nowMs();
      const done = left <= 0;
      el.classList.toggle('done', done);
      el.querySelector('.timer-left').textContent = done ? 'Ready' : duration(left);
      el.querySelector('.bar span').style.width = `${Math.min(100, ((nowMs() - start) / (ends - start)) * 100)}%`;
      el.querySelector('.bar').classList.toggle('done', done);
    });
  }
  tick();
  viewInterval(tick, 15000);

  view.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api('/timers', { method: 'POST', body: { preset: b.dataset.preset } }), 'Timer started')) renderTimers();
  }));
  const form = document.getElementById('custom-timer');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(form.querySelector('button'), () => api('/timers', { method: 'POST', body }), 'Timer started')) renderTimers();
  });
  view.querySelectorAll('[data-restart]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/timers/${b.dataset.restart}/restart`, { method: 'POST' }), 'Timer restarted')) renderTimers();
  }));
  view.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/timers/${b.dataset.delete}`, { method: 'DELETE' }))) renderTimers();
  }));
}
