import { EVENT_TYPES, api, emptyState, esc, needsAccount, segmented, state, view } from '../lib.js';

const ui = { type: '' };
const FILTERS = [['', 'All'], ['level', 'Levels'], ['kc', 'Kill counts'], ['quest', 'Quests'], ['diary', 'Diaries'], ['drop', 'Drops'], ['slayer', 'Slayer'], ['clog', 'Collection log'], ['pb', 'Personal bests'], ['ca', 'Combat tasks'], ['clue', 'Clues'], ['pet', 'Pets'], ['death', 'Deaths']];

const dayLabel = (t) => {
  const d = new Date(t), today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

export async function renderActivity() {
  if (!state.settings.active) return (view.innerHTML = needsAccount());
  const events = await api(`/activity?limit=300${ui.type ? `&type=${ui.type}` : ''}`);

  const groups = [];
  for (const e of events) {
    const label = dayLabel(e.at);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(e);
  }

  view.innerHTML = `<div>
    <div class="page-head">
      <div>
        <h1>Activity</h1>
        <p class="muted small">Level-ups, kill count milestones, quests, diaries, drops and Slayer tasks. Hiscores events are dated when the app noticed them.</p>
      </div>
    </div>
    <div class="stack">
      ${segmented('type', FILTERS, ui.type, 'Filter activity')}
      ${groups.length ? groups.map((g) => `
        <section class="card">
          <div class="card-head"><h2>${esc(g.label)}</h2></div>
          <ul class="events">${g.items.map((e) => `<li class="event">
            <span class="event-type t-${esc(e.type)}">${esc(EVENT_TYPES[e.type] || e.type)}</span>
            <span class="event-body"><span>${esc(e.title)}</span>${e.detail ? `<span class="muted small">${esc(e.detail)}</span>` : ''}</span>
            <time class="muted small">${new Date(e.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</time>
          </li>`).join('')}</ul>
        </section>`).join('')
        : emptyState('Nothing yet', 'Activity builds up as the app refreshes your stats and syncs quests, and as you log drops and Slayer tasks.')}
    </div></div>`;

  view.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    ui.type = b.dataset.type;
    renderActivity();
  }));
}
