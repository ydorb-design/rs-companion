import { MAX_XP, levelForXp, xpForLevel } from '../xp.js';
import { COMBAT_SKILLS, combatExact, combatFromLevels, nextCombatNeeds } from '../combat.js';
import { SKILL_NAMES, api, esc, fmt, img, short, skillIcon, state, view } from '../lib.js';

export async function renderCalc() {
  const stats = state.settings.active ? await api('/stats').catch(() => null) : null;
  const skills = stats?.latest?.skills || [];
  const levelOf = (n) => skills.find((s) => s.name === n)?.level ?? (n === 'Hitpoints' ? 10 : 1);
  const xpOf = (n) => skills.find((s) => s.name === n)?.xp ?? 0;
  const names = SKILL_NAMES.slice().sort();

  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Calculators</h1><p class="muted small">${skills.length ? 'Filled in from your latest stats. Change any number to try a what-if.' : 'Add your account in Settings to fill these in from your stats.'}</p></div>
    </div>
    <div class="grid-2">
      <form class="card" id="combat-calc" autocomplete="off">
        <div class="card-head"><h2>Combat level</h2>${skills.length ? '<button type="button" class="btn btn-sm btn-ghost" data-reset>Reset to my stats</button>' : ''}</div>
        <div class="calc-grid">
          ${COMBAT_SKILLS.map((n) => `<label class="field calc-skill">${img(skillIcon(n))}<span>${n}</span>
            <input name="${n}" type="number" min="${n === 'Hitpoints' ? 10 : 1}" max="99" value="${levelOf(n)}" inputmode="numeric"></label>`).join('')}
        </div>
        <div id="combat-out" aria-live="polite"></div>
      </form>

      <form class="card" id="xp-calc" autocomplete="off">
        <div class="card-head"><h2>XP to target</h2></div>
        <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <label class="field">Skill<select name="skill">${names.map((n) => `<option ${n === 'Agility' ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label class="field">Current XP<input name="current" type="number" min="0" max="${MAX_XP}" inputmode="numeric"></label>
          <label class="field">Target<select name="targetType"><option value="level">Level</option><option value="xp">XP</option></select></label>
          <label class="field"><span>Value</span><input name="target" type="number" min="1" max="${MAX_XP}" value="99" inputmode="numeric"></label>
          <label class="field"><span>XP per action <span class="hint">Optional</span></span><input name="perAction" type="number" min="0" step="any" placeholder="e.g. 570"></label>
          <label class="field"><span>XP per hour <span class="hint">Optional</span></span><input name="perHour" type="number" min="0" step="any" placeholder="e.g. 65000"></label>
        </div>
        <div id="xp-out" aria-live="polite"></div>
      </form>
    </div></div>`;

  // Combat
  const cform = document.getElementById('combat-calc');
  const readLevels = () => Object.fromEntries(COMBAT_SKILLS.map((n) => {
    const v = Math.round(Number(cform.elements[n].value));
    const min = n === 'Hitpoints' ? 10 : 1;
    return [n, Number.isFinite(v) ? Math.min(99, Math.max(min, v)) : min];
  }));
  const drawCombat = () => {
    const levels = readLevels();
    const cb = combatFromLevels(levels);
    const exact = combatExact(levels);
    const needs = nextCombatNeeds(levels).filter((o) => o.levels != null).sort((a, b) => a.levels - b.levels);
    const style = (() => {
      const melee = levels.Attack + levels.Strength, range = Math.floor(levels.Ranged * 1.5), mage = Math.floor(levels.Magic * 1.5);
      const top = Math.max(melee, range, mage);
      return top === melee ? 'Melee' : top === range ? 'Ranged' : 'Magic';
    })();
    document.getElementById('combat-out').innerHTML = `
      <div class="calc-result">
        <div><div class="kpi-label">Combat level</div><div class="kpi-value">${cb}</div></div>
        <div class="muted small">${exact.toFixed(2)} · ${style} based</div>
      </div>
      ${cb >= 126 ? '<p class="pos small">Max combat.</p>' : needs.length ? `
        <p class="small" style="margin:12px 0 6px"><b>To reach ${cb + 1}</b>, any one of:</p>
        <ul class="calc-needs">${needs.map((o) => `<li><span>${esc(o.label)}</span><b class="num">${o.levels} level${o.levels === 1 ? '' : 's'}</b></li>`).join('')}</ul>` : ''}`;
  };
  cform.addEventListener('input', drawCombat);
  cform.querySelector('[data-reset]')?.addEventListener('click', () => {
    for (const n of COMBAT_SKILLS) cform.elements[n].value = levelOf(n);
    drawCombat();
  });
  drawCombat();

  // XP
  const xform = document.getElementById('xp-calc');
  const fillCurrent = () => (xform.elements.current.value = xpOf(xform.elements.skill.value) || '');
  const drawXp = () => {
    const f = Object.fromEntries(new FormData(xform));
    const current = Math.max(0, Number(f.current) || 0);
    const t = Number(f.target) || 0;
    const targetXp = f.targetType === 'xp' ? Math.min(MAX_XP, t) : xpForLevel(Math.min(126, Math.max(1, t)));
    const left = Math.max(0, targetXp - current);
    const perAction = Number(f.perAction) > 0 ? Number(f.perAction) : null;
    const perHour = Number(f.perHour) > 0 ? Number(f.perHour) : null;
    const hours = perHour ? left / perHour : null;
    document.getElementById('xp-out').innerHTML = `
      <div class="calc-result">
        <div><div class="kpi-label">XP left</div><div class="kpi-value">${fmt(left)}</div></div>
        <div class="muted small">Level ${levelForXp(current, { virtual: true })} → ${levelForXp(targetXp, { virtual: true })} · ${short(targetXp)} XP</div>
      </div>
      ${left > 0 && (perAction || perHour) ? `<dl class="facts">
        ${perAction ? `<div><dt>Actions</dt><dd>${fmt(Math.ceil(left / perAction))}</dd></div>` : ''}
        ${hours != null ? `<div><dt>Hours</dt><dd>${hours < 1 ? `${Math.ceil(hours * 60)} min` : hours.toFixed(1)}</dd></div>` : ''}
        ${hours != null && hours >= 3 ? `<div><dt>At 2 h a day</dt><dd>${Math.ceil(hours / 2)} days</dd></div>` : ''}
      </dl>` : left === 0 ? '<p class="pos small">Already there.</p>' : '<p class="hint">Add XP per action or per hour to see how long it takes.</p>'}`;
  };
  xform.elements.skill.addEventListener('change', () => { fillCurrent(); drawXp(); });
  xform.addEventListener('input', drawXp);
  fillCurrent();
  drawXp();
}
