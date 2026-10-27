// Achievement diary route: every region and tier, most useful rewards first within each tier.
// Requirements and rewards are from each region's OSRS Wiki diary page (October 2026). Skill levels are the
// highest each tier asks for, leaving out ones that are only one of several ways to do a task.

// Region|Tier: skill levels and completed quests the tier needs.
const REQUIREMENTS = {
  'Ardougne|Easy': { skills: { Thieving: 5 }, quests: ['Biohazard', 'Rune Mysteries'] },
  'Ardougne|Medium': { skills: { Agility: 39, Farming: 31, Firemaking: 50, Magic: 51, Ranged: 21, Strength: 38, Thieving: 38 }, quests: ['Enlightened Journey', 'Plague City', 'The Hand in the Sand', 'Tower of Life', 'Underground Pass'] },
  'Ardougne|Hard': { skills: { Construction: 50, Farming: 70, Hunter: 59, Magic: 66, Runecraft: 65, Smithing: 68, Thieving: 72 }, quests: ["Legends' Quest", "Mourning's End Part II", 'Watchtower'] },
  'Ardougne|Elite': { skills: { Agility: 90, Cooking: 91, Crafting: 10, Farming: 85, Fishing: 81, Fletching: 69, Magic: 94, Smithing: 91, Thieving: 82 }, quests: ['Desert Treasure I'] },
  'Desert|Easy': { skills: { Hunter: 5, Thieving: 21 }, quests: [] },
  'Desert|Medium': { skills: { Agility: 30, Construction: 20, Herblore: 36, Hunter: 47, Slayer: 22, Thieving: 25, Woodcutting: 35 }, quests: ["Eagles' Peak", "Enakhra's Lament", 'Spirits of the Elid', 'The Golem'] },
  'Desert|Hard': { skills: { Agility: 70, Attack: 50, Crafting: 55, Defence: 10, Firemaking: 60, Magic: 68, Mining: 45, Slayer: 65, Smithing: 68, Thieving: 65 }, quests: ['Desert Treasure I', 'Dream Mentor'] },
  'Desert|Elite': { skills: { Construction: 78, Cooking: 85, Fletching: 95, Magic: 94, Prayer: 85, Thieving: 91 }, quests: ['Desert Treasure I', 'Priest in Peril'] },
  'Falador|Easy': { skills: { Agility: 5, Construction: 16, Mining: 10, Smithing: 13 }, quests: ["The Knight's Sword"] },
  'Falador|Medium': { skills: { Agility: 42, Crafting: 40, Defence: 20, Farming: 30, Firemaking: 49, Magic: 37, Mining: 40, Prayer: 10, Ranged: 19, Slayer: 32, Strength: 37, Thieving: 40, Woodcutting: 30 }, quests: ['Recruitment Drive', 'Skippy and the Mogres'] },
  'Falador|Hard': { skills: { Agility: 50, Construction: 16, Defence: 50, Mining: 60, Prayer: 70, Runecraft: 56, Slayer: 72, Thieving: 50 }, quests: ['Grim Tales', 'The Slug Menace'] },
  'Falador|Elite': { skills: { Agility: 80, Farming: 91, Herblore: 81, Runecraft: 88, Woodcutting: 75 }, quests: ['Wanted!'] },
  'Fremennik|Easy': { skills: { Crafting: 23, Firemaking: 15, Hunter: 11, Mining: 20, Smithing: 20, Thieving: 5, Woodcutting: 15 }, quests: ['The Fremennik Trials'] },
  'Fremennik|Medium': { skills: { Construction: 37, Defence: 30, Hunter: 45, Mining: 40, Prayer: 43, Slayer: 47, Thieving: 42 }, quests: ["Eagles' Peak", 'Horror from the Deep', 'The Fremennik Trials'] },
  'Fremennik|Hard': { skills: { Herblore: 66, Hunter: 55, Magic: 72, Mining: 70, Smithing: 60, Thieving: 75, Woodcutting: 56 }, quests: ["Eadgar's Ruse", 'Lunar Diplomacy'] },
  'Fremennik|Elite': { skills: { Agility: 80, Crafting: 80, Hitpoints: 70, Ranged: 70, Runecraft: 82, Slayer: 83, Strength: 70 }, quests: ['Lunar Diplomacy'] },
  'Kandarin|Easy': { skills: { Agility: 20, Farming: 13, Fishing: 16 }, quests: [] },
  'Kandarin|Medium': { skills: { Agility: 36, Cooking: 43, Farming: 26, Fishing: 46, Fletching: 50, Herblore: 48, Magic: 45, Mining: 30, Ranged: 40, Strength: 22, Thieving: 47 }, quests: ["Alfred Grimhand's Barcrawl"] },
  'Kandarin|Hard': { skills: { Agility: 60, Construction: 50, Defence: 70, Firemaking: 65, Fishing: 70, Fletching: 70, Magic: 56, Prayer: 70, Smithing: 75, Strength: 50, Thieving: 53, Woodcutting: 60 }, quests: ["King's Ransom"] },
  'Kandarin|Elite': { skills: { Agility: 60, Cooking: 80, Crafting: 85, Farming: 79, Firemaking: 85, Fishing: 76, Herblore: 86, Magic: 87, Smithing: 90 }, quests: ['Family Crest', 'Lunar Diplomacy'] },
  'Karamja|Easy': { skills: { Agility: 15, Mining: 40 }, quests: [] },
  'Karamja|Medium': { skills: { Agility: 40, Cooking: 16, Farming: 27, Fishing: 65, Hunter: 41, Mining: 40, Woodcutting: 50 }, quests: ['Jungle Potion', 'Shilo Village', 'The Grand Tree'] },
  'Karamja|Hard': { skills: { Agility: 53, Cooking: 50, Mining: 52, Ranged: 42, Runecraft: 44, Strength: 50, Thieving: 50, Woodcutting: 10 }, quests: ['Shilo Village', 'Tai Bwo Wannai Trio'] },
  'Karamja|Elite': { skills: { Farming: 72, Herblore: 87, Runecraft: 91 }, quests: [] },
  'Kourend & Kebos|Easy': { skills: { Construction: 25, Fishing: 20, Herblore: 12, Mining: 15, Thieving: 25 }, quests: ['Druidic Ritual'] },
  'Kourend & Kebos|Medium': { skills: { Agility: 49, Construction: 30, Crafting: 30, Farming: 45, Firemaking: 50, Fishing: 43, Hunter: 53, Mining: 42, Woodcutting: 50 }, quests: ['The Depths of Despair'] },
  'Kourend & Kebos|Hard': { skills: { Farming: 74, Magic: 66, Mining: 65, Slayer: 62, Smithing: 70, Thieving: 49, Woodcutting: 60 }, quests: ['Dream Mentor'] },
  'Kourend & Kebos|Elite': { skills: { Cooking: 84, Crafting: 38, Farming: 85, Fishing: 82, Fletching: 40, Magic: 90, Mining: 38, Runecraft: 77, Slayer: 95, Woodcutting: 90 }, quests: [] },
  'Lumbridge & Draynor|Easy': { skills: { Cooking: 34, Firemaking: 15, Fishing: 15, Mining: 15, Runecraft: 5, Slayer: 7, Woodcutting: 15 }, quests: ["Cook's Assistant", 'Rune Mysteries'] },
  'Lumbridge & Draynor|Medium': { skills: { Agility: 20, Crafting: 38, Fishing: 30, Hunter: 42, Magic: 31, Ranged: 50, Runecraft: 23, Strength: 19, Thieving: 38, Woodcutting: 30 }, quests: ['Animal Magnetism', 'Lost City'] },
  'Lumbridge & Draynor|Hard': { skills: { Agility: 46, Crafting: 70, Farming: 63, Firemaking: 65, Magic: 60, Prayer: 52, Runecraft: 59, Woodcutting: 57 }, quests: ['Another Slice of H.A.M.', 'Lost City', 'Tears of Guthix'] },
  'Lumbridge & Draynor|Elite': { skills: { Agility: 70, Ranged: 70, Runecraft: 76, Smithing: 88, Strength: 70, Thieving: 78, Woodcutting: 75 }, quests: ['Death to the Dorgeshuun'] },
  'Morytania|Easy': { skills: { Cooking: 12, Crafting: 15, Farming: 23, Slayer: 15 }, quests: ['Nature Spirit'] },
  'Morytania|Medium': { skills: { Agility: 40, Cooking: 40, Herblore: 22, Hunter: 29, Slayer: 42, Smithing: 35, Woodcutting: 45 }, quests: ['Dwarf Cannon', 'Ghosts Ahoy', 'Lair of Tarn Razorlor'] },
  'Morytania|Hard': { skills: { Agility: 71, Construction: 50, Defence: 70, Farming: 53, Firemaking: 50, Magic: 66, Mining: 55, Prayer: 70, Slayer: 58, Woodcutting: 50 }, quests: ['Cabin Fever', 'Desert Treasure I', 'Haunted Mine', 'In Aid of the Myreque', 'Nature Spirit'] },
  'Morytania|Elite': { skills: { Attack: 70, Crafting: 84, Defence: 70, Firemaking: 80, Fishing: 96, Magic: 83, Ranged: 70, Slayer: 85, Strength: 76 }, quests: ['Lunar Diplomacy', "Shades of Mort'ton"] },
  'Varrock|Easy': { skills: { Agility: 13, Crafting: 8, Fishing: 20, Mining: 15, Runecraft: 9, Thieving: 5 }, quests: ['Rune Mysteries'] },
  'Varrock|Medium': { skills: { Agility: 30, Farming: 30, Firemaking: 40, Magic: 49 }, quests: ["A Soul's Bane", 'Enlightened Journey', 'Garden of Tranquillity', "Gertrude's Cat", 'The Dig Site', 'Tree Gnome Village'] },
  'Varrock|Hard': { skills: { Agility: 51, Construction: 50, Farming: 68, Firemaking: 60, Hunter: 69, Magic: 54, Prayer: 52, Woodcutting: 60 }, quests: ['Desert Treasure I'] },
  'Varrock|Elite': { skills: { Cooking: 95, Fletching: 81, Herblore: 90, Magic: 86, Runecraft: 78, Smithing: 89 }, quests: ['Dream Mentor', 'Druidic Ritual', 'The Tourist Trap'] },
  'Western Provinces|Easy': { skills: { Fletching: 20, Hunter: 9, Mining: 15 }, quests: ['Big Chompy Bird Hunting', 'Rune Mysteries'] },
  'Western Provinces|Medium': { skills: { Agility: 37, Cooking: 42, Firemaking: 35, Fishing: 46, Hunter: 31, Mining: 40, Woodcutting: 35 }, quests: ['Big Chompy Bird Hunting', "Eagles' Peak", 'The Eyes of Glouphrie', 'The Grand Tree', 'Tree Gnome Village'] },
  'Western Provinces|Hard': { skills: { Agility: 48, Construction: 65, Cooking: 62, Farming: 68, Firemaking: 50, Fishing: 62, Hunter: 69, Magic: 64, Mining: 70, Ranged: 70, Thieving: 75, Woodcutting: 50 }, quests: ['Big Chompy Bird Hunting', 'Roving Elves', 'Swan Song'] },
  'Western Provinces|Elite': { skills: { Agility: 85, Attack: 42, Defence: 42, Farming: 75, Fletching: 85, Hitpoints: 42, Magic: 42, Prayer: 22, Ranged: 42, Slayer: 93, Strength: 42, Thieving: 85 }, quests: ['Big Chompy Bird Hunting', 'Underground Pass'] },
  'Wilderness|Easy': { skills: { Agility: 15, Magic: 21, Mining: 15 }, quests: ['Enter the Abyss'] },
  'Wilderness|Medium': { skills: { Agility: 52, Magic: 60, Mining: 55, Slayer: 50, Smithing: 50, Woodcutting: 61 }, quests: [] },
  'Wilderness|Hard': { skills: { Agility: 64, Fishing: 53, Herblore: 25, Hunter: 67, Magic: 66, Slayer: 68, Smithing: 75 }, quests: ['Mage Arena I'] },
  'Wilderness|Elite': { skills: { Cooking: 90, Firemaking: 75, Fishing: 85, Magic: 96, Mining: 85, Slayer: 83, Smithing: 90, Thieving: 84, Woodcutting: 75 }, quests: ['Desert Treasure I'] },
};

