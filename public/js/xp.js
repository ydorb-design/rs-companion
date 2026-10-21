// XP table shared by the server and the browser.
export const MAX_XP = 200_000_000;
export const MAX_LEVEL = 99;
export const MAX_VIRTUAL_LEVEL = 126;

// XP_TABLE[level] = XP needed to reach that level.
export const XP_TABLE = [0, 0];
let points = 0;
for (let lvl = 1; lvl < MAX_VIRTUAL_LEVEL; lvl++) {
  points += Math.floor(lvl + 300 * 2 ** (lvl / 7));
  XP_TABLE[lvl + 1] = Math.floor(points / 4);
}

export function xpForLevel(level) {
  const l = Math.max(1, Math.min(MAX_VIRTUAL_LEVEL, Math.floor(level)));
  return XP_TABLE[l];
}

export function levelForXp(xp, { virtual = false } = {}) {
  const cap = virtual ? MAX_VIRTUAL_LEVEL : MAX_LEVEL;
  let level = 1;
  while (level < cap && XP_TABLE[level + 1] <= xp) level++;
  return level;
}

// Progress through the current level, 0 to 1.
export function levelProgress(xp) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return 1;
  const start = XP_TABLE[level];
  return (xp - start) / (XP_TABLE[level + 1] - start);
}
