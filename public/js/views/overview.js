import { MAX_LEVEL, levelProgress, xpForLevel } from '../xp.js';
import {
  ago, api, busy, duration, emptyState, eventRow, toast, esc, fmt, img, lineChart, needsAccount, segmented, short, signed, skillIcon, state, view,
} from '../lib.js';

const ui = { period: 'week' };

export async function renderOverview() {
  const account = state.settings.active;
  if (!account) return (view.innerHTML = needsAccount());
  const stats = await api('/stats');
  const head = `
    <div class="page-head">
      <div>
        <h1>${esc(account.player)}</h1>
        <p class="muted small">${stats.latest ? `Hiscores updated ${ago(stats.latest.takenAt)}` : 'No data yet'}</p>
      </div>
      <button class="btn btn-primary" id="refresh">Refresh stats</button>
    </div>`;

  if (!stats.latest) {
    view.innerHTML = `<div>${head}${emptyState('No stats yet', 'Pull your levels from the official hiscores to get started.')}</div>`;
    return bindRefresh(renderOverview);
  }

  const skills = stats.latest.skills;
  const overall = skills.find((s) => s.name === 'Overall');
  const gains = stats.gains[ui.period] || [];
  const gainedOverall = gains.find((g) => g.name === 'Overall');
  const gainRows = gains.filter((g) => g.name !== 'Overall' && g.xp > 0).sort((a, b) => b.xp - a.xp);

  view.innerHTML = `<div>${head}
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total level</div><div class="kpi-value">${fmt(overall?.level)}</div></div>
        <div class="kpi"><div class="kpi-label">Combat level</div><div class="kpi-value">${fmt(stats.combatLevel)}</div></div>
        <div class="kpi"><div class="kpi-label">Total XP</div><div class="kpi-value">${short(overall?.xp)}</div></div>
        <div class="kpi"><div class="kpi-label">XP this ${ui.period}</div><div class="kpi-value">${gainedOverall ? short(gainedOverall.xp) : '–'}</div></div>
      </div>

      <div id="next"></div>

      <section class="card">
        <div class="card-head"><h2>Skills</h2><span class="muted small">Select a skill for details</span></div>
        <div class="skills">
          ${skills.filter((s) => s.name !== 'Overall').map((s) => `
            <a class="skill" href="#/skill/${encodeURIComponent(s.name)}"
              title="${esc(s.name)}: ${fmt(s.xp)} XP${s.level < MAX_LEVEL ? `, ${fmt(xpForLevel(s.level + 1) - s.xp)} to level ${s.level + 1}` : ''}">
              ${img(skillIcon(s.name))}
              <span class="skill-name">${esc(s.name)}</span>
              <span class="skill-level">${s.level}</span>
              <span class="bar ${s.level >= MAX_LEVEL ? 'done' : ''}"><span style="width:${(levelProgress(s.xp) * 100).toFixed(1)}%"></span></span>
            </a>`).join('')}
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Total XP</h2></div>
          <div id="chart"><p class="muted small">Loading…</p></div>
        </section>
        <section class="card">
          <div class="card-head">
            <h2>Gains</h2>
            ${segmented('period', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], ui.period, 'Period')}
          </div>
          ${gainRows.length ? `
            <div class="table-wrap"><table>
              <thead><tr><th>Skill</th><th class="r">XP</th><th class="r">Levels</th></tr></thead>
              <tbody>${gainRows.map((g) => `<tr><td><a class="item" href="#/skill/${encodeURIComponent(g.name)}">${img(skillIcon(g.name))}${esc(g.name)}</a></td><td class="r pos">${signed(g.xp)}</td><td class="r">${g.levels ? signed(g.levels) : ''}</td></tr>`).join('')}</tbody>
            </table></div>`
            : `<p class="muted small">No XP gained this ${ui.period} yet. Gains are measured from your first refresh in the period, so they build up as the app collects snapshots.</p>`}
        </section>
      </div>
    </div></div>`;

  bindRefresh(renderOverview);
  view.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    ui.period = b.dataset.period;
    renderOverview();
  }));
  renderNext();
  const { points } = await api('/stats/history?skill=Overall&days=90');
  const last = points.at(-1);
  document.getElementById('chart').innerHTML = lineChart(points.map((p) => ({ t: p.t, v: p.xp })), { label: 'Total XP' })
    + (points.length > 1 ? `<p class="muted small">${signed(last.xp - points[0].xp)} XP over the last 90 days.</p>` : '');
}

