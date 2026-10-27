// Reads the route from the OSRS Wiki's "Optimal quest guide/Ironman" page.
//
// The route is a table with one row per step:
//   |- data-rowid="Cook's Assistant"
//   |[[Cook's Assistant]]                              a quest (or "(miniquest)")
//   |Partially complete: [[Pirate's Treasure]]         a quest to start
//   |Easy [[Ardougne Diary]]  /  All Easy [[Achievement Diaries]]
//   |Unlock: [[Stronghold of Security]]                something to do by hand
// Training appears inside a row as {{Optimal quest/train|agility|25}}, to do before that row's step,
// and as full-width rows like "! colspan="7" |Train {{SCP|Combat}} [[Combat]] to 85".

export const ROUTE_PAGE = 'Optimal quest guide/Ironman';

const FLOORS = ['ground', 'first', 'second', 'third'];
const capitalise = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();

// Wikitext to readable plain text, for the route's notes.
export function plainText(wikitext) {
  return wikitext
    .replace(/\{\{\s*SCP\s*\|\s*([A-Za-z ]+?)\s*\|\s*(\d+)[^}]*\}\}/gi, '$2 $1')
    .replace(/\{\{\s*Coins\s*\|\s*([\d,]+)[^}]*\}\}/gi, '$1 coins')
    .replace(/\{\{\s*FloorNumber\s*\|\s*uk=(\d+)[^}]*\}\}/gi, (_, n) => (FLOORS[n] ? `${FLOORS[n]} floor` : `floor ${n}`))
    .replace(/\{\{\s*Optimal quest\/train[^}]*\}\}/gi, '')
    .replace(/\{\{\s*Checklist\s*\|/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/^\s*\}\}\s*$/gm, '')
    .split('\n').map((l) => l.replace(/^\*+\s*/, '').trim()).filter(Boolean);
}

export function parseQuestRoute(wikitext) {
  const start = wikitext.indexOf('data-tableid="OQG-Ironman"');
  if (start === -1) return null;
  const end = wikitext.indexOf('\n|}', start);
  const rows = wikitext.slice(start, end === -1 ? undefined : end).split(/\n\|-[^\n]*/).slice(1);
  const route = [];
  for (const row of rows) {
    const lines = row.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const first = lines[0];

    const banner = first.match(/^!\s*colspan[^|]*\|(.*)$/);
    if (banner) {
      const combat = banner[1].match(/Train .*Combat.*? to (\d+)/i);
      if (combat) route.push({ type: 'combat', level: Number(combat[1]), notes: plainText(banner[1]) });
      continue;
    }

    for (const t of row.matchAll(/\{\{\s*Optimal quest\/train\s*\|\s*([a-z]+)\s*\|\s*(\d+)\s*\}\}([^\n]*)/gi)) {
      route.push({ type: 'train', skill: capitalise(t[1]), level: Number(t[2]), notes: plainText(t[3]) });
    }

    // The first cell, without any "data-sort-value=... |" attributes.
    const cell = first.replace(/^\|/, '').replace(/^\s*data-sort-value="[^"]*"\s*\|/, '').trim();
    const link = cell.match(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/);
    if (!link) continue;
    const page = link[1].trim();
    // Notes are the "Additional steps and information" cell: the last multi-line cell before the location.
    const notesStart = row.indexOf('{{Checklist');
    const notes = notesStart === -1 ? [] : plainText(row.slice(notesStart, row.lastIndexOf('\n|')));

    const diary = cell.match(/^(All )?(Easy|Medium|Hard|Elite) \[\[/);
    if (diary) {
      route.push({ type: 'diary', tier: diary[2], region: diary[1] ? null : page.replace(/ Diary$/, ''), notes });
    } else if (/^Partially complete:/i.test(cell)) {
      route.push({ type: 'start', name: page, notes });
    } else if (/^\s*Unlock:/i.test(cell)) {
      route.push({ type: 'unlock', name: plainText(cell.replace(/^\s*Unlock:\s*/i, '')).join(' '), page, notes });
    } else {
      // Recipe for Disaster parts are linked as subpages, e.g. "Recipe for Disaster/Freeing Evil Dave".
      route.push({ type: 'quest', name: page, miniquest: /\(miniquest\)/i.test(cell), notes });
    }
  }
  return route.length ? route : null;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Turns the route into guide steps.
// regions: diary regions, for "All Easy Achievement Diaries". keyQuests: lower-case quest name -> reason it matters.
export function questRouteSteps(route, { regions, keyQuests = {} }) {
  const seen = new Map();
  const uniqueId = (id) => {
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    return n > 1 ? `${id}-${n}` : id;
  };
  return route.map((r) => {
    const notes = r.notes || [];
    if (r.type === 'train') {
      return {
        id: uniqueId(`train-${slug(r.skill)}-${r.level}`), category: 'skill', title: `Train ${r.skill} to ${r.level}`,
        why: notes.join(' ') || 'Needed for the quests that follow.', wiki: r.skill, done: [{ skill: r.skill, level: r.level }],
      };
    }
    if (r.type === 'combat') {
      return {
        id: uniqueId(`train-combat-${r.level}`), category: 'skill', title: `Train combat to ${r.level}`,
        why: notes.join(' '), wiki: 'Combat level', done: [{ combat: r.level }],
      };
    }
    if (r.type === 'diary') {
      const list = r.region ? [r.region] : regions;
      return {
        id: uniqueId(`diary-${slug(r.region || 'all')}-${r.tier.toLowerCase()}`), category: 'diary',
        title: r.region ? `${r.tier} ${r.region} Diary` : `All ${r.tier} diaries`,
        why: '', notes, wiki: r.region ? `${r.region} Diary` : 'Achievement Diary',
        done: list.filter(Boolean).map((region) => ({ diary: region, tier: r.tier })),
      };
    }
    if (r.type === 'unlock') {
      return { id: uniqueId(`unlock-${slug(r.name)}`), category: 'unlock', title: `Unlock ${r.name}`, why: '', notes, wiki: r.page, done: [] };
    }
    const name = r.name;
    const display = name.replace(/^Recipe for Disaster\//, 'Recipe for Disaster: ');
    return {
      id: uniqueId(`${r.type === 'start' ? 'start-' : ''}${slug(name)}`), category: 'quest',
      title: r.type === 'start' ? `Start ${display}` : `${display}${r.miniquest ? ' (miniquest)' : ''}`,
      why: keyQuests[name.toLowerCase()] || '', key: Boolean(keyQuests[name.toLowerCase()]), notes, wiki: name,
      done: [{ quest: name, ...(r.type === 'start' ? { started: true } : {}) }],
    };
  });
}

