// Shared helpers for every view.
export const WIKI = 'https://oldschool.runescape.wiki';
export const view = document.getElementById('view');

export const SKILL_NAMES = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing', 'Defence', 'Herblore', 'Fishing',
  'Ranged', 'Thieving', 'Cooking', 'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Sailing',
];

// App-wide state, filled by app.js.
export const state = { settings: null };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU'));
export const short = (n) => {
  if (n == null) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  return fmt(n);
};
export const gp = (n) => (n == null ? '–' : `${fmt(n)} gp`);
export const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));
export const ago = (t) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
// "2 h 15 min", "45 min", "3 d 4 h"
export function duration(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  if (d >= 365) return `${(d / 365).toFixed(1)} years`;
  if (d >= 60) return `${Math.round(d / 30.4)} months`;
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
export const capitalise = (s) => s[0].toUpperCase() + s.slice(1);

export const wikiUrl = (page) => `${WIKI}/w/${encodeURIComponent(page.replace(/ /g, '_'))}`;
export const skillIcon = (name) => `${WIKI}/images/${name === 'Overall' ? 'Stats' : name}_icon.png`;
export const itemIcon = (icon) => (icon ? `${WIKI}/images/${encodeURIComponent(icon.replace(/ /g, '_'))}` : '');
export const img = (src, alt = '') => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`;

export class AuthRequired extends Error {}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.auth) {
    window.dispatchEvent(new Event('auth-required'));
    throw new AuthRequired(data.error);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), error ? 6000 : 2500);
}

// Runs an async action from a button, with a busy state and error toast.
export async function busy(button, fn, success) {
  if (button) button.disabled = true;
  try {
    await fn();
    if (success) toast(success);
    return true;
  } catch (err) {
    if (!(err instanceof AuthRequired)) toast(err.message, { error: true });
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

export function emptyState(title, body, action = '') {
  return `<div class="card empty"><h2>${esc(title)}</h2><p>${body}</p>${action}</div>`;
}

export const needsAccount = () => emptyState(
  'Set up your character',
  'Add your player name and account type to start tracking.',
  '<a class="btn btn-primary" href="#/settings">Go to settings</a>',
);

export function segmented(name, options, current, label) {
  return `<div class="segmented" role="group" aria-label="${esc(label)}">
    ${options.map(([value, text]) => `<button data-${name}="${esc(value)}" aria-pressed="${value === current}">${esc(text)}</button>`).join('')}
  </div>`;
}

// SVG line chart. points: [{t, v}]. Returns markup, or a message when there isn't enough data.
export function lineChart(points, { label, empty = 'The chart fills in as the app takes snapshots.' } = {}) {
  if (points.length < 2) return `<p class="muted small">${esc(empty)}</p>`;
  const W = 560, H = 220, L = 48, R = 12, T = 12, B = 26;
  const xs = points.map((p) => p.t), ys = points.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const x = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${x(x1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
  const date = (t) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const last = points.at(-1);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="${esc(label)} from ${fmt(points[0].v)} to ${fmt(last.v)}">
      ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
      <circle class="dot" cx="${x(last.t)}" cy="${y(last.v)}" r="3.5"/>
      <text class="axis" x="${L}" y="${H - 6}">${date(x0)}</text>
      <text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${date(x1)}</text>
    </svg>`;
}

// Interval that stops itself once the view it belongs to is replaced.
export function viewInterval(fn, ms) {
  const owner = view.firstElementChild;
  const id = setInterval(() => {
    if (!owner?.isConnected) return clearInterval(id);
    fn();
  }, ms);
}

// Item search box with a dropdown of matching items. Falls back to the typed name if nothing is picked.
export function itemPickerMarkup(placeholder = 'Search items') {
  return `<div class="picker">
    <input type="search" class="picker-input" placeholder="${esc(placeholder)}" autocomplete="off" required
      role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Item">
    <ul class="picker-list" role="listbox" hidden></ul>
    <input type="hidden" name="itemId"><input type="hidden" name="itemName"><input type="hidden" name="icon">
  </div>`;
}

export function bindItemPicker(root) {
  const input = root.querySelector('.picker-input');
  const list = root.querySelector('.picker-list');
  const hidden = (n) => root.querySelector(`[name="${n}"]`);
  let results = [], active = -1, timer;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const pick = (item) => {
    hidden('itemId').value = item.id;
    hidden('itemName').value = item.name;
    hidden('icon').value = item.icon || '';
    input.value = item.name;
    root.classList.add('picked');
    close();
  };
  const render = () => {
    list.innerHTML = results.map((r, i) => `<li role="option" id="opt-${r.id}" aria-selected="${i === active}" data-i="${i}">
      ${img(itemIcon(r.icon))}<span>${esc(r.name)}</span><span class="muted small">${r.price != null ? `${short(r.price)} gp` : ''}</span></li>`).join('');
    list.hidden = !results.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };

  input.addEventListener('input', () => {
    hidden('itemId').value = '';
    hidden('itemName').value = input.value.trim();
    hidden('icon').value = '';
    root.classList.remove('picked');
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results = []; return render(); }
    timer = setTimeout(async () => {
      try {
        results = (await api(`/prices/search?q=${encodeURIComponent(q)}`)).slice(0, 8);
      } catch {
        results = [];
      }
      if (input.value.trim() === q) { active = -1; render(); }
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); pick(results[Number(li.dataset.i)]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 100));

  return {
    reset() {
      input.value = '';
      ['itemId', 'itemName', 'icon'].forEach((n) => (hidden(n).value = ''));
      root.classList.remove('picked');
      results = [];
      render();
    },
  };
}

export const EVENT_TYPES = {
  level: 'Level',
  kc: 'Kill count',
  quest: 'Quest',
  diary: 'Diary',
  drop: 'Drop',
  slayer: 'Slayer',
  clog: 'Collection log',
  collection: 'Collection log',
  pb: 'Personal best',
  ca: 'Combat task',
  clue: 'Clue',
  pet: 'Pet',
  death: 'Death',
};

export function eventRow(e) {
  return `<li class="event">
    <span class="event-type t-${esc(e.type)}">${esc(EVENT_TYPES[e.type] || e.type)}</span>
    <span class="event-body"><span>${esc(e.title)}</span>${e.detail ? `<span class="muted small">${esc(e.detail)}</span>` : ''}</span>
    <time class="muted small" datetime="${new Date(e.at).toISOString()}">${ago(e.at)}</time>
  </li>`;
}

// Theme is per device: 'system', 'light' or 'dark'.
export function getTheme() {
  try {
    return localStorage.getItem('theme') || 'system';
  } catch {
    return 'system';
  }
}
export function setTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch { /* storage unavailable: the choice lasts until reload */ }
}
