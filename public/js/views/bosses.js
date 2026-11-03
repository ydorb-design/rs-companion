import {
  WIKI, api, busy, emptyState, esc, fmt, gp, img, itemIcon, needsAccount, state, view, wikiUrl,
} from '../lib.js';

export async function renderBosses(name) {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  return name ? renderBoss(name) : renderList();
}

async function renderList() {
  const list = await api('/bosses');
  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Boss notes</h1><p class="muted small">Gear, inventory and strategy for each boss, with your kill count, drops and collection log in one place.</p></div>
    </div>
    <div class="stack">
      <form class="card" id="new-boss">
        <div class="form-grid" style="grid-template-columns:1fr auto">
          <label class="field"><span>Boss or activity <span class="hint">Any name, even ones you're not ranked at yet</span></span>
            <input name="name" required maxlength="60" placeholder="e.g. Vorkath"></label>
          <button class="btn btn-primary" type="submit">Open</button>
        </div>
      </form>
      ${list.length ? `<div class="boss-grid">${list.map((b) => `
        <a class="card boss-card" href="#/bosses/${encodeURIComponent(b.name)}">
          <span class="boss-name">${esc(b.name)}</span>
          <span class="muted small">${b.kc != null ? `${fmt(b.kc)} kills` : 'Not ranked'}${b.hasNotes ? ' · <span class="pos">Notes</span>' : ''}</span>
        </a>`).join('')}</div>`
        : emptyState('No bosses yet', "Bosses you're ranked at on the hiscores show here automatically. You can also open any boss by name above.")}
    </div></div>`;

  document.getElementById('new-boss').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (name) location.hash = `#/bosses/${encodeURIComponent(name)}`;
  });
}

