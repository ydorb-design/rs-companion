import { MAX_LEVEL, MAX_XP, levelForXp, levelProgress, xpForLevel } from '../xp.js';
import {
  WIKI, api, duration, emptyState, esc, fmt, img, lineChart, needsAccount, segmented, short, signed, skillIcon, state, view,
} from '../lib.js';

const ui = { days: 90 };

export async function renderSkill(name) {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const [stats, rates, history, goals] = await Promise.all([
    api('/stats'),
    api('/stats/rates'),
    api(`/stats/history?skill=${encodeURIComponent(name)}&days=${ui.days}`),
    api('/goals'),
  ]);
  const skill = stats.latest?.skills.find((s) => s.name === name);
  if (!skill) {
    view.innerHTML = emptyState('No data for this skill', 'Refresh your stats on the Overview page first.', '<a class="btn" href="#/overview">Back to overview</a>');
    return;
  }

  const perDay = rates.month?.[name] ?? rates.week?.[name] ?? null;
  const rateWindow = rates.month ? '30 days' : rates.week ? '7 days' : null;
  const maxed = skill.level >= MAX_LEVEL;
  const toNext = maxed ? null : xpForLevel(skill.level + 1) - skill.xp;
  const to99 = maxed ? 0 : xpForLevel(99) - skill.xp;
  const eta = (xp) => (perDay > 0 ? duration((xp / perDay) * 86400000) : null);
  const skillGoals = goals.filter((g) => g.skill === name);
  const gained = (period) => stats.gains[period]?.find((g) => g.name === name)?.xp;

  view.innerHTML = `<div>
    <div class="page-head">
      <div class="row" style="gap:12px">
        <span class="skill-hero">${img(skillIcon(name))}</span>
        <div>
          <p class="muted small"><a href="#/overview">Overview</a> /</p>
          <h1>${esc(name)}</h1>
        </div>
      </div>
      <div class="row">
        <a class="btn" href="${WIKI}/w/${encodeURIComponent(name)}" target="_blank" rel="noopener">Wiki</a>
        <a class="btn" href="${WIKI}/?search=${encodeURIComponent(`${name} training`)}" target="_blank" rel="noopener">Training guides</a>
      </div>
    </div>
    <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Level</div><div class="kpi-value">${skill.level}${skill.xp >= xpForLevel(100) ? `<span class="muted kpi-sub"> (${levelForXp(skill.xp, { virtual: true })} virtual)</span>` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">XP</div><div class="kpi-value">${short(skill.xp)}</div></div>
        <div class="kpi"><div class="kpi-label">Rank</div><div class="kpi-value">${skill.rank ? fmt(skill.rank) : '–'}</div></div>
        <div class="kpi"><div class="kpi-label">Average per day</div><div class="kpi-value">${perDay != null ? short(perDay) : '–'}</div></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Progress</h2></div>
          ${maxed ? `<p>Level 99. ${fmt(MAX_XP - skill.xp)} XP to 200m.</p>` : `
            <div class="progress-row"><span>Level ${skill.level + 1}</span><span class="muted small">${fmt(toNext)} XP left</span></div>
            <div class="bar" style="margin:6px 0 16px"><span style="width:${(levelProgress(skill.xp) * 100).toFixed(1)}%"></span></div>
            <div class="progress-row"><span>Level 99</span><span class="muted small">${fmt(to99)} XP left</span></div>
            <div class="bar" style="margin:6px 0 16px"><span style="width:${((skill.xp / xpForLevel(99)) * 100).toFixed(1)}%"></span></div>`}
          <dl class="facts">
            <div><dt>Gained today</dt><dd>${gained('day') != null ? signed(gained('day')) : '–'}</dd></div>
            <div><dt>Gained this week</dt><dd>${gained('week') != null ? signed(gained('week')) : '–'}</dd></div>
            <div><dt>Gained this month</dt><dd>${gained('month') != null ? signed(gained('month')) : '–'}</dd></div>
            ${!maxed ? `<div><dt>Next level at current pace</dt><dd>${eta(toNext) ?? '–'}</dd></div>
            <div><dt>99 at current pace</dt><dd>${eta(to99) ?? '–'}</dd></div>` : ''}
          </dl>
          <p class="hint" style="margin-top:12px">${rateWindow ? `Pace is your average XP per day over the last ${rateWindow}.` : 'Pace shows once the app has a few days of snapshots.'}</p>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>XP history</h2>
            ${segmented('days', [['30', '30 d'], ['90', '90 d'], ['365', '1 y']], String(ui.days), 'Range')}
          </div>
          ${lineChart(history.points.map((p) => ({ t: p.t, v: p.xp })), { label: `${name} XP` })}
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>Goals</h2><a class="btn btn-sm" href="#/goals">Manage goals</a></div>
        ${skillGoals.length ? skillGoals.map((g) => `
          <div class="progress-row"><span>${g.targetXp === xpForLevel(g.targetLevel) ? `Level ${g.targetLevel}` : `${short(g.targetXp)} XP`}${g.note ? ` <span class="muted small">${esc(g.note)}</span>` : ''}</span>
          <span class="small ${g.complete ? 'pos' : 'muted'}">${g.complete ? 'Complete' : `${fmt(g.remainingXp)} XP left`}</span></div>
          <div class="bar ${g.complete ? 'done' : ''}" style="margin:6px 0 14px"><span style="width:${Math.min(100, (g.currentXp / g.targetXp) * 100).toFixed(1)}%"></span></div>`).join('')
          : '<p class="muted small">No goals for this skill yet.</p>'}
      </section>
    </div></div>`;

  view.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
    ui.days = Number(b.dataset.days);
    renderSkill(name);
  }));
}
