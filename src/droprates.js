// Drop rates from OSRS Wiki monster pages, and how dry you are on an item.
//
// Monster pages list drops as {{DropsLine|name=Tanzanite fang|quantity=1|rarity=1/1024|rolls=2}}.
// Within one version of a monster, an item's lines (different quantities or tables) are combined. Pages with
// several versions (=== headings, e.g. a Wilderness variant) repeat the table, so the best version is used.

// Works out {{#expr:...}} arithmetic, which some pages use for exact rates. Only plain arithmetic is allowed.
function expandExpr(text) {
  return text.replace(/\{\{\s*#expr:\s*([^{}]*?)(?:\s+round\s+\d+)?\s*\}\}/gi, (whole, expr) => {
    if (!/^[\d.\s+\-*/()]+$/.test(expr)) return whole;
    const value = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(value) ? String(value) : whole;
  });
}

// "1/1,024", "~2/128", "3/512" -> probability; "Always" -> 1; anything else (Rare, Varies) -> null.
export function parseRarity(text) {
  const t = expandExpr(String(text || '')).trim();
  if (/^always$/i.test(t)) return 1;
  const m = t.replace(/,/g, '').match(/^~?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const p = Number(m[1]) / Number(m[2]);
  return p > 0 && p <= 1 ? p : null;
}

// Template parameters, ignoring nested templates like {{Refn|...}}.
function templateParams(body) {
  const params = {};
  let depth = 0, current = '';
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{{', i)) { depth++; current += '{{'; i++; continue; }
    if (body.startsWith('}}', i)) { depth--; current += '}}'; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(current); current = ''; continue; }
    current += body[i];
  }
  parts.push(current);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return params;
}

// Returns { lower-case item name: chance per kill }.
export function parseDropRates(wikitext) {
  const best = {};
  for (const section of String(wikitext).split(/\n===[^=].*?===\s*\n/)) {
    const miss = {};
    for (const m of section.matchAll(/\{\{\s*DropsLine\s*\|((?:[^{}]|\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\})*)\}\}/gi)) {
      const params = templateParams(m[1]);
      const name = params.name?.toLowerCase();
      const p = parseRarity(params.rarity);
      if (!name || p == null) continue;
      const rolls = Number(params.rolls) || 1;
      // Chance of missing on every roll of every line.
      miss[name] = (miss[name] ?? 1) * (1 - p) ** rolls;
    }
    for (const [name, q] of Object.entries(miss)) best[name] = Math.max(best[name] ?? 0, 1 - q);
  }
  return best;
}

// rate: chance per kill. Returns the chance of at least one drop by now, the kills you'd expect it in on
// average, and how far past that you are (1 = exactly on rate, 2 = twice the rate).
export function dryness(kc, rate) {
  if (kc == null || !rate) return null;
  return { chance: 1 - (1 - rate) ** kc, expected: 1 / rate, ratio: kc * rate };
}
