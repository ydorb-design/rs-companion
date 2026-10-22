import { api, busy, esc, state, toast, view } from '../lib.js';

export async function renderSettings({ reload }) {
  const s = state.settings;
  const auth = await api('/auth');
  const typeOptions = (selected) => Object.entries(s.accountTypes)
    .map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v.label)}</option>`).join('');

  view.innerHTML = `<div>
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="stack settings">
      <section class="card">
        <div class="card-head"><h2>Accounts</h2></div>
        ${s.accounts.length ? `<div class="accounts">${s.accounts.map((a) => `
          <div class="account ${a.key === s.active?.key ? 'active' : ''}">
            <div><b>${esc(a.player)}</b> <span class="muted small">${esc(a.label)}</span></div>
            <div class="row" style="gap:4px">
              ${a.key === s.active?.key ? '<span class="tag">Active</span>' : `<button class="btn btn-sm" data-activate="${esc(a.player)}">Switch to</button>`}
              <button class="btn btn-ghost btn-sm" data-remove="${esc(a.player)}" aria-label="Remove ${esc(a.player)}">Remove</button>
            </div>
          </div>`).join('')}</div>` : '<p class="muted small" style="margin-bottom:12px">Add your character to start tracking.</p>'}
        <form id="account-form" class="form-grid" style="margin-top:16px;grid-template-columns:2fr 1.5fr auto">
          <label class="field">Player name<input name="player" maxlength="12" required autocomplete="off" spellcheck="false"></label>
          <label class="field">Account type<select name="accountType">${typeOptions('ironman')}</select></label>
          <button class="btn btn-primary" type="submit">Add</button>
        </form>
        <p class="hint" style="margin-top:8px">Account type picks which hiscores board to read. To change an account's type, add it again with the new type.</p>
      </section>

      <form class="card" id="settings-form">
        <div class="card-head"><h2>Refresh and alerts</h2></div>
        <div class="stack" style="gap:16px">
          <label class="field"><span>Auto-refresh every (hours) <span class="hint">Pulls hiscores and WikiSync for every account. 0 turns it off.</span></span>
            <input name="refreshHours" type="number" min="0" max="168" step="0.5" value="${s.refreshHours}">
          </label>
          <label class="field"><span>Discord webhook <span class="hint">Server Settings &gt; Integrations &gt; Webhooks &gt; Copy URL</span></span>
            <input name="discordWebhook" type="url" value="${esc(s.discordWebhook)}" placeholder="https://discord.com/api/webhooks/…" autocomplete="off">
          </label>
          <label class="field"><span>ntfy topic URL <span class="hint">Optional, e.g. https://ntfy.sh/your-topic</span></span>
            <input name="ntfyUrl" type="url" value="${esc(s.ntfyUrl)}" placeholder="https://ntfy.sh/…" autocomplete="off">
          </label>
          <fieldset class="checks">
            <legend>Send an alert when</legend>
            <label><input type="checkbox" name="alertTimers" ${s.alertTimers ? 'checked' : ''}> A timer finishes</label>
            <label><input type="checkbox" name="alertLevels" ${s.alertLevels ? 'checked' : ''}> You level up</label>
            <label><input type="checkbox" name="alertGoals" ${s.alertGoals ? 'checked' : ''}> You complete a goal</label>
          </fieldset>
          <p class="hint">Level and goal alerts arrive when the app next refreshes your stats, so they can lag by up to the refresh interval.</p>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" id="test-alert">Send test alert</button>
          <button class="btn btn-primary" type="submit">Save</button>
        </div>
      </form>

      <section class="card">
        <div class="card-head"><h2>Backup</h2></div>
        <p class="small">Download everything (history, goals, tasks, drops, Slayer and more) as a JSON file. Your Discord and ntfy addresses aren't included.</p>
        <div class="form-actions"><a class="btn" href="/api/export" download>Download backup</a></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Login</h2></div>
        ${auth.required
          ? '<p class="small">Password login is on. To change the password, edit the <code>APP_PASSWORD</code> variable on the container.</p><div class="form-actions"><button class="btn" id="logout">Sign out</button></div>'
          : '<p class="small">Password login is off. To turn it on, add an <code>APP_PASSWORD</code> variable to the container in the Unraid Docker tab.</p>'}
      </section>
    </div></div>`;

  const accountForm = document.getElementById('account-form');
  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(accountForm));
    const btn = accountForm.querySelector('button');
    if (!(await busy(btn, () => api('/accounts', { method: 'POST', body })))) return;
    await reload();
    // Pull data straight away so the new account isn't empty.
    await busy(btn, async () => {
      await api('/stats/refresh', { method: 'POST' });
      await api('/progress/sync', { method: 'POST' }).catch(() => {});
    }, `Added ${body.player}`);
    location.hash = '#/overview';
  });
  view.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api('/accounts/active', { method: 'PUT', body: { player: b.dataset.activate } }))) {
      await reload();
      toast(`Switched to ${b.dataset.activate}`);
      renderSettings({ reload });
    }
  }));
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remove ${b.dataset.remove}? Its history stays saved and comes back if you add it again.`)) return;
    if (await busy(b, () => api(`/accounts/${encodeURIComponent(b.dataset.remove)}`, { method: 'DELETE' }))) {
      await reload();
      renderSettings({ reload });
    }
  }));

  const form = document.getElementById('settings-form');
  const values = () => {
    const f = new FormData(form);
    return {
      refreshHours: f.get('refreshHours'),
      discordWebhook: f.get('discordWebhook'),
      ntfyUrl: f.get('ntfyUrl'),
      alertTimers: f.has('alertTimers'),
      alertLevels: f.has('alertLevels'),
      alertGoals: f.has('alertGoals'),
    };
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await busy(form.querySelector('[type=submit]'), () => api('/settings', { method: 'PUT', body: values() }), 'Settings saved')) await reload();
  });
  const testBtn = document.getElementById('test-alert');
  testBtn.addEventListener('click', () => busy(testBtn, async () => {
    // Save first so the test uses what's in the form.
    await api('/settings', { method: 'PUT', body: values() });
    await reload();
    await api('/notifications/test', { method: 'POST' });
  }, 'Test alert sent'));
  document.getElementById('logout')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.reload();
  });
}
