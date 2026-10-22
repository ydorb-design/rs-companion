import {
  ago, api, emptyState, esc, fmt, lineChart, needsAccount, segmented, signed, state, view, wikiUrl,
} from '../lib.js';
import { bindRefresh } from './overview.js';

const ui = { period: 'week', selected: null, sort: 'kc' };

export async function renderBossing() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const data = await api('/activities');
  const head = `
    <div class="page-head">
      <div>
        <h1>Bossing &amp; clues</h1>
        <p class="muted small">${data.takenAt ? `From the hiscores, updated ${ago(data.takenAt)}. Kill counts only appear once you're ranked for that boss.` : 'No data yet'}</p>
      </div>
      <button class="btn btn-primary" id="refresh">Refresh stats</button>
    </div>`;
  if (!data.activities?.length) {
    view.innerHTML = `<div>${head}${emptyState('No kill counts yet', 'Nothing ranked on the hiscores yet. Bosses usually need a handful of kills before they show up.')}</div>`;
    return bindRefresh(renderBossing);
  }

  const gains = data.gains[ui.period];
  const gainOf = (name) => (gains ? gains[name] : undefined);
  const by = (group) => data.activities.filter((a) => a.group === group);
  const bosses = by('bosses').sort(ui.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.score - a.score);
  const find = (name) => data.activities.find((a) => a.name === name);
  const killsInPeriod = gains ? bosses.reduce((n, b) => n + (gainOf(b.name) || 0), 0) : null;
  if (!ui.selected || !find(ui.selected)) ui.selected = bosses[0]?.name ?? data.activities[0].name;

  const table = (rows, unit) => `
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th class="r">${unit}</th><th class="r">This ${ui.period}</th><th class="r">Rank</th></tr></thead>
      <tbody>${rows.map((a) => {
        const g = gainOf(a.name);
        return `<tr class="clickable ${a.name === ui.selected ? 'selected' : ''}" data-select="${esc(a.name)}" tabindex="0">
          <td>${esc(a.name)}</td>
          <td class="r">${fmt(a.score)}</td>
          <td class="r ${g > 0 ? 'pos' : ''}">${g == null ? (gains ? '<span class="tag">New</span>' : '–') : g ? signed(g) : ''}</td>
          <td class="r muted">${a.rank ? fmt(a.rank) : '–'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

  view.innerHTML = `<div>${head}
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Boss kills this ${ui.period}</div><div class="kpi-value">${killsInPeriod != null ? fmt(killsInPeriod) : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Bosses ranked</div><div class="kpi-value">${bosses.length}</div></div>
        <div class="kpi"><div class="kpi-label">Clues completed</div><div class="kpi-value">${fmt(find('Clue Scrolls (all)')?.score)}</div></div>
        <div class="kpi"><div class="kpi-label">Collection log</div><div class="kpi-value">${fmt(find('Collections Logged')?.score)}</div></div>
      </div>

      <div class="row" style="justify-content:space-between">
        ${segmented('period', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], ui.period, 'Period')}
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <h2>Bosses</h2>
            ${segmented('sort', [['kc', 'Most kills'], ['name', 'A to Z']], ui.sort, 'Sort')}
          </div>
          ${bosses.length ? table(bosses, 'Kills') : '<p class="muted small">No bosses ranked yet.</p>'}
        </section>
        <div class="stack">
          <section class="card" id="kc-chart-card">
            <div class="card-head"><h2>${esc(ui.selected)}</h2><a class="btn btn-sm" href="${wikiUrl(ui.selected)}" target="_blank" rel="noopener">Wiki</a></div>
            <div id="kc-chart"><p class="muted small">Loading…</p></div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Clue scrolls</h2></div>
            ${by('clues').length ? table(by('clues'), 'Completed') : '<p class="muted small">No clues ranked yet.</p>'}
          </section>
          ${by('other').length ? `<section class="card"><div class="card-head"><h2>Minigames and other</h2></div>${table(by('other'), 'Score')}</section>` : ''}
        </div>
      </div>
    </div></div>`;

  bindRefresh(renderBossing);
  view.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { ui.period = b.dataset.period; renderBossing(); }));
  view.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { ui.sort = b.dataset.sort; renderBossing(); }));
  view.querySelectorAll('[data-select]').forEach((row) => {
    const pick = () => {
      ui.selected = row.dataset.select;
      renderBossing().then(() => {
        if (matchMedia('(max-width: 860px)').matches) document.getElementById('kc-chart-card')?.scrollIntoView({ behavior: 'smooth' });
      });
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  });

  const { points } = await api(`/stats/history?activity=${encodeURIComponent(ui.selected)}&days=365`);
  const el = document.getElementById('kc-chart');
  if (el) {
    el.innerHTML = lineChart(points.map((p) => ({ t: p.t, v: p.score })), { label: ui.selected, empty: 'The chart fills in as the app takes more snapshots.' })
      + (points.length > 1 ? `<p class="muted small">${signed(points.at(-1).score - points[0].score)} over the last year of snapshots.</p>` : '');
  }
}
