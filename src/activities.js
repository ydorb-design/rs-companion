// Hiscore activities that aren't bosses.
const NON_BOSS = new Set([
  'League Points', 'Deadman Points', 'LMS - Rank', 'PvP Arena - Rank', 'Soul Wars Zeal', 'Rifts closed',
  'Colosseum Glory', 'Collections Logged',
]);
export function activityGroup(name) {
  if (name.startsWith('Clue Scrolls')) return 'clues';
  if (NON_BOSS.has(name) || name.startsWith('Bounty Hunter')) return 'other';
  return 'bosses';
}
