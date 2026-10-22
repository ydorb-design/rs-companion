// Activity feed: notable things worked out from snapshots and syncs, plus logged drops and tasks.
import { activityGroup } from './activities.js';

const KC_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

// Highest kill count milestone passed going from `before` to `after`, or null.
// Fixed steps up to 1000, then every 1000.
export function milestoneCrossed(before, after) {
  const list = [...KC_MILESTONES];
  for (let m = 2000; m <= after; m += 1000) list.push(m);
  const hit = list.filter((m) => before < m && after >= m);
  return hit.length ? hit.at(-1) : null;
}

// Highest multiple of `step` passed, or null.
export function multipleCrossed(before, after, step) {
  const m = Math.floor(after / step) * step;
  return m > before && m > 0 ? m : null;
}

// Events between two hiscores snapshots.
export function eventsFromSnapshots(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  for (const s of next.skills) {
    const b = prev.skills.find((x) => x.name === s.name);
    if (s.name === 'Overall' || !b || s.level <= b.level) continue;
    out.push({
      type: 'level',
      title: s.level === 99 ? `99 ${s.name}` : `${s.name} level ${s.level}`,
      detail: s.level - b.level > 1 ? `Up from ${b.level}` : '',
    });
  }
  for (const a of next.activities) {
    const group = activityGroup(a.name);
    if (group === 'other' && a.name !== 'Collections Logged') continue;
    const b = prev.activities.find((x) => x.name === a.name);
    if (a.name === 'Collections Logged') {
      const m = b ? multipleCrossed(b.score, a.score, 100) : null;
      if (m) out.push({ type: 'collection', title: `${m} collection log slots`, detail: '' });
      continue;
    }
    const unit = group === 'clues' ? 'completed' : 'kills';
    if (!b) {
      out.push({ type: 'kc', title: `Now ranked: ${a.name}`, detail: `${a.score} ${unit}` });
      continue;
    }
    const m = milestoneCrossed(b.score, a.score);
    if (m) out.push({ type: 'kc', title: `${a.name}: ${m} ${unit}`, detail: '' });
  }
  return out;
}

// Events between two WikiSync results. The first sync has nothing to compare, so adds nothing.
export function eventsFromSync(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  const before = Object.fromEntries((prev.quests || []).map((q) => [q.name, q.state]));
  for (const q of next.quests || []) {
    if (q.state === 'complete' && before[q.name] !== undefined && before[q.name] !== 'complete') {
      out.push({ type: 'quest', title: `Quest complete: ${q.name}`, detail: '' });
    }
  }
  for (const [region, tiers] of Object.entries(next.diaries || {})) {
    for (const [tier, done] of Object.entries(tiers)) {
      if (done && !prev.diaries?.[region]?.[tier]) out.push({ type: 'diary', title: `${region} ${tier} diary complete`, detail: '' });
    }
  }
  return out;
}

export function createEvents(db) {
  const insert = db.prepare('INSERT INTO events (player, at, type, title, detail, ref) VALUES (?, ?, ?, ?, ?, ?)');
  return {
    add(player, at, e) {
      insert.run(player, at, e.type, e.title, e.detail || '', e.ref || null);
    },
    removeRef(ref) {
      db.prepare('DELETE FROM events WHERE ref = ?').run(ref);
    },
    list(player, { type, limit = 100, before } = {}) {
      const where = ['player = ?'];
      const args = [player];
      if (type) { where.push('type = ?'); args.push(type); }
      if (before) { where.push('at < ?'); args.push(before); }
      return db.prepare(`SELECT id, at, type, title, detail FROM events WHERE ${where.join(' AND ')} ORDER BY at DESC, id ASC LIMIT ?`)
        .all(...args, Math.min(limit, 500));
    },
    // One-off: build level and kill count history from snapshots taken before the feed existed.
    backfill(player) {
      const rows = db.prepare('SELECT taken_at, data FROM snapshots WHERE player = ? ORDER BY taken_at').all(player);
      let prev = null;
      for (const row of rows) {
        const snap = JSON.parse(row.data);
        for (const e of eventsFromSnapshots(prev, snap)) insert.run(player, row.taken_at, e.type, e.title, e.detail || '', null);
        prev = snap;
      }
    },
  };
}