export function bindRefresh(rerender) {
  const btn = document.getElementById('refresh');
  btn?.addEventListener('click', async () => {
    let levelUps = [];
    const ok = await busy(btn, async () => {
      ({ levelUps } = await api('/stats/refresh', { method: 'POST' }));
    });
    if (!ok) return;
    toast(levelUps.length ? `Level up: ${levelUps.map((l) => `${l.skill} ${l.to}`).join(', ')}` : 'Stats updated');
    rerender();
  });
}

// "What's next" and recent activity. Each part loads on its own so one failing doesn't hide the rest.
async function renderNext() {
  const el = document.getElementById('next');
  if (!el) return;
  const get = (path) => api(path).catch(() => null);
  const [timers, checklist, progress, goals, slayer, events] = await Promise.all([
    get('/timers'), get('/checklist'), get('/progress'), get('/goals'), get('/slayer'), get('/activity?limit=6'),
  ]);
  const now = timers ? timers.now : Date.now();
  const cards = [];

  if (timers?.timers.length) {
    const ready = timers.timers.filter((t) => t.endsAt <= now);
    const upcoming = timers.timers.filter((t) => t.endsAt > now).slice(0, 3);
    cards.push(nextCard('Timers', '#/timers', [
      ...ready.map((t) => `<li><span class="pos">Ready</span> ${esc(t.label)}</li>`),
      ...upcoming.map((t) => `<li>${esc(t.label)} <span class="muted">in ${duration(t.endsAt - now)}</span></li>`),
    ]));
  }
  const todo = (checklist || []).filter((c) => !c.done);
  if (todo.length) {
    cards.push(nextCard('Still to do', '#/timers', todo.slice(0, 5).map((c) => `<li>${esc(c.label)} <span class="muted">${c.freq}</span></li>`), todo.length > 5 ? `${todo.length - 5} more` : ''));
  }
  if (slayer?.current) {
    const t = slayer.current;
    cards.push(nextCard('Slayer task', '#/slayer', [`<li>${esc(t.monster)} <span class="muted">${fmt(t.kills)} / ${fmt(t.amount)}</span></li>`]));
  }
  const canStart = (progress?.quests || []).filter((q) => q.state !== 'complete' && q.check.status === 'ready');
  if (canStart.length) {
    cards.push(nextCard('Quests you can start', '#/quests', canStart.slice(0, 4).map((q) => `<li>${esc(q.name)}</li>`), canStart.length > 4 ? `${canStart.length - 4} more` : ''));
  }
  const open = (goals || []).filter((g) => !g.complete).sort((a, b) => b.currentXp / b.targetXp - a.currentXp / a.targetXp);
  if (open.length) {
    cards.push(nextCard('Closest goals', '#/goals', open.slice(0, 3).map((g) => `<li>${esc(g.skill)} ${g.targetLevel} <span class="muted">${Math.floor((g.currentXp / g.targetXp) * 100)}%</span></li>`)));
  }

  el.innerHTML = `
    ${cards.length ? `<section class="next-grid">${cards.join('')}</section>` : ''}
    ${events?.length ? `<section class="card" style="margin-top:${cards.length ? '24px' : '0'}">
      <div class="card-head"><h2>Recent activity</h2><a class="btn btn-sm" href="#/activity">See all</a></div>
      <ul class="events">${events.map(eventRow).join('')}</ul>
    </section>` : ''}`;
}

function nextCard(title, href, items, more = '') {
  return `<a class="card next-card" href="${href}">
    <h3>${esc(title)}</h3>
    <ul>${items.join('')}</ul>
    ${more ? `<p class="muted small">${esc(more)}</p>` : ''}
  </a>`;
}