// Region: [reward item, { tier: the perks that matter most }].
const REWARDS = {
  Ardougne: ['Ardougne cloak', {
    Easy: 'Unlimited teleports to the Ardougne Monastery, with its altar and nearby fairy ring.',
    Medium: 'Three daily teleports to the Ardougne farm patch, 10% better pickpocketing in Ardougne, and 100 free noted pure essence a day from Wizard Cromperty.',
    Hard: 'Five daily farm teleports, 10% better pickpocketing everywhere, and 150 free essence a day.',
    Elite: 'Unlimited farm teleports, 84 buckets of sand a day from Bert, and 250 free essence a day.',
  }],
  Desert: ['Desert amulet', {
    Easy: 'Simon Templeton buys noted artefacts (handy for Pyramid Plunder), and the Pharaoh\'s sceptre holds 10 charges.',
    Medium: 'One daily teleport to Nardah.',
    Hard: 'Free carpet rides, more marks of grace at Pollnivneach, and Zahur cleans noted herbs.',
    Elite: 'Unlimited teleports to Nardah and the Kalphite Cave, and full protection from desert heat.',
  }],
  Falador: ['Falador shield', {
    Easy: 'Restores 25% of your Prayer once a day.',
    Medium: 'Restores 50% of your Prayer once a day, and 10% more XP from the Falador farm patch.',
    Hard: 'A full Prayer restore once a day, shows the Giant Mole\'s location, and opens the Crafting Guild bank.',
    Elite: 'Two full Prayer restores a day, and the larger amethyst mine in the Mining Guild.',
  }],
  Fremennik: ['Fremennik sea boots', {
    Easy: 'One daily teleport to Rellekka, and Peer the Seer acts as a bank deposit box.',
    Medium: 'Three daily teleports to Rellekka.',
    Hard: 'Five daily Rellekka teleports, Tan Leather and Recharge Dragonstone on the Lunar spellbook, and more marks at Rellekka.',
    Elite: 'Unlimited Rellekka teleports, and noted Dagannoth bones from the Dagannoth Kings.',
  }],
  Kandarin: ['Kandarin headgear', {
    Easy: 'Works as a light source, and the flax keeper swaps 30 flax for bow strings each day.',
    Medium: 'More marks of grace at Seers\' Village, and the flax keeper swaps 60 a day.',
    Hard: 'Camelot Teleport can take you to the Seers\' Village bank, a daily teleport to Sherlock, and 120 bow strings a day.',
    Elite: 'Unlimited teleports to Sherlock, 250 bow strings a day, and the first 200 coal in the coal trucks each day goes to your bank.',
  }],
  Karamja: ['Karamja gloves', {
    Easy: 'Cheaper boat trips and better prices in Karamja shops.',
    Medium: 'Access to the underground Shilo Village gem mine.',
    Hard: 'Unlimited teleports to the underground Shilo Village gem mine.',
    Elite: 'Unlimited teleports to Duradel, double Tokkul, and noted red dragonhide and metal dragon bars in the Brimhaven Dungeon.',
  }],
  'Kourend & Kebos': ["Rada's blessing", {
    Easy: 'Three daily teleports to the Kourend Woodland, and the Hosidius farming patches never get diseased.',
    Medium: 'Five daily Kourend Woodland teleports and a +1 Prayer bonus.',
    Hard: 'Three daily teleports to Mount Karuulm, and the Ash sanctifier.',
    Elite: 'Unlimited Mount Karuulm teleports, a +2 Prayer bonus, no burning in the Karuulm Slayer Dungeon, and full XP from the Ash sanctifier.',
  }],
  'Lumbridge & Draynor': ["Explorer's ring", {
    Easy: 'Two run energy restores and 30 free Low Level Alchemy casts a day.',
    Medium: 'Three daily teleports to the cabbage patch south of Falador.',
    Hard: 'Unlimited cabbage patch teleports.',
    Elite: '30 free High Level Alchemy casts a day, fairy rings without a staff, and a seventh Slayer block slot.',
  }],
  Morytania: ['Morytania legs', {
    Easy: 'Two daily teleports to the slime pool under the Ectofuntus.',
    Medium: 'Five daily slime pool teleports, works as a ghostspeak amulet, and Robin swaps bones for slime and bonemeal.',
    Hard: 'Unlimited Burgh de Rott teleports, the Bonecrusher, and 50% more runes from the Barrows chest.',
    Elite: 'Unlimited Ectofuntus teleports, full Prayer XP from the Bonecrusher, and the disease-free herb patch on Harmony Island.',
  }],
  Varrock: ['Varrock armour', {
    Easy: 'A 10% chance of an extra ore (up to gold) and of an extra bar at the Edgeville furnace (up to steel), and Zaff sells you noted battlestaves each day.',
    Medium: 'Extra ore and bars up to mithril, Varrock Teleport can go to the Grand Exchange, and more battlestaves a day.',
    Hard: 'Extra ore and bars up to adamantite, and more battlestaves a day.',
    Elite: 'Extra ore and bars of any kind, and 120 battlestaves a day.',
  }],
  'Western Provinces': ['Western banner', {
    Easy: 'Rantz gives you 25 ogre arrows a day, and more chompy birds appear.',
    Medium: '50 ogre arrows a day.',
    Hard: 'One daily teleport to the Piscatoris Fishing Colony, the elite Void upgrade, and a private red chinchompa hunting ground.',
    Elite: 'Unlimited Piscatoris teleports, and Nieve gives as many Slayer points as Duradel.',
  }],
  Wilderness: ['Wilderness sword', {
    Easy: 'Lundail gives you 40 random runes a day.',
    Medium: 'Callisto, Venenatis and Vet\'ion without a Slayer task, and 80 runes a day.',
    Hard: 'A daily teleport to the Fountain of Rune, choose your destination at Wilderness obelisks, and 120 runes a day.',
    Elite: 'Unlimited Fountain of Rune teleports, noted dragon bones in the Wilderness, a free Resource Area, and 200 runes a day.',
  }],
};

