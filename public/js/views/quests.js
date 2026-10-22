import {
  WIKI, ago, api, busy, esc, needsAccount, segmented, state, view, wikiUrl,
} from '../lib.js';

const ui = { filter: 'all', q: '', music: '' };
const STATE_LABELS = { not_started: 'Not started', in_progress: 'In progress', complete: 'Complete' };
const CA_TIERS = ['None', 'Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster'];
const FILTERS = [['all', 'All'], ['ready', 'Can start'], ['in_progress', 'In progress'], ['not_started', 'Not started'], ['complete', 'Complete']];

const musicUrl = (name) => `${WIKI}/?search=${encodeURIComponent(`${name} music track`)}`;
const canStart = (q) => q.state !== 'complete' && q.check.status === 'ready';

function matches(q) {
  if (ui.q && !q.name.toLowerCase().includes(ui.q.toLowerCase())) return false;
  if (ui.filter === 'all') return true;
  if (ui.filter === 'ready') return canStart(q);
  return q.state === ui.filter;
}

function requirementLine(q) {
  if (q.state === 'complete') return '';
  const { status, missing } = q.check;
  const qp = q.requirements?.questPoints ? ` <span class="muted">· ${q.requirements.questPoints} quest points (not checked)</span>` : '';
  if (status === 'ready') return `<div class="req"><span class="pos">${qp ? 'Skill and quest requirements met' : 'Requirements met'}</span>${qp}</div>`;
  if (status === 'locked') {
    const parts = missing.map((m) => (m.type === 'skill'
      ? `${esc(m.name)} ${m.level} <span class="muted">(${m.have})</span>`
      : `<a href="${wikiUrl(m.name)}" target="_blank" rel="noopener">${esc(m.name)}</a>`));
    return `<div class="req"><span class="warn">Needs</span> ${parts.join(', ')}${qp}</div>`;
  }
  if (status === 'unknown') return '<div class="req muted">Requirements not found on the wiki</div>';
  return '';
}

