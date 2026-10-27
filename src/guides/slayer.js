// Slayer unlocks: point rewards worth buying, roughly in the order irons buy them.
// A step shows Ready when you have the Slayer level and enough points, and is ticked off by hand once bought.

const unlock = (id, stage, title, points, why, extra = {}) => ({
  id, stage, category: extra.category || 'unlock', title, why, wiki: extra.wiki || 'Slayer Rewards',
  requires: [...(extra.requires || []), { points }],
  done: [],
});

const STEPS = [
  unlock('helm', 'first', 'Malevolent masquerade (Slayer helmet)', 400, 'Lets you make the Slayer helmet: all your Slayer gear in one slot, plus the black mask\'s boost on task. Needs 55 Crafting to make.', { requires: [{ skill: 'Crafting', level: 55 }] }),
  unlock('gargoyles', 'first', 'Gargoyle smasher', 120, 'Gargoyles are finished off automatically with your rock hammer.'),
  unlock('broader', 'first', 'Broader fletching', 300, 'Lets you fletch broad arrows (52 Fletching) and broad bolts (55 Fletching), cheap ammo for many Slayer monsters.'),
  unlock('bigger', 'later', 'Bigger and badder', 50, 'Chance of a superior Slayer monster spawning, which drop extra loot and imbued heart chances.'),
  unlock('boss-tasks', 'later', 'Like a boss', 200, 'Boss tasks from the higher Slayer masters.'),
  unlock('ring-bling', 'later', 'Ring bling', 150, 'Lets you craft Slayer rings, for teleports to Slayer locations. Needs 75 Crafting to make them.', { requires: [{ skill: 'Crafting', level: 75 }] }),
  unlock('herb-sack', 'later', 'Herb sack', 750, 'Holds up to 30 of each grimy herb from drops and farm runs. Needs 58 Herblore to use.', { category: 'item', wiki: 'Herb sack' }),
];

export const slayer = {
  id: 'slayer',
  name: 'Slayer unlocks',
  blurb: 'Point rewards worth buying, in the order irons usually buy them. Ready means you have the points. Tick each one off once bought.',
  stages: [
    { id: 'first', name: 'Buy first', blurb: 'Rewards that pay off on almost every task.' },
    { id: 'later', name: 'Buy later', blurb: 'Worth it once the first ones are done.' },
  ],
  steps: STEPS,
};
