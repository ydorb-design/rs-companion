import {
  api, busy, esc, fmt, gp, img, itemIcon, signed, view, wikiUrl,
} from '../lib.js';

const priceState = { q: '', results: [] };

export async function renderPrices(param) {
  if (param) priceState.q = param;
  view.innerHTML = `<div>
    <div class="page-head">
      <div><h1>Prices</h1><p class="muted small">Live Grand Exchange prices from the OSRS Wiki. Useful for judging drop value and what's worth alching.</p></div>
    </div>
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Watchlist</h2></div>
        <div id="watchlist"><p class="muted small">Loading…</p></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Search items</h2></div>
        <input id="item-search" type="search" placeholder="e.g. rune platebody" value="${esc(priceState.q)}" aria-label="Search items" autocomplete="off">
        <div id="results" style="margin-top:12px"></div>
      </section>
    </div></div>`;

  const search = document.getElementById('item-search');
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => runSearch(search.value), 250);
  });
  loadWatchlist();
  if (priceState.q) runSearch(priceState.q);
}

function priceTable(rows, { watched }) {
  if (!rows.length) return '';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Item</th><th class="r">GE price</th><th class="r">High alch</th><th class="r" title="High alch value minus item price and a nature rune">Alch profit</th><th class="r">Buy limit</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><a class="item" href="${wikiUrl(r.name)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${img(itemIcon(r.icon))}<span>${esc(r.name)}</span></a></td>
        <td class="r">${gp(r.price)}</td>
        <td class="r">${gp(r.highAlch)}</td>
        <td class="r ${r.alchProfit > 0 ? 'pos' : r.alchProfit < 0 ? 'neg' : ''}">${r.alchProfit == null ? '–' : signed(r.alchProfit)}</td>
        <td class="r">${fmt(r.limit)}</td>
        <td class="r">${watched.has(r.id)
          ? `<button class="btn btn-ghost btn-sm" data-unwatch="${r.id}">Remove</button>`
          : `<button class="btn btn-sm" data-watch="${r.id}">Watch</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

let watchedIds = new Set();

async function loadWatchlist() {
  const el = document.getElementById('watchlist');
  try {
    const rows = await api('/prices/watchlist');
    watchedIds = new Set(rows.map((r) => r.id));
    el.innerHTML = rows.length ? priceTable(rows, { watched: watchedIds }) : '<p class="muted small">Search for items below and add them to keep an eye on their value.</p>';
    bindWatchButtons(el);
  } catch (err) {
    el.innerHTML = `<p class="small neg">${esc(err.message)}</p>`;
  }
}

async function runSearch(q) {
  priceState.q = q;
  const el = document.getElementById('results');
  if (!el) return;
  if (q.trim().length < 2) return (el.innerHTML = '');
  try {
    priceState.results = await api(`/prices/search?q=${encodeURIComponent(q)}`);
    if (priceState.q !== q) return;
    el.innerHTML = priceState.results.length ? priceTable(priceState.results, { watched: watchedIds }) : '<p class="muted small">No items found.</p>';
    bindWatchButtons(el);
  } catch (err) {
    el.innerHTML = `<p class="small neg">${esc(err.message)}</p>`;
  }
}

function bindWatchButtons(root) {
  root.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api('/prices/watchlist', { method: 'POST', body: { id: Number(b.dataset.watch) } }), 'Added to watchlist')) {
      await loadWatchlist();
      runSearch(priceState.q);
    }
  }));
  root.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/prices/watchlist/${b.dataset.unwatch}`, { method: 'DELETE' }))) {
      await loadWatchlist();
      runSearch(priceState.q);
    }
  }));
}
