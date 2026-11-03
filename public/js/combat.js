// Combat level maths, shared by the server and the browser.
export const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Prayer', 'Ranged', 'Magic'];
const CAP = 99;

// levels: { Attack: 60, ... }. Missing skills count as 1 (Hitpoints as 10).
export function combatFromLevels(levels) {
  const lvl = (n) => levels[n] ?? (n === 'Hitpoints' ? 10 : 1);
  const base = 0.25 * (lvl('Defence') + lvl('Hitpoints') + Math.floor(lvl('Prayer') / 2));
  const melee = 0.325 * (lvl('Attack') + lvl('Strength'));
  const range = 0.325 * Math.floor(lvl('Ranged') * 1.5);
  const mage = 0.325 * Math.floor(lvl('Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

// The unrounded value, for showing how close the next level is.
export function combatExact(levels) {
  const lvl = (n) => levels[n] ?? (n === 'Hitpoints' ? 10 : 1);
  const base = 0.25 * (lvl('Defence') + lvl('Hitpoints') + Math.floor(lvl('Prayer') / 2));
  return base + 0.325 * Math.max(lvl('Attack') + lvl('Strength'), Math.floor(lvl('Ranged') * 1.5), Math.floor(lvl('Magic') * 1.5));
}

// Levels needed in each option to reach the next combat level, or null if it can't get there on its own.
// Paired skills (Attack/Strength, Defence/Hitpoints) count levels in either one.
export function nextCombatNeeds(levels) {
  const current = combatFromLevels(levels);
  const options = [
    ['Attack or Strength', ['Attack', 'Strength']],
    ['Defence or Hitpoints', ['Defence', 'Hitpoints']],
    ['Prayer', ['Prayer']],
    ['Ranged', ['Ranged']],
    ['Magic', ['Magic']],
  ];
  return options.map(([label, skills]) => {
    const trial = { ...levels };
    for (let n = 1; n <= skills.length * CAP; n++) {
      const s = skills.find((x) => (trial[x] ?? 1) < CAP);
      if (!s) break;
      trial[s] = (trial[s] ?? 1) + 1;
      if (combatFromLevels(trial) > current) return { label, skills, levels: n };
    }
    return { label, skills, levels: null };
  });
}