// Order within each tier: the regions whose rewards help an iron most at that point come first.
const ORDER = {
  Easy: ['Ardougne', 'Lumbridge & Draynor', 'Varrock', 'Falador', 'Kourend & Kebos', 'Morytania', 'Kandarin', 'Desert', 'Fremennik', 'Karamja', 'Western Provinces', 'Wilderness'],
  Medium: ['Ardougne', 'Lumbridge & Draynor', 'Varrock', 'Morytania', 'Kourend & Kebos', 'Falador', 'Kandarin', 'Karamja', 'Fremennik', 'Desert', 'Western Provinces', 'Wilderness'],
  Hard: ['Kandarin', 'Morytania', 'Ardougne', 'Kourend & Kebos', 'Lumbridge & Draynor', 'Falador', 'Varrock', 'Fremennik', 'Karamja', 'Desert', 'Western Provinces', 'Wilderness'],
  Elite: ['Lumbridge & Draynor', 'Ardougne', 'Morytania', 'Kourend & Kebos', 'Karamja', 'Fremennik', 'Western Provinces', 'Varrock', 'Kandarin', 'Falador', 'Desert', 'Wilderness'],
};
const TIER_NUMBER = { Easy: 1, Medium: 2, Hard: 3, Elite: 4 };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const steps = Object.entries(ORDER).flatMap(([tier, regions]) => regions.map((region) => {
  const [item, perks] = REWARDS[region];
  const req = REQUIREMENTS[`${region}|${tier}`];
  return {
    id: `${slug(region)}-${tier.toLowerCase()}`, stage: tier.toLowerCase(), category: slug(region),
    title: `${region} ${tier}`,
    why: `${item} ${TIER_NUMBER[tier]}: ${perks[tier]}`,
    wiki: `${region} Diary`,
    requires: [
      ...Object.entries(req.skills).map(([skill, level]) => ({ skill, level })),
      ...req.quests.map((quest) => ({ quest })),
    ],
    done: [{ diary: region, tier }],
  };
}));

export const diaries = {
  id: 'diaries',
  name: 'Diary route',
  blurb: 'Every achievement diary tier, with the most useful rewards first. Ready means you have the levels and quests the tier needs. Ticks off from WikiSync.',
  stages: [
    { id: 'easy', name: 'Easy', blurb: 'Quick wins with useful teleports.' },
    { id: 'medium', name: 'Medium', blurb: 'Better teleports and the first real perks.' },
    { id: 'hard', name: 'Hard', blurb: 'Big quality-of-life perks; needs higher levels and quests.' },
    { id: 'elite', name: 'Elite', blurb: 'The best versions of each reward, for late game.' },
  ],
  categories: Object.keys(REWARDS).map((r) => [slug(r), r]),
  steps,
};