export async function renderQuests() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const p = await api('/progress');
  const counts = { complete: 0, in_progress: 0, ready: 0 };
  for (const q of p.quests) {
    if (q.state in counts) counts[q.state]++;
    if (canStart(q)) counts.ready++;
  }
  const visible = p.quests.filter(matches);
  const diariesDone = p.diaries.reduce((n, d) => n + d.tiers.filter((t) => t.complete).length, 0);

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <h1>Quests &amp; diaries</h1>
        <p class="muted small">${p.fetchedAt ? `Synced from WikiSync ${ago(p.fetchedAt)}` : 'Not synced yet'}. Changes you make here are kept as manual overrides.</p>
      </div>
      <div class="row">
        ${p.quests.length ? '<button class="btn" id="reload-reqs">Reload requirements</button>' : ''}
        <button class="btn btn-primary" id="sync">Sync from WikiSync</button>
      </div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Quests complete</div><div class="kpi-value">${counts.complete}<span class="kpi-sub muted"> / ${p.quests.length}</span></div></div>
        <div class="kpi"><div class="kpi-label">Can start now</div><div class="kpi-value">${p.requirementsLoaded ? counts.ready : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Diary tiers done</div><div class="kpi-value">${diariesDone}<span class="kpi-sub muted"> / 48</span></div></div>
        <div class="kpi"><div class="kpi-label">Combat achievements</div><div class="kpi-value">${p.combatAchievements.completed ?? '–'}<span class="kpi-sub muted"> tasks</span></div></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Quests</h2></div>
          ${p.quests.length ? `
            <div class="filter-bar">
              ${segmented('filter', FILTERS, ui.filter, 'Filter quests')}
              <input id="quest-search" type="search" placeholder="Search quests" value="${esc(ui.q)}" aria-label="Search quests">
            </div>
            ${p.requirementsLoaded ? '' : '<p class="hint" style="margin-bottom:12px">Requirements haven\'t loaded from the wiki yet. Press Reload requirements to try again.</p>'}
            ${p.hasStats ? '' : '<p class="hint" style="margin-bottom:12px">Refresh your stats on the Overview page so skill requirements can be checked.</p>'}
            <div class="quest-list">
              ${visible.map((q) => `
                <div class="quest">
                  <span class="dot-state ${q.state}" aria-hidden="true"></span>
                  <div class="quest-name">
                    <a href="${wikiUrl(q.name)}" target="_blank" rel="noopener">${esc(q.name)}</a>
                    ${requirementLine(q)}
                  </div>
                  ${q.manual ? `<button class="btn btn-ghost btn-sm" data-reset-quest="${esc(q.name)}" title="Revert to the WikiSync value">Manual ✕</button>` : ''}
                  <select data-quest="${esc(q.name)}" aria-label="Status of ${esc(q.name)}">
                    ${Object.entries(STATE_LABELS).map(([v, l]) => `<option value="${v}" ${v === q.state ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>`).join('') || '<p class="muted small">No quests match.</p>'}
            </div>`
            : `<p class="muted small">Your quest list comes from WikiSync. In RuneLite, install the <b>WikiSync</b> plugin from the Plugin Hub, log in to the game once, then press Sync.</p>`}
        </section>

        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Achievement diaries</h2><span class="muted small">Tap a tier to toggle</span></div>
            <div class="diaries">
              <span></span>${['Easy', 'Medium', 'Hard', 'Elite'].map((t) => `<span class="head">${t}</span>`).join('')}
              ${p.diaries.map((d) => `
                <a href="${wikiUrl(`${d.region} Diary`)}" target="_blank" rel="noopener" class="small">${esc(d.region)}</a>
                ${d.tiers.map((t) => `<button class="tier ${t.manual ? 'manual' : ''}" data-region="${esc(d.region)}" data-tier="${t.tier}" aria-pressed="${t.complete}"
                  aria-label="${esc(d.region)} ${t.tier}">${t.complete ? '✓' : ''}</button>`).join('')}`).join('')}
            </div>
            <p class="hint" style="margin-top:12px">Dashed outline means you've set it manually. Tap again to switch it back.</p>
          </section>

          <section class="card">
            <div class="card-head"><h2>Combat achievements</h2><a class="btn btn-sm" href="${wikiUrl('Combat Achievements')}" target="_blank" rel="noopener">Wiki</a></div>
            <p class="small">${p.combatAchievements.completed != null
              ? `<b>${p.combatAchievements.completed}</b> tasks complete, from WikiSync.`
              : '<span class="muted">WikiSync hasn\'t sent combat achievement data yet.</span>'}</p>
            <label class="field" style="margin-top:12px">Highest tier reward claimed
              <select id="ca-tier">${CA_TIERS.map((t) => `<option ${t === p.combatAchievements.tier ? 'selected' : ''}>${t}</option>`).join('')}</select>
            </label>
          </section>

          <section class="card">
            <div class="card-head"><h2>Music</h2>${p.music ? `<span class="count">${p.music.unlocked} / ${p.music.total}</span>` : ''}</div>
            ${p.music ? `
              <div class="bar ${p.music.unlocked === p.music.total ? 'done' : ''}" style="margin-bottom:12px"><span style="width:${((p.music.unlocked / Math.max(p.music.total, 1)) * 100).toFixed(1)}%"></span></div>
              ${p.music.locked.length ? `
                <input id="music-search" type="search" placeholder="Search ${p.music.locked.length} locked tracks" value="${esc(ui.music)}" aria-label="Search locked tracks">
                <ul class="music-list">${p.music.locked.filter((m) => m.toLowerCase().includes(ui.music.toLowerCase())).map((m) => `
                  <li><a href="${musicUrl(m)}" target="_blank" rel="noopener">${esc(m)}</a></li>`).join('') || '<li class="muted small">No locked tracks match.</li>'}</ul>
                <p class="hint" style="margin-top:8px">Links search the wiki for where each track unlocks.</p>`
                : '<p class="pos small">Every track unlocked.</p>'}`
              : '<p class="muted small">Sync from WikiSync to load your music tracks.</p>'}
          </section>
        </div>
      </div>
    </div></div>`;

  const syncBtn = document.getElementById('sync');
  syncBtn.addEventListener('click', async () => {
    if (await busy(syncBtn, () => api('/progress/sync', { method: 'POST' }), 'Synced')) renderQuests();
  });
  const reloadBtn = document.getElementById('reload-reqs');
  reloadBtn?.addEventListener('click', async () => {
    if (await busy(reloadBtn, () => api('/progress/requirements', { method: 'POST' }), 'Requirements reloaded')) renderQuests();
  });
  view.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    ui.filter = b.dataset.filter;
    renderQuests();
  }));
  const search = document.getElementById('quest-search');
  let t;
  search?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      ui.q = search.value;
      renderQuests().then(() => {
        const s = document.getElementById('quest-search');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      });
    }, 200);
  });
  view.querySelectorAll('[data-quest]').forEach((sel) => sel.addEventListener('change', async () => {
    const quest = p.quests.find((q) => q.name === sel.dataset.quest);
    const body = { name: quest.name, state: sel.value, clear: sel.value === quest.synced && p.fetchedAt != null };
    if (await busy(sel, () => api('/progress/quest', { method: 'PUT', body }))) renderQuests();
  }));
  view.querySelectorAll('[data-reset-quest]').forEach((b) => b.addEventListener('click', async () => {
    const quest = p.quests.find((q) => q.name === b.dataset.resetQuest);
    if (await busy(b, () => api('/progress/quest', { method: 'PUT', body: { name: quest.name, state: quest.synced, clear: true } }))) renderQuests();
  }));
  view.querySelectorAll('.tier').forEach((b) => b.addEventListener('click', async () => {
    const tier = p.diaries.find((d) => d.region === b.dataset.region).tiers.find((x) => x.tier === b.dataset.tier);
    // Toggling a manual override back clears it, returning to the synced value.
    const body = { region: b.dataset.region, tier: b.dataset.tier, complete: !tier.complete, clear: tier.manual };
    if (await busy(b, () => api('/progress/diary', { method: 'PUT', body }))) renderQuests();
  }));
  const musicSearch = document.getElementById('music-search');
  musicSearch?.addEventListener('input', () => {
    ui.music = musicSearch.value;
    const list = view.querySelector('.music-list');
    const q = ui.music.toLowerCase();
    list.innerHTML = p.music.locked.filter((m) => m.toLowerCase().includes(q))
      .map((m) => `<li><a href="${musicUrl(m)}" target="_blank" rel="noopener">${esc(m)}</a></li>`).join('') || '<li class="muted small">No locked tracks match.</li>';
  });
  const caSel = document.getElementById('ca-tier');
  caSel.addEventListener('change', () => busy(caSel, () => api('/progress/combat-achievements', { method: 'PUT', body: { tier: caSel.value } }), 'Saved'));
}
