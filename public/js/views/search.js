// Search across the app: pages, skills, and everything /api/search finds.
import { SKILL_NAMES, api, esc, img, itemIcon, skillIcon, view } from '../lib.js';

// Pages from the sidebar, with extra words people might search for.
const PAGES = [
  ['Overview', '#/overview', 'stats levels xp home'], ['Activity', '#/activity', 'feed timeline'],
  ['Sessions', '#/sessions', 'play session xp per hour'], ['Goals', '#/goals', 'target max cape'],
  ['Quests & diaries', '#/quests', 'quest diary achievement music combat tasks wikisync'], ['Guides', '#/guides', 'iron guide route'],
  ['Bossing', '#/bossing', 'kill count kc clues minigames'],
  ['Boss notes', '#/bosses', 'gear inventory strategy'], ['Slayer', '#/slayer', 'task points'],
  ['Drops', '#/drops', 'loot gp'], ['Collection log', '#/collection', 'clog dry'],
  ['Timers & dailies', '#/timers', 'herb birdhouse farming checklist weekly'], ['Supplies', '#/supplies', 'stock potions'],
  ['Tasks', '#/tasks', 'to do board'], ['Calculators', '#/calc', 'combat level xp calculator'], ['Settings', '#/settings', 'accounts alerts dink backup theme'],
];

let seq = 0;
async function find(q) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const local = [
    ...PAGES.filter(([name, , words]) => name.toLowerCase().includes(t) || words.includes(t)).map(([title, href]) => ({ group: 'Pages', title, href })),
    ...SKILL_NAMES.filter((s) => s.toLowerCase().includes(t)).map((s) => ({ group: 'Skills', title: s, href: `#/skill/${encodeURIComponent(s)}`, skill: s })),
  ];
  const remote = await api(`/search?q=${encodeURIComponent(t)}`).catch(() => []);
  return [...local, ...remote];
}

function resultsMarkup(results, q, active = -1) {
  if (!results.length) return `<p class="muted small search-empty">Nothing found for "${esc(q)}".</p>`;
  let i = -1, last = '';
  return results.map((r) => {
    i++;
    const head = r.group !== last ? `<div class="search-group">${esc((last = r.group))}</div>` : '';
    const icon = r.skill ? img(skillIcon(r.skill)) : r.icon ? img(itemIcon(r.icon)) : '';
    return `${head}<a class="search-hit" role="option" id="hit-${i}" data-i="${i}" href="${esc(r.href)}" aria-selected="${i === active}">
      ${icon ? `<span class="search-icon">${icon}</span>` : ''}<span class="search-title">${esc(r.title)}</span>${r.sub ? `<span class="muted small">${esc(r.sub)}</span>` : ''}</a>`;
  }).join('');
}

// Sidebar search box with a dropdown. Press / anywhere to focus it.
export function bindSearchBox() {
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-results');
  if (!input) return;
  let results = [], active = -1, timer;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const draw = () => {
    box.innerHTML = resultsMarkup(results, input.value, active);
    box.hidden = input.value.trim().length < 2;
    input.setAttribute('aria-expanded', String(!box.hidden));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `hit-${active}`);
      box.querySelector(`#hit-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value;
    if (q.trim().length < 2) { results = []; return close(); }
    timer = setTimeout(async () => {
      const id = ++seq;
      const found = await find(q);
      if (id !== seq || input.value !== q) return;
      results = found;
      active = results.length ? 0 : -1;
      draw();
    }, 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; close(); input.blur(); return; }
    if (box.hidden || !results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      draw();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      location.hash = results[active].href;
      input.value = '';
      close();
    }
  });
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus so the click lands
  box.addEventListener('click', () => { input.value = ''; close(); });
  input.addEventListener('blur', () => setTimeout(close, 100));
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (input.offsetParent === null) return; // hidden on phones
    e.preventDefault();
    input.focus();
  });
}

// Full-page search, used on phones where the sidebar box is hidden.
export async function renderSearch(param = '') {
  view.innerHTML = `<div>
    <div class="page-head"><div><h1>Search</h1><p class="muted small">Quests, bosses, skills, guides, items, and your own lists.</p></div></div>
    <div class="stack">
      <input id="page-search" type="search" placeholder="Search" aria-label="Search" autocomplete="off" value="${esc(param)}">
      <div class="card search-page" id="page-results" hidden></div>
    </div></div>`;
  const input = document.getElementById('page-search');
  const out = document.getElementById('page-results');
  let timer;
  const run = async () => {
    const q = input.value;
    if (q.trim().length < 2) return (out.hidden = true);
    const id = ++seq;
    const results = await find(q);
    if (id !== seq || !out.isConnected) return;
    out.innerHTML = resultsMarkup(results, q);
    out.hidden = false;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  input.focus();
  if (param) run();
}
