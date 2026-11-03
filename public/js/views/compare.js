import {
  ago, api, busy, emptyState, esc, fmt, img, needsAccount, segmented, short, skillIcon, state, toast, view,
} from '../lib.js';

const ui = { player: '', accountType: 'main', tab: 'skills' };

export async function renderCompare(param) {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  if (param) {
    const [player, type] = param.split(':');
    ui.player = player;
    if (type) ui.accountType = type;
  }
  const friends = await api('/friends');
  const types = state.settings.accountTypes;

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Compare</h1><p class="muted small">Line your stats up against a friend or another account, straight from the hiscores.</p></div>
    </div>
    <div class="stack">
      <form class="card" id="compare-form">
        <div class="form-grid compare-fields">
          <label class="field">Player name<input name="player" maxlength="12" required value="${esc(ui.player)}" autocomplete="off"></label>
          <label class="field">Hiscores
            <select name="accountType">${Object.entries(types).map(([k, t]) => `<option value="${k}" ${k === ui.accountType ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
          </label>
          <button class="btn btn-primary" type="submit">Compare</button>
        </div>
        ${friends.length ? `<div class="friend-chips" aria-label="Saved players">
          ${friends.map((f) => `<span class="chip">
            <button type="button" class="chip-main" data-friend="${esc(f.player)}" data-type="${esc(f.accountType)}">${esc(f.player)}</button>
            <button type="button" class="chip-x" data-unfriend="${esc(f.player)}" aria-label="Remove ${esc(f.player)}">✕</button>
          </span>`).join('')}
        </div>` : ''}
      </form>
      <div id="compare-result">${ui.player ? '<p class="muted small">Loading…</p>' : emptyState('Pick someone to compare with', 'Enter a player name. You can save players you compare with often.')}</div>
    </div></div>`;

  const form = document.getElementById('compare-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    go(f.player.trim(), f.accountType);
  });
  view.querySelectorAll('[data-friend]').forEach((b) => b.addEventListener('click', () => go(b.dataset.friend, b.dataset.type)));
  view.querySelectorAll('[data-unfriend]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/friends/${encodeURIComponent(b.dataset.unfriend)}`, { method: 'DELETE' }))) renderCompare();
  }));

  if (ui.player) await loadResult(friends);
}

function go(player, accountType) {
  if (!player) return;
  const hash = `#/compare/${encodeURIComponent(`${player}:${accountType}`)}`;
  if (location.hash === hash) renderCompare(`${player}:${accountType}`);
  else location.hash = hash;
}

