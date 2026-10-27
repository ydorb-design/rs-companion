// Skill training: common ironman methods by level band. A method shows Ready once you have its level,
// and is ticked off once you reach the level where the next method takes over.

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// method(skill, title, from, to, why, { requires, wiki })
function method(skill, title, from, to, why, extra = {}) {
  return {
    id: slug(`${skill} ${title}`), stage: slug(skill), title, why, wiki: extra.wiki || title,
    requires: [...(from > 1 ? [{ skill, level: from }] : []), ...(extra.requires || [])],
    done: to ? [{ skill, level: to, label: `Move on at ${to} ${skill}` }] : [],
  };
}

const METHODS = {
  Agility: [
    method('Agility', 'Draynor Village Rooftop Course', 10, 30, 'The first rooftop course. Marks of grace add up towards the Graceful outfit.'),
    method('Agility', 'Varrock Rooftop Course', 30, 40, 'Better XP and marks than Draynor.'),
    method('Agility', 'Canifis Rooftop Course', 40, 60, 'Lots of marks of grace for its level. Most people get Graceful here.', { requires: [{ quest: 'Priest in Peril' }] }),
    method('Agility', 'Seers\' Village Rooftop Course', 60, 70, 'Fast XP, faster still with the Kandarin Hard diary teleport to the bank.'),
    method('Agility', 'Pollnivneach Rooftop Course', 70, 80, 'The next step up in XP.'),
    method('Agility', 'Rellekka Rooftop Course', 80, 90, 'Good XP and marks until Ardougne.'),
    method('Agility', 'Ardougne Rooftop Course', 90, null, 'The best marks of grace per hour.'),
    method('Agility', 'Hallowed Sepulchre', 52, null, 'An alternative to rooftops from 52, with better XP at higher floors and its own rewards.'),
  ],
  Firemaking: [
    method('Firemaking', 'Wintertodt', 50, null, 'Supply crates give herbs, seeds, ores, logs and more, which is why almost every iron trains Firemaking here.'),
  ],
  Fishing: [
    method('Fishing', 'Fly fishing', 20, 35, 'Trout and salmon, which you can cook for early food.', { wiki: 'Fly fishing rod' }),
    method('Fishing', 'Tempoross', 35, null, 'Rewards include fish, the fish barrel, tome of water and a chance at the Tackle box.'),
    method('Fishing', 'Barbarian Fishing', 48, null, 'Fast Fishing XP with some Agility and Strength XP. Needs 15 Agility and 15 Strength.'),
    method('Fishing', 'Karambwan', 65, null, 'Karambwans are fast-eating combo food for bossing.', { requires: [{ quest: 'Tai Bwo Wannai Trio' }] }),
  ],
  Mining: [
    method('Mining', 'Iron ore', 15, 30, 'Fast XP by dropping the ore, and iron for early smithing.'),
    method('Mining', 'Motherlode Mine', 30, null, 'Steady ore and coal, and golden nuggets for the prospector outfit and coal bag.'),
    method('Mining', 'Volcanic Mine', 50, null, 'Very fast XP in a group activity on Fossil Island.', { requires: [{ quest: 'Bone Voyage' }] }),
    method('Mining', 'Shooting Stars', 10, null, 'Relaxed XP and stardust. Stars land around the world every couple of hours.', { wiki: 'Shooting Stars' }),
  ],
  Smithing: [
    method('Smithing', "Giants' Foundry", 15, null, 'Smithing XP from bars you already have, plus coins, which irons are often short of.'),
    method('Smithing', 'Gold bars at the Blast Furnace', 40, null, 'Very fast XP with goldsmith gauntlets from Family Crest.', { wiki: 'Blast Furnace', requires: [{ quest: 'Family Crest' }] }),
  ],
  Runecraft: [
    method('Runecraft', 'Guardians of the Rift', 27, null, 'The main iron Runecraft method: you get runes of many kinds, plus the outfit and essence pouches.', { requires: [{ quest: 'Temple of the Eye' }] }),
    method('Runecraft', 'Lava runes', 23, null, 'Fast XP if you have binding necklaces and earth talismans or tiaras.', { wiki: 'Lava rune' }),
    method('Runecraft', 'Blood runes', 77, null, 'Blood runes for your own spells, and good XP.', { wiki: 'Blood rune' }),
    method('Runecraft', 'Soul runes', 90, null, 'Soul runes for your own spells.', { wiki: 'Soul rune' }),
  ],
  Hunter: [
    method('Hunter', 'Birdhouse runs', 5, null, 'Passive Hunter XP every 50 minutes, plus bird nests full of seeds.', { wiki: 'Birdhouse trapping', requires: [{ quest: 'Bone Voyage' }] }),
    method('Hunter', 'Red chinchompas', 63, null, 'Good XP, and the chinchompas are a strong Ranged weapon for multi-target training.', { wiki: 'Red chinchompa' }),
    method('Hunter', 'Herbiboar', 80, null, 'Hunter XP and a steady supply of herbs. Needs 31 Herblore.', { requires: [{ skill: 'Herblore', level: 31 }, { quest: 'Bone Voyage' }] }),
  ],
  Thieving: [
    method('Thieving', 'Pyramid Plunder', 21, null, 'Good XP, and the artefacts sell for coins.'),
    method('Thieving', 'Master Farmer', 38, null, 'Seeds for your farm runs, including ranarr and snapdragon seeds.'),
    method('Thieving', 'Ardougne knights', 55, null, 'Good XP and a lot of coins. Ardougne diaries make it better.', { wiki: 'Knight of Ardougne' }),
    method('Thieving', 'Elves', 85, null, 'Coins, crystal shards and enhanced crystal teleport seeds.', { wiki: 'Elf', requires: [{ quest: 'Song of the Elves' }] }),
  ],
  Woodcutting: [
    method('Woodcutting', 'Teak trees', 35, null, 'Fast XP by dropping the logs.', { wiki: 'Teak tree' }),
    method('Woodcutting', 'Yew trees', 60, null, 'Slower, but yew logs make bows to fletch and alch.', { wiki: 'Yew tree' }),
    method('Woodcutting', 'Redwood trees', 90, null, 'Relaxed, steady XP with few bank trips.', { wiki: 'Redwood tree' }),
  ],
  Cooking: [
    method('Cooking', 'Jugs of wine', 35, null, 'Very fast XP from grapes and jugs of water.', { wiki: 'Jug of wine' }),
    method('Cooking', 'Karambwan', 30, null, 'Cooking your own karambwans gives you combo food.', { wiki: 'Cooked karambwan', requires: [{ quest: 'Tai Bwo Wannai Trio' }] }),
  ],
  Construction: [
    method('Construction', 'Mahogany Homes', 1, null, 'Good XP for the planks used, plus a carpenter\'s outfit and plank sack.'),
    method('Construction', 'Oak larders', 33, 52, 'Simple, fast XP from oak planks.', { wiki: 'Oak larder' }),
    method('Construction', 'Mahogany tables', 52, null, 'The fastest common method, if you have mahogany planks.', { wiki: 'Mahogany table' }),
  ],
  Prayer: [
    method('Prayer', 'Ensouled heads', 16, null, 'Arceuus reanimation spells give Prayer XP from heads dropped by monsters. Uses Magic levels to unlock higher heads.', { wiki: 'Ensouled head', requires: [{ skill: 'Magic', level: 16 }] }),
    method('Prayer', 'Chaos Altar (Wilderness)', 1, null, 'High XP per bone and a chance to keep each bone, at some risk in the Wilderness.', { wiki: 'Chaos Altar' }),
  ],
  Crafting: [
    method('Crafting', 'Glassblowing', 1, null, 'Molten glass from sand and soda ash. Unpowered orbs (46) are the usual target.'),
    method('Crafting', 'Green dragonhide bodies', 63, null, 'Ranged armour for yourself, and good XP.', { wiki: "Green d'hide body" }),
    method('Crafting', 'Superglass Make', 77, null, 'A Lunar spell that turns sand and seaweed into molten glass, with Magic XP too. Needs 77 Magic.', { requires: [{ skill: 'Magic', level: 77 }, { quest: 'Lunar Diplomacy' }] }),
  ],
  Fletching: [
    method('Fletching', 'Yew longbows', 70, null, 'Fletch from your own yew logs and alch them for coins.', { wiki: 'Yew longbow' }),
    method('Fletching', 'Magic longbows', 85, null, 'Better XP and alch value.', { wiki: 'Magic longbow' }),
  ],
  Magic: [
    method('Magic', 'High Level Alchemy', 55, null, 'Turns items into coins. On an iron this is a main source of money.'),
  ],
  Ranged: [
    method('Ranged', 'Chinning with red chinchompas', 55, null, 'Very fast multi-target Ranged XP, with chinchompas you hunt yourself.', { wiki: 'Red chinchompa' }),
  ],
  Slayer: [
    method('Slayer', 'Chaeldar', 1, null, 'A step up from Vannaka once you have 70 combat.', { requires: [{ combat: 70 }] }),
    method('Slayer', 'Konar quo Maten', 1, null, 'Assigns a location as well as a monster, and her tasks can drop brimstone keys.', { requires: [{ combat: 75 }] }),
    method('Slayer', 'Nieve', 1, null, 'A high-level master with better tasks and more points.', { requires: [{ combat: 85 }] }),
    method('Slayer', 'Duradel', 50, null, 'The highest-level master. Needs 100 combat.', { requires: [{ combat: 100 }] }),
  ],
};

export const skills = {
  id: 'skills',
  name: 'Skill training',
  blurb: 'Common ironman training methods by level. A method shows Ready once you have its level, and ticks off once you reach the next one.',
  stages: Object.keys(METHODS).map((s) => ({ id: slug(s), name: s })),
  steps: Object.values(METHODS).flat(),
};