async function renderBoss(name) {
  const b = await api(`/bosses/${encodeURIComponent(name)}`);
  const n = b.notes || { gear: '', inventory: '', notes: '' };
  const got = b.collectionLog.filter((c) => c.obtainedAt).length;

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <p class="muted small"><a href="#/bosses">Boss notes</a> /</p>
        <h1>${esc(b.name)}</h1>
      </div>
      <div class="row">
        <a class="btn" href="${wikiUrl(b.name)}" target="_blank" rel="noopener">Wiki</a>
        <a class="btn" href="${WIKI}/?search=${encodeURIComponent(`${b.name}/Strategies`)}" target="_blank" rel="noopener">Strategy guide</a>
      </div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Kill count</div><div class="kpi-value">${b.kc != null ? fmt(b.kc) : '–'}</div></div>
        ${b.personalBest != null ? `<div class="kpi"><div class="kpi-label">Personal best</div><div class="kpi-value">${pbTime(b.personalBest)}</div></div>` : ''}
        <div class="kpi"><div class="kpi-label">Drops logged</div><div class="kpi-value">${b.drops.length}</div></div>
        <div class="kpi"><div class="kpi-label">Collection log list</div><div class="kpi-value">${got}<span class="kpi-sub muted"> / ${b.collectionLog.length}</span></div></div>
      </div>

      <div class="grid-2">
        <form class="card" id="notes-form">
          <div class="card-head"><h2>Notes</h2>${b.notes ? `<span class="muted small">Saved ${new Date(b.notes.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>` : ''}</div>
          <div class="stack" style="gap:12px">
            <label class="field">Gear<textarea name="gear" rows="5" maxlength="5000" placeholder="Helm, body, weapon, special attack…">${esc(n.gear)}</textarea></label>
            <label class="field">Inventory<textarea name="inventory" rows="5" maxlength="5000" placeholder="Potions, food, runes, teleports…">${esc(n.inventory)}</textarea></label>
            <label class="field">Strategy<textarea name="notes" rows="6" maxlength="5000" placeholder="Phases, prayers, things to remember…">${esc(n.notes)}</textarea></label>
          </div>
          <div class="form-actions">
            ${b.notes ? '<button class="btn btn-ghost" type="button" id="delete-notes">Delete notes</button>' : ''}
            <button class="btn btn-primary" type="submit">Save notes</button>
          </div>
        </form>

        <div class="stack">
          <section class="card" id="odds"><div class="card-head"><h2>Rare drop odds</h2></div><p class="muted small">Loading…</p></section>
          <section class="card">
            <div class="card-head"><h2>Collection log</h2><a class="btn btn-sm" href="#/collection">Manage</a></div>
            ${b.collectionLog.length ? `<ul class="clog-items">${b.collectionLog.map((c) => `<li class="${c.obtainedAt ? 'got' : ''}">
              <span class="clog-check">${c.obtainedAt ? '<span class="pos" aria-label="Obtained">✓</span>' : '<span class="muted" aria-label="Not yet">○</span>'}${img(itemIcon(c.icon))}<span>${esc(c.itemName)}</span></span>
            </li>`).join('')}</ul>` : `<p class="muted small">No items from ${esc(b.name)} on your collection log list. Add them on the Collection log page with "${esc(b.name)}" as the source.</p>`}
          </section>
          <section class="card">
            <div class="card-head"><h2>Drops</h2><a class="btn btn-sm" href="#/drops">Log a drop</a></div>
            ${b.drops.length ? `<div class="table-wrap"><table><tbody>${b.drops.map((d) => `<tr>
              <td><span class="item">${img(itemIcon(d.icon))}<span>${d.qty > 1 ? `${fmt(d.qty)} x ` : ''}${esc(d.itemName)}</span></span></td>
              <td class="r">${gp(d.value)}</td>
              <td class="r muted nowrap">${new Date(d.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
            </tr>`).join('')}</tbody></table></div>` : `<p class="muted small">Drops logged with "${esc(b.name)}" as the source show here.</p>`}
          </section>
        </div>
      </div>
    </div></div>`;

  loadOdds(b.name);
  const form = document.getElementById('notes-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(e.submitter, () => api(`/bosses/${encodeURIComponent(b.name)}`, { method: 'PUT', body }), 'Notes saved')) renderBoss(b.name);
  });
  document.getElementById('delete-notes')?.addEventListener('click', async (e) => {
    if (!confirm(`Delete your notes for ${b.name}?`)) return;
    if (await busy(e.currentTarget, () => api(`/bosses/${encodeURIComponent(b.name)}`, { method: 'DELETE' }), 'Notes deleted')) renderBoss(b.name);
  });
}

// 58.2 -> "0:58.2", 2794 -> "46:34", 3723 -> "1:02:03"
function pbTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const frac = seconds % 1;
  const sec = (seconds % 60).toFixed(frac ? 1 : 0).padStart(frac ? 4 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const oneIn = (rate) => `1/${fmt(Math.round(1 / rate))}`;

async function loadOdds(name) {
  const el = document.getElementById('odds');
  let d;
  try {
    d = await api(`/bosses/${encodeURIComponent(name)}/odds`);
  } catch (err) {
    if (el?.isConnected) el.innerHTML = `<div class="card-head"><h2>Rare drop odds</h2></div><p class="small neg">${esc(err.message)}</p>`;
    return;
  }
  if (!el?.isConnected) return;
  const head = `<div class="card-head"><h2>Rare drop odds</h2>${d.kc != null ? `<span class="muted small">At ${fmt(d.kc)} kills</span>` : ''}</div>`;
  if (!d.found || !d.items.length) {
    el.innerHTML = `${head}<p class="muted small">${d.found ? 'No drops rarer than 1/100 on the wiki page.' : `Couldn't read a drop table from the wiki page for ${esc(name)}. Raids and minigames often use a different layout.`}</p>`;
    return;
  }
  el.innerHTML = `${head}
    <ul class="odds">${d.items.map((i) => `<li class="${i.obtained ? 'got' : ''}">
      <span class="item">${img(itemIcon(i.icon))}<span>${esc(i.itemName)}${i.pet ? ' <span class="tag">Pet</span>' : ''}</span></span>
      <span class="muted small num">${oneIn(i.rate)}</span>
      <span class="odds-chance num">${i.obtained ? '<span class="pos">Got it</span>' : i.chance != null ? `<b class="${i.ratio > 2 ? 'neg' : i.ratio > 1 ? 'warn' : ''}">${(i.chance * 100).toFixed(i.chance < 0.1 ? 1 : 0)}%</b>` : '–'}</span>
    </li>`).join('')}</ul>
    <p class="hint" style="margin-top:12px">Your chance of at least one by now, from the OSRS Wiki drop rate and your kill count. Amber means you're past the drop rate, red means more than twice past it.${d.kc == null ? ' Add your kill count by getting ranked on the hiscores or with Dink.' : ''}</p>`;
}
