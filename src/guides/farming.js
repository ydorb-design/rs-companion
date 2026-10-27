// Farming runs: patches to unlock, what to plant at each level, and the tools that make runs faster.
// Use the herb, birdhouse and tree timers on Timers & dailies to know when each run is ready.

const step = (id, stage, category, title, why, extra = {}) => ({
  id, stage, category, title, why, wiki: extra.wiki || title, requires: extra.requires || [], done: extra.done || [],
});

const STEPS = [
  // Patches
  step('herb-basic', 'patches', 'patch', 'Herb patches: Falador, Catherby, Ardougne', 'The three herb patches with no requirements. The base of every herb run.', { wiki: 'Herb patch' }),
  step('herb-morytania', 'patches', 'patch', 'Herb patch: Port Phasmatys', 'A fourth herb patch, near the Ectophial teleport.', { wiki: 'Herb patch', requires: [{ quest: 'Priest in Peril' }] }),
  step('herb-hosidius', 'patches', 'patch', 'Herb patch: Hosidius', 'Another herb patch, in Great Kourend.', { wiki: 'Herb patch' }),
  step('herb-troll', 'patches', 'patch', 'Herb patch: Troll Stronghold', 'A herb patch that never gets diseased.', { wiki: 'Herb patch', requires: [{ quest: "My Arm's Big Adventure" }] }),
  step('farming-guild', 'patches', 'patch', 'Farming Guild', 'Extra patches in one place, close to a bank.', { requires: [{ skill: 'Farming', level: 45 }] }),
  step('hardwood', 'patches', 'patch', 'Hardwood patches (Fossil Island)', 'Teak and mahogany trees for planks and Woodcutting.', { wiki: 'Hardwood tree patch', requires: [{ quest: 'Bone Voyage' }] }),
  // Crops
  step('ranarr', 'crops', 'crop', 'Ranarr weed', 'Ranarr makes prayer potions, which you need a lot of.', { requires: [{ skill: 'Farming', level: 32 }] }),
  step('snapdragon', 'crops', 'crop', 'Snapdragon', 'Snapdragon makes super restores.', { requires: [{ skill: 'Farming', level: 62 }] }),
  step('toadflax', 'crops', 'crop', 'Toadflax', 'Toadflax makes Saradomin brews.', { requires: [{ skill: 'Farming', level: 38 }] }),
  step('torstol', 'crops', 'crop', 'Torstol', 'Torstol makes super combat potions.', { requires: [{ skill: 'Farming', level: 85 }] }),
  step('yew-trees', 'crops', 'crop', 'Yew trees', 'Big Farming XP per run and yew logs.', { wiki: 'Yew tree', requires: [{ skill: 'Farming', level: 60 }] }),
  step('magic-trees', 'crops', 'crop', 'Magic trees', 'The best tree XP per run.', { wiki: 'Magic tree', requires: [{ skill: 'Farming', level: 75 }] }),
  // Tools
  step('secateurs', 'tools', 'tool', 'Magic secateurs', 'More herbs from every patch.', { requires: [{ quest: 'Fairytale I - Growing Pains' }], done: [{ quest: 'Fairytale I - Growing Pains' }] }),
  step('seed-box', 'tools', 'tool', 'Seed box', 'Keeps your seeds in one slot.'),
  step('bottomless', 'tools', 'tool', 'Bottomless compost bucket', 'Holds a lot of compost in one slot, from Hespori.', { requires: [{ skill: 'Farming', level: 65 }] }),
];

export const farming = {
  id: 'farming',
  name: 'Farming runs',
  blurb: 'Patches to unlock, what to plant and the tools that speed up runs. Pair it with the farming timers on Timers & dailies.',
  stages: [
    { id: 'patches', name: 'Patches', blurb: 'More patches mean more herbs and XP per run.' },
    { id: 'crops', name: 'What to plant', blurb: 'The crops that matter most to an iron.' },
    { id: 'tools', name: 'Tools', blurb: 'Make each run faster and give more.' },
  ],
  steps: STEPS,
};
