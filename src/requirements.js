// Reads quest requirements from OSRS Wiki page source.
//
// Quest pages use a {{Quest details}} template with a "requirements" field, e.g.
//   |requirements =
//   * {{SCP|Agility|40|link=yes}}
//   * Completion of the following quests:
//   ** [[The Restless Ghost]]
// Skill levels come from {{SCP|Skill|level}}; quest requirements are links to other known quests.

const SKILL_NAMES = new Set([
  'Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching',
  'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming',
  'Runecraft', 'Hunter', 'Construction', 'Sailing',
]);

// Returns the text of the "requirements" field, or null if the page has no Quest details template.
export function requirementsField(wikitext) {
  const start = wikitext.search(/\{\{\s*Quest details/i);
  if (start === -1) return null;
  const body = wikitext.slice(start);
  const m = body.match(/\n\s*\|\s*requirements\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z][a-z0-9 _]*\s*=|\n\}\})/i);
  return m ? m[1] : '';
}

// Parses requirements from page source. knownQuests is a Set of quest names to match links against.
export function parseRequirements(wikitext, knownQuests, selfName = '') {
  const field = requirementsField(wikitext);
  if (field === null) return null;
  const skills = {};
  let combat = null;
  let questPoints = null;
  for (const m of field.matchAll(/\{\{\s*SCP\s*\|\s*([A-Za-z ]+?)\s*\|\s*(\d+)/gi)) {
    const name = m[1].trim();
    const level = Number(m[2]);
    const skill = [...SKILL_NAMES].find((s) => s.toLowerCase() === name.toLowerCase());
    if (skill) skills[skill] = Math.max(skills[skill] || 0, level);
    else if (/^combat$/i.test(name)) combat = Math.max(combat || 0, level);
    else if (/^quest( points)?$/i.test(name)) questPoints = Math.max(questPoints || 0, level);
  }
  const lowerToName = new Map([...knownQuests].map((q) => [q.toLowerCase(), q]));
  const quests = new Set();
  for (const m of field.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const name = lowerToName.get(m[1].trim().replace(/_/g, ' ').toLowerCase());
    if (name && name !== selfName) quests.add(name);
  }
  return { skills, combat, questPoints, quests: [...quests] };
}

// Compares requirements with the player's levels and quest progress.
export function checkRequirements(req, { levels, combatLevel, questStates }) {
  if (!req) return { status: 'unknown', missing: [] };
  const missing = [];
  for (const [skill, level] of Object.entries(req.skills)) {
    if ((levels[skill] ?? 1) < level) missing.push({ type: 'skill', name: skill, level, have: levels[skill] ?? 1 });
  }
  if (req.combat && combatLevel != null && combatLevel < req.combat) {
    missing.push({ type: 'skill', name: 'Combat', level: req.combat, have: combatLevel });
  }
  for (const q of req.quests) {
    if (questStates[q] !== 'complete') missing.push({ type: 'quest', name: q });
  }
  return { status: missing.length ? 'locked' : 'ready', missing };
}
