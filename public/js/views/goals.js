import { levelForXp, xpForLevel } from '../xp.js';
import {
  SKILL_NAMES, ago, api, busy, duration, emptyState, esc, fmt, img, needsAccount, short, skillIcon, state, view,
} from '../lib.js';

export async function renderGoals() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const [goals, stats, rates] = await Promise.all([api('/goals'), api('/stats'), api('/stats/rates').catch(() => ({}))]);
  const known = stats.latest?.skills.filter((s) => s.name !== 'Overall').map((s) => s.name);
  const skillOptions = (known?.length ? known : SKILL_NAMES).slice().sort();

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Goals</h1><p class="muted small">Progress uses your latest hiscores snapshot${stats.latest ? ` (${ago(stats.latest.takenAt)})` : ''}.</p></div>
    </div>
    <div class="stack">
      ${stats.latest ? maxCapeCard(stats.latest.skills, rates) : ''}
      <form class="card" id="goal-form">
        <div class="card-head"><h2>New goal</h2></div>
        <div class="form-grid">
          <label class="field">Skill
            <select name="skill" required>${skillOptions.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
          </label>
          <label class="field">Target
            <select name="targetType"><option value="level">Level</option><option value="xp">XP</option></select>
          </label>
          <label class="field"><span>Value</span>
            <input name="target" type="number" min="2" max="200000000" value="99" required inputmode="numeric">
          </label>
          <label class="field"><span>XP per action <span class="hint">Optional</span></span>
            <input name="xpPerAction" type="number" min="0" step="any" placeholder="e.g. 125">
          </label>
          <label class="field"><span>XP per hour <span class="hint">Optional</span></span>
            <input name="xpPerHour" type="number" min="0" step="any" placeholder="e.g. 60000">
          </label>
        </div>
        <label class="field" style="margin-top:12px"><span>Note <span class="hint">Optional, e.g. method or location</span></span>
          <input name="note" maxlength="200">
        </label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Add goal</button></div>
      </form>

      ${goals.length ? `<div class="goals">${goals.map(goalCard).join('')}</div>`
        : emptyState('No goals yet', 'Add a target level or XP above. If you add XP per action or per hour, you\'ll also see how many actions or hours are left.')}
    </div></div>`;

  const form = document.getElementById('goal-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const body = { skill: f.skill, xpPerAction: f.xpPerAction, xpPerHour: f.xpPerHour, note: f.note };
    if (f.targetType === 'xp') body.targetXp = Number(f.target);
    else body.targetLevel = Number(f.target);
    if (await busy(form.querySelector('button'), () => api('/goals', { method: 'POST', body }), 'Goal added')) renderGoals();
  });
  view.querySelectorAll('[data-delete-goal]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/goals/${b.dataset.deleteGoal}`, { method: 'DELETE' }))) renderGoals();
  }));
}

function goalCard(g) {
  const pct = Math.min(100, (g.currentXp / g.targetXp) * 100);
  const hours = g.hours != null ? (g.hours < 1 ? `${Math.ceil(g.hours * 60)} min` : `${g.hours.toFixed(1)} h`) : null;
  return `
    <article class="goal">
      <div class="goal-head">
        ${img(skillIcon(g.skill))}
        <div class="grow">
          <h3><a href="#/skill/${encodeURIComponent(g.skill)}">${esc(g.skill)}</a> ${g.targetXp === xpForLevel(g.targetLevel) ? `level ${g.targetLevel}` : `${short(g.targetXp)} XP`}</h3>
          ${g.note ? `<p class="muted small">${esc(g.note)}</p>` : ''}
        </div>
        <button class="btn btn-ghost icon-btn" data-delete-goal="${g.id}" aria-label="Delete goal">✕</button>
      </div>
      <div class="bar ${g.complete ? 'done' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="goal-stats">
        ${g.complete ? '<span class="pos"><b>Complete</b></span>' : `
          <span>Remaining <b>${fmt(g.remainingXp)}</b> XP</span>
          <span>Now <b>level ${levelForXp(g.currentXp)}</b></span>
          ${g.actions != null ? `<span><b>${fmt(g.actions)}</b> actions</span>` : ''}
          ${hours ? `<span>About <b>${hours}</b></span>` : ''}`}
      </div>
    </article>`;
}

// Progress towards level 99 in every skill.
function maxCapeCard(allSkills, rates) {
  const XP_99 = xpForLevel(99);
  const skills = allSkills.filter((s) => s.name !== 'Overall');
  const left = skills.map((s) => ({ name: s.name, level: s.level, left: Math.max(0, XP_99 - s.xp) }));
  const remaining = left.reduce((n, s) => n + s.left, 0);
  const done = skills.filter((s) => s.level >= 99).length;
  const pct = (skills.reduce((n, s) => n + Math.min(s.xp, XP_99), 0) / (skills.length * XP_99)) * 100;
  // Rough: all remaining XP divided by your combined daily XP in skills that aren't 99 yet.
  const perDay = rates.month || rates.week;
  const pace = perDay ? left.filter((s) => s.left > 0).reduce((n, s) => n + Math.max(0, perDay[s.name] || 0), 0) : 0;
  const furthest = left.filter((s) => s.left > 0).sort((a, b) => b.left - a.left).slice(0, 5);
  return `<section class="card">
    <div class="card-head"><h2>Max cape</h2><span class="count">${done} / ${skills.length} at 99</span></div>
    ${remaining === 0 ? '<p class="pos">Every skill is 99. Maxed.</p>' : `
      <div class="progress-row"><span><b>${pct.toFixed(1)}%</b> of the way</span><span class="muted small">${fmt(remaining)} XP left</span></div>
      <div class="bar" style="margin:6px 0 16px;height:8px"><span style="width:${pct.toFixed(2)}%"></span></div>
      <dl class="facts">
        <div><dt>At your current pace</dt><dd>${pace > 0 ? duration((remaining / pace) * 86400000) : '–'}</dd></div>
        ${furthest.map((s) => `<div><dt><a class="plain" href="#/skill/${encodeURIComponent(s.name)}">${esc(s.name)} ${s.level}</a></dt><dd>${short(s.left)} XP</dd></div>`).join('')}
      </dl>
      <p class="hint" style="margin-top:12px">${pace > 0 ? 'A rough guide: assumes you keep gaining XP in each skill at your recent daily average.' : 'A time estimate shows once the app has a few days of snapshots.'}</p>`}
  </section>`;
}
