// Ironman progression guide: well-known milestones with why they matter.
// Step and check format: see index.js.

const STAGES = [
  { id: 'early', name: 'Early game', blurb: 'Unlocks that make everything after them faster.' },
  { id: 'mid', name: 'Mid game', blurb: 'Core gear, combat unlocks and the bigger quests.' },
  { id: 'late', name: 'Late game', blurb: 'Endgame bosses, best-in-slot items and prayers.' },
];

const STEPS = [
  // Early game
  {
    id: 'waterfall', stage: 'early', category: 'quest', title: 'Waterfall Quest',
    why: 'A large reward of Attack and Strength XP early on, skipping a lot of slow low-level combat training.',
    done: [{ quest: 'Waterfall Quest' }],
  },
  {
    id: 'graceful', stage: 'early', category: 'item', title: 'Graceful outfit',
    why: 'Lighter weight and faster run energy restore. You run everywhere on an iron, so this pays off for the whole account.',
    wiki: 'Graceful outfit', done: [],
  },
  {
    id: 'fairy-rings', stage: 'early', category: 'quest', title: 'Fairy rings',
    why: 'Starting Fairytale II unlocks fairy rings, one of the best teleport networks in the game.',
    wiki: 'Fairy ring', done: [{ quest: 'Fairytale II - Cure a Queen', started: true }],
  },
  {
    id: 'ardy-cloak', stage: 'early', category: 'diary', title: 'Ardougne cloak 1',
    why: 'Unlimited teleports to the Ardougne Monastery, handy for its altar and fairy ring.',
    wiki: 'Ardougne cloak 1', done: [{ diary: 'Ardougne', tier: 'Easy' }],
  },
  {
    id: 'ectophial', stage: 'early', category: 'quest', title: 'Ectophial',
    why: 'An unlimited teleport to Port Phasmatys, from Ghosts Ahoy.',
    wiki: 'Ectophial', done: [{ quest: 'Ghosts Ahoy' }],
  },
  {
    id: 'avas', stage: 'early', category: 'gear', title: "Ava's accumulator",
    why: 'Picks up or saves your arrows and bolts. Ammo is slow to make yourself, so this saves a lot of it.',
    wiki: "Ava's accumulator", requires: [{ skill: 'Ranged', level: 50 }], done: [{ quest: 'Animal Magnetism' }],
  },
  {
    id: 'bone-voyage', stage: 'early', category: 'quest', title: 'Bone Voyage (Fossil Island)',
    why: 'Opens Fossil Island, including birdhouse runs for steady passive Hunter XP.',
    done: [{ quest: 'Bone Voyage' }],
  },
  {
    id: 'lost-city', stage: 'early', category: 'quest', title: 'Lost City',
    why: 'Lets you wield the dragon dagger and dragon longsword, and opens Zanaris.',
    done: [{ quest: 'Lost City' }],
  },
  {
    id: 'ds1', stage: 'early', category: 'quest', title: 'Dragon Slayer I',
    why: 'Lets you wear a rune platebody and green dragonhide body.',
    done: [{ quest: 'Dragon Slayer I' }],
  },
  {
    id: 'protect-prayers', stage: 'early', category: 'skill', title: '43 Prayer',
    why: 'Protection prayers. Almost every boss and many Slayer tasks rely on them.',
    wiki: 'Protect from Melee', done: [{ skill: 'Prayer', level: 43 }],
  },
  {
    id: 'prayer-pots', stage: 'early', category: 'skill', title: '38 Herblore',
    why: 'Prayer potions. You have to make all your own, so this is one of the most important Herblore unlocks.',
    wiki: 'Prayer potion', done: [{ skill: 'Herblore', level: 38 }],
  },
  {
    id: 'misc', stage: 'early', category: 'quest', title: 'Kingdom of Miscellania',
    why: 'Throne of Miscellania gives you a kingdom that gathers herbs, logs, fish and more for you while you play.',
    wiki: 'Kingdom of Miscellania', done: [{ quest: 'Throne of Miscellania' }],
  },
  {
    id: 'seed-box', stage: 'early', category: 'item', title: 'Seed box',
    why: 'Stores seeds in one inventory slot, which makes farm runs much tidier.',
    wiki: 'Seed box', done: [],
  },
  {
    id: 'coal-bag', stage: 'early', category: 'item', title: 'Coal bag',
    why: 'Carries extra coal for smelting, which you need lots of to make your own gear and cannonballs.',
    wiki: 'Coal bag', done: [],
  },

  // Mid game
  {
    id: 'mm1', stage: 'mid', category: 'quest', title: 'Monkey Madness I',
    why: 'Lets you wield the dragon scimitar, a big melee upgrade.',
    done: [{ quest: 'Monkey Madness I' }],
  },
  {
    id: 'dragon-weapons', stage: 'mid', category: 'skill', title: '60 Attack',
    why: 'Needed to wield dragon weapons.',
    wiki: 'Dragon scimitar', done: [{ skill: 'Attack', level: 60 }],
  },
  {
    id: 'fighter-torso', stage: 'mid', category: 'gear', title: 'Fighter torso',
    why: 'A free melee body with a Strength bonus, from Barbarian Assault.',
    wiki: 'Fighter torso', done: [],
  },
  {
    id: 'dragon-defender', stage: 'mid', category: 'gear', title: 'Dragon defender',
    why: 'The main melee off-hand for most of the game, from the Warriors\' Guild.',
    wiki: 'Dragon defender', done: [],
  },
  {
    id: 'void', stage: 'mid', category: 'gear', title: 'Void knight equipment',
    why: 'A strong set bonus for Ranged and Magic, from Pest Control.',
    wiki: 'Void Knight equipment', done: [],
  },
  {
    id: 'fire-cape', stage: 'mid', category: 'gear', title: 'Fire cape',
    why: 'The best melee cape until the infernal cape, from the TzHaar Fight Cave.',
    wiki: 'Fire cape', done: [{ item: 'Fire cape' }],
  },
  {
    id: 'barrows-gloves', stage: 'mid', category: 'gear', title: 'Barrows gloves',
    why: 'Recipe for Disaster rewards gloves that stay best-in-slot for much of the game.',
    wiki: 'Barrows gloves', done: [{ quest: 'Recipe for Disaster' }],
  },
  {
    id: 'fremennik', stage: 'mid', category: 'quest', title: 'The Fremennik Trials',
    why: 'Lets you wear the Fremennik rings, such as the berserker ring from the Dagannoth Kings.',
    done: [{ quest: 'The Fremennik Trials' }],
  },
  {
    id: 'ancients', stage: 'mid', category: 'quest', title: 'Desert Treasure I',
    why: 'Unlocks Ancient Magicks for strong multi-target and freezing spells.',
    wiki: 'Ancient Magicks', done: [{ quest: 'Desert Treasure I' }],
  },
  {
    id: 'lunars', stage: 'mid', category: 'quest', title: 'Lunar Diplomacy',
    why: 'The Lunar spellbook has utility spells an iron uses constantly, like NPC Contact and Humidify.',
    wiki: 'Lunar spellbook', done: [{ quest: 'Lunar Diplomacy' }],
  },
  {
    id: 'whip', stage: 'mid', category: 'gear', title: 'Abyssal whip',
    why: 'A fast, accurate melee weapon. Needs 70 Attack; drops from abyssal demons (85 Slayer).',
    wiki: 'Abyssal whip', requires: [{ skill: 'Attack', level: 70 }, { skill: 'Slayer', level: 85 }], done: [{ item: 'Abyssal whip' }],
  },
  {
    id: 'blowpipe', stage: 'mid', category: 'gear', title: 'Toxic blowpipe',
    why: 'A very fast ranged weapon used at many bosses. Needs 75 Ranged; made from a tanzanite fang from Zulrah.',
    wiki: 'Toxic blowpipe', requires: [{ skill: 'Ranged', level: 75 }], done: [{ item: 'Tanzanite fang' }],
  },
  {
    id: 'trident', stage: 'mid', category: 'gear', title: 'Trident of the seas',
    why: 'A powered staff with its own built-in spell. Needs 75 Magic; drops from the Kraken (87 Slayer).',
    wiki: 'Trident of the seas', requires: [{ skill: 'Magic', level: 75 }, { skill: 'Slayer', level: 87 }], done: [],
  },
  {
    id: 'slayer-helm', stage: 'mid', category: 'gear', title: 'Slayer helmet',
    why: 'Combines the black mask and other Slayer gear into one helm, with a damage and accuracy boost on task. Needs 55 Crafting and the unlock from a Slayer master.',
    wiki: 'Slayer helmet', requires: [{ skill: 'Crafting', level: 55 }], done: [],
  },
  {
    id: 'restores', stage: 'mid', category: 'skill', title: '63 Herblore',
    why: 'Super restores, which restore Prayer and drained stats. Essential for longer boss trips.',
    wiki: 'Super restore', done: [{ skill: 'Herblore', level: 63 }],
  },
  {
    id: 'ranging-pots', stage: 'mid', category: 'skill', title: '72 Herblore',
    why: 'Ranging potions, a cheap boost for Ranged bossing.',
    wiki: 'Ranging potion', done: [{ skill: 'Herblore', level: 72 }],
  },
  {
    id: 'staminas', stage: 'mid', category: 'skill', title: '77 Herblore',
    why: 'Stamina potions, so you run out of energy far less.',
    wiki: 'Stamina potion', done: [{ skill: 'Herblore', level: 77 }],
  },
  {
    id: 'piety', stage: 'mid', category: 'skill', title: 'Piety',
    why: 'The best melee prayer for most of the game. Needs 70 Prayer, 70 Defence, King\'s Ransom and the Knight Waves training ground.',
    wiki: 'Piety', requires: [{ skill: 'Prayer', level: 70 }, { skill: 'Defence', level: 70 }, { quest: "King's Ransom" }], done: [],
  },
  {
    id: 'red-chins', stage: 'mid', category: 'skill', title: '63 Hunter',
    why: 'Red chinchompas: fast multi-target Ranged training and a strong weapon in some places.',
    wiki: 'Red chinchompa', done: [{ skill: 'Hunter', level: 63 }],
  },

  // Late game
  {
    id: 'ds2', stage: 'late', category: 'quest', title: 'Dragon Slayer II',
    why: 'Unlocks Vorkath, a reliable source of supplies and money for an iron.',
    done: [{ quest: 'Dragon Slayer II' }],
  },
  {
    id: 'mm2', stage: 'late', category: 'quest', title: 'Monkey Madness II',
    why: 'Unlocks demonic gorillas, the source of zenyte jewellery.',
    done: [{ quest: 'Monkey Madness II' }],
  },
  {
    id: 'sote', stage: 'late', category: 'quest', title: 'Song of the Elves',
    why: 'Opens Prifddinas, with the Gauntlet, Zalcano and many useful facilities.',
    wiki: 'Prifddinas', done: [{ quest: 'Song of the Elves' }],
  },
  {
    id: 'brews', stage: 'late', category: 'skill', title: '81 Herblore',
    why: 'Saradomin brews, the main healing potion for harder bosses.',
    wiki: 'Saradomin brew', done: [{ skill: 'Herblore', level: 81 }],
  },
  {
    id: 'super-combat', stage: 'late', category: 'skill', title: '90 Herblore',
    why: 'Super combat potions boost Attack, Strength and Defence in one dose.',
    wiki: 'Super combat potion', done: [{ skill: 'Herblore', level: 90 }],
  },
  {
    id: 'cerberus', stage: 'late', category: 'skill', title: '91 Slayer',
    why: 'Unlocks Cerberus, which drops the crystals for upgraded boots.',
    wiki: 'Cerberus', done: [{ skill: 'Slayer', level: 91 }],
  },
  {
    id: 'hydra', stage: 'late', category: 'skill', title: '95 Slayer',
    why: 'Unlocks the Alchemical Hydra.',
    wiki: 'Alchemical Hydra', done: [{ skill: 'Slayer', level: 95 }],
  },
  {
    id: 'ornate-pool', stage: 'late', category: 'skill', title: '82 Construction',
    why: 'An ornate rejuvenation pool in your house restores HP, Prayer, run energy and stats in one go.',
    wiki: 'Ornate rejuvenation pool', done: [{ skill: 'Construction', level: 82 }],
  },
  {
    id: 'rigour', stage: 'late', category: 'skill', title: 'Rigour and Augury',
    why: 'The best Ranged and Magic prayers. Need 74 and 77 Prayer, plus their prayer scrolls from the Chambers of Xeric.',
    wiki: 'Rigour', requires: [{ skill: 'Prayer', level: 77 }], done: [],
  },
  {
    id: 'infernal', stage: 'late', category: 'gear', title: 'Infernal cape',
    why: 'The best melee cape in the game, from the Inferno.',
    wiki: 'Infernal cape', done: [{ item: 'Infernal cape' }],
  },
];

export const iron = {
  id: 'iron',
  name: 'Iron guide',
  blurb: 'Key ironman quests, gear, items, skill unlocks and diaries, and why each one matters.',
  categories: [['quest', 'Quests'], ['gear', 'Gear'], ['item', 'Items'], ['skill', 'Skills'], ['diary', 'Diaries']],
  stages: STAGES,
  steps: STEPS,
};
