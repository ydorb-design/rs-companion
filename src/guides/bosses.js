// Bossing ladder: bosses in the order irons usually learn them, with the requirements to get in and the drops
// that matter. A boss ticks off with your first kill, from the hiscores or Dink.

const boss = (id, stage, title, why, extra = {}) => ({
  id, stage, title, why, wiki: extra.wiki || title,
  requires: extra.requires || [],
  done: [{ kc: extra.kc || title, count: 1, label: 'First kill' }],
});

const STEPS = [
  boss('scurrius', 'early', 'Scurrius', 'A beginner boss in the Varrock sewers. A gentle way to learn boss mechanics.'),
  boss('obor', 'early', 'Obor', 'A free-to-play boss behind a giant key from hill giants. Drops Hill giant club and supplies.'),
  boss('bryophyta', 'early', 'Bryophyta', 'A free-to-play boss behind a mossy key from moss giants. Drops the essence for Bryophyta\'s staff.'),
  boss('barrows', 'early', 'Barrows', 'Barrows armour and weapons, and a lot of runes. Most irons start here for gear and to fund their spells.', { kc: 'Barrows Chests', wiki: 'Barrows', requires: [{ quest: 'Priest in Peril' }] }),
  boss('jad', 'early', 'TzTok-Jad', 'The end of the Fight Caves, for the fire cape.', { wiki: 'TzHaar Fight Cave' }),
  boss('dks', 'mid', 'Dagannoth Kings', 'Berserker, archers and seers rings, some of the best rings for a long time. Wearing them needs The Fremennik Trials.', { kc: 'Dagannoth Rex', requires: [{ quest: 'The Fremennik Trials' }] }),
  boss('zulrah', 'mid', 'Zulrah', 'Tanzanite fang for the toxic blowpipe, magic fang for the trident, and supplies. Needs Regicide started.', { requires: [{ quest: 'Regicide', started: true }] }),
  boss('vorkath', 'mid', 'Vorkath', 'Dragon bones, supplies and alchables every kill, and Vorkath\'s head for Ava\'s assembler.', { requires: [{ quest: 'Dragon Slayer II' }] }),
  boss('grotesque-guardians', 'mid', 'Grotesque Guardians', 'Granite maul and the black tourmaline core for guardian boots.', { requires: [{ skill: 'Slayer', level: 75 }] }),
  boss('kraken', 'mid', 'Kraken', 'Trident of the seas and the kraken tentacle for the abyssal tentacle.', { requires: [{ skill: 'Slayer', level: 87 }] }),
  boss('cox', 'mid', 'Chambers of Xeric', 'Dexterous and arcane prayer scrolls (Rigour and Augury), dragon hunter crossbow, twisted buckler and more. Supplies come from the raid itself.'),
  boss('gauntlet', 'mid', 'The Corrupted Gauntlet', 'Crystal armour seeds and the enhanced crystal weapon seed for the Bow of faerdhinen, a huge ironman upgrade.', { requires: [{ quest: 'Song of the Elves' }] }),
  boss('cerberus', 'late', 'Cerberus', 'Primordial, pegasian and eternal crystals for upgraded boots.', { requires: [{ skill: 'Slayer', level: 91 }] }),
  boss('hydra', 'late', 'Alchemical Hydra', 'Hydra leather for ferocious gloves, and the parts for the brimstone ring.', { requires: [{ skill: 'Slayer', level: 95 }] }),
  boss('tob', 'late', 'Theatre of Blood', 'Scythe of vitur, Ghrazi rapier and Sanguinesti staff.'),
  boss('toa', 'late', 'Tombs of Amascut', 'Tumeken\'s shadow, Osmumten\'s fang, lightbearer and Masori armour. The raid level can be scaled to suit you.', { requires: [{ quest: 'Beneath Cursed Sands' }] }),
  boss('nex', 'late', 'Nex', 'Torva armour and the zaryte crossbow.'),
  boss('zuk', 'late', 'TzKal-Zuk', 'The end of the Inferno, for the infernal cape.', { wiki: 'Inferno', requires: [{ item: 'Fire cape' }] }),
];

export const bosses = {
  id: 'bosses',
  name: 'Bossing ladder',
  blurb: 'Bosses in the order irons usually learn them, with what you need to get in and the drops that matter. Each ticks off with your first kill. Use Boss notes to plan your gear.',
  stages: [
    { id: 'early', name: 'Starter bosses', blurb: 'Learn the basics and get your first gear.' },
    { id: 'mid', name: 'Mid game', blurb: 'The bosses that unlock most of an iron\'s gear.' },
    { id: 'late', name: 'Late game', blurb: 'Raids and endgame bosses.' },
  ],
  steps: STEPS,
};
