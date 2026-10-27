// Money making for ironmen: ways to get coins without the Grand Exchange.

const way = (id, stage, title, why, extra = {}) => ({
  id, stage, title, why, wiki: extra.wiki || title, requires: extra.requires || [], done: [],
});

const STEPS = [
  way('alching', 'early', 'High Level Alchemy', 'Alch drops and items you make, like bows and battlestaves. The main coin source for most irons.', { requires: [{ skill: 'Magic', level: 55 }] }),
  way('plunder', 'early', 'Pyramid Plunder', 'Artefacts from the urns and chests sell for coins, with good Thieving XP.', { requires: [{ skill: 'Thieving', level: 21 }] }),
  way('foundry', 'early', "Giants' Foundry", 'Pays coins as well as Smithing XP, using bars you already have.', { requires: [{ skill: 'Smithing', level: 15 }] }),
  way('ardy-knights', 'mid', 'Ardougne knights', 'Pickpocketing knights gives steady coins. Best with the Ardougne diaries and rogue equipment.', { wiki: 'Knight of Ardougne', requires: [{ skill: 'Thieving', level: 55 }] }),
  way('barrows-alch', 'mid', 'Barrows', 'Alch the armour you don\'t need. Chests also give lots of runes.', { requires: [{ quest: 'Priest in Peril' }] }),
  way('zulrah', 'mid', 'Zulrah', 'Alchable drops and Zulrah\'s scales every kill.', { requires: [{ quest: 'Regicide', started: true }] }),
  way('vorkath', 'mid', 'Vorkath', 'Alchable drops every kill, plus dragon bones and supplies.', { requires: [{ quest: 'Dragon Slayer II' }] }),
  way('elves', 'late', 'Elves', 'Pickpocketing elves in Prifddinas gives coins and crystal shards.', { wiki: 'Elf', requires: [{ skill: 'Thieving', level: 85 }, { quest: 'Song of the Elves' }] }),
];

export const money = {
  id: 'money',
  name: 'Money making',
  blurb: 'Ways for an iron to get coins without the Grand Exchange. Ready means you meet the requirements. Coins pay for things like the Blast Furnace, planks and the Construction skill.',
  stages: [
    { id: 'early', name: 'Early', blurb: 'Available from low levels.' },
    { id: 'mid', name: 'Mid game', blurb: 'Combat and Thieving methods.' },
    { id: 'late', name: 'Late game', blurb: 'The best coins per hour.' },
  ],
  steps: STEPS,
};