async function loadResult(friends) {
  const el = document.getElementById('compare-result');
  let data;
  try {
    data = await api(`/compare?player=${encodeURIComponent(ui.player)}&accountType=${encodeURIComponent(ui.accountType)}`);
  } catch (err) {
    el.innerHTML = emptyState("Couldn't compare", esc(err.message));
    return;
  }
  const { mine, theirs } = data;
  if (!mine) {
    el.innerHTML = emptyState('No stats for you yet', 'Refresh your stats on the Overview first.', '<a class="btn" href="#/overview">Go to overview</a>');
    return;
  }
  const saved = friends.some((f) => f.player.toLowerCase() === theirs.player.toLowerCase());
  const overall = (side) => side.skills.find((s) => s.name === 'Overall');
  const mo = overall(mine), to = overall(theirs);
  const skills = mine.skills.filter((s) => s.name !== 'Overall').map((s) => {
    const t = theirs.skills.find((x) => x.name === s.name);
    return { name: s.name, me: s, them: t };
  });
  const ahead = skills.filter((s) => s.them && s.me.xp > s.them.xp).length;
  const behind = skills.filter((s) => s.them && s.me.xp < s.them.xp).length;

  const theirActs = Object.fromEntries(theirs.activities.map((a) => [a.name, a.score]));
  const myActs = Object.fromEntries(mine.activities.map((a) => [a.name, a.score]));
  const actNames = [...new Set([...Object.keys(myActs), ...Object.keys(theirActs)])]
    .sort((a, b) => Math.max(myActs[b] || 0, theirActs[b] || 0) - Math.max(myActs[a] || 0, theirActs[a] || 0));

  el.innerHTML = `<div class="stack">
    <div class="vs">
      ${vsSide(mine, 'You', mo)}
      <div class="vs-mid muted small">vs</div>
      ${vsSide(theirs, null, to, saved)}
    </div>
    <section class="card">
      <div class="card-head">
        ${segmented('ctab', [['skills', 'Skills'], ['activities', 'Bosses and activities']], ui.tab, 'Show')}
        ${ui.tab === 'skills' ? `<span class="muted small">Ahead in ${ahead}, behind in ${behind}</span>` : ''}
      </div>
      ${ui.tab === 'skills' ? `<div class="table-wrap"><table class="compare-table">
        <thead><tr><th>Skill</th><th class="r">You</th><th class="r">${esc(theirs.player)}</th><th class="r"><span class="xp-sub">XP difference</span><span class="xp-short">Diff</span></th></tr></thead>
        <tbody>${skills.map(({ name, me, them }) => {
          const d = them ? me.xp - them.xp : null;
          return `<tr>
            <td><a class="item" href="#/skill/${encodeURIComponent(name)}">${img(skillIcon(name))}${esc(name)}</a></td>
            <td class="r ${d > 0 ? 'win' : ''}"><b>${me.level}</b> <span class="muted small xp-sub">${short(me.xp)}</span></td>
            <td class="r ${d < 0 ? 'win' : ''}">${them ? `<b>${them.level}</b> <span class="muted small xp-sub">${short(them.xp)}</span>` : '–'}</td>
            <td class="r ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted'}">${d == null ? '–' : d === 0 ? 'Even' : `${d > 0 ? '+' : '−'}${short(Math.abs(d))}`}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : actNames.length ? `<div class="table-wrap"><table class="compare-table">
        <thead><tr><th>Activity</th><th class="r">You</th><th class="r">${esc(theirs.player)}</th><th class="r"><span class="xp-sub">Difference</span><span class="xp-short">Diff</span></th></tr></thead>
        <tbody>${actNames.map((n) => {
          const a = myActs[n], b = theirActs[n];
          const d = a != null && b != null ? a - b : null;
          return `<tr><td>${esc(n)}</td>
            <td class="r ${(a ?? -1) > (b ?? -1) ? 'win' : ''}">${a != null ? fmt(a) : '<span class="muted">Unranked</span>'}</td>
            <td class="r ${(b ?? -1) > (a ?? -1) ? 'win' : ''}">${b != null ? fmt(b) : '<span class="muted">Unranked</span>'}</td>
            <td class="r ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted'}">${d == null ? '–' : d === 0 ? 'Even' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}</td></tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="muted small">Neither of you is ranked in any boss or activity yet.</p>'}
      <p class="hint" style="margin-top:12px">Your side is from your last refresh (${ago(mine.takenAt)}). Unranked skills show the minimum XP for their level.</p>
    </section>
  </div>`;

  el.querySelectorAll('[data-ctab]').forEach((b) => b.addEventListener('click', () => {
    ui.tab = b.dataset.ctab;
    loadResult(friends);
  }));
  el.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    if (await busy(e.currentTarget, () => api('/friends', { method: 'POST', body: { player: theirs.player, accountType: data.accountType } }))) {
      toast(`Saved ${theirs.player}`);
      renderCompare();
    }
  });
}

function vsSide(side, title, overall, saved) {
  return `<div class="card vs-side">
    <div class="row" style="justify-content:space-between">
      <div><h2>${esc(title || side.player)}</h2><p class="muted small">${esc(title ? side.player : side.label)}</p></div>
      ${saved === false ? '<button class="btn btn-sm" data-save>Save player</button>' : ''}
    </div>
    <dl class="facts">
      <div><dt>Total level</dt><dd>${fmt(overall?.level)}</dd></div>
      <div><dt>Combat</dt><dd>${fmt(side.combatLevel)}</dd></div>
      <div><dt>Total XP</dt><dd>${short(overall?.xp)}</dd></div>
    </dl>
  </div>`;
}
