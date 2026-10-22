import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  taken_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_player_time ON snapshots (player, taken_at);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  skill TEXT NOT NULL,
  target_xp INTEGER NOT NULL,
  xp_per_action REAL,
  xp_per_hour REAL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wikisync (
  player TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quest_overrides (
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  PRIMARY KEY (player, name)
);
CREATE TABLE IF NOT EXISTS diary_overrides (
  player TEXT NOT NULL,
  region TEXT NOT NULL,
  tier TEXT NOT NULL,
  complete INTEGER NOT NULL,
  PRIMARY KEY (player, region, tier)
);
CREATE TABLE IF NOT EXISTS timers (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  label TEXT NOT NULL,
  preset TEXT,
  duration_ms INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quest_requirements (
  name TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ref TEXT
);
CREATE INDEX IF NOT EXISTS events_player_time ON events (player, at);
CREATE TABLE IF NOT EXISTS slayer_tasks (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  monster TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  master TEXT NOT NULL DEFAULT '',
  assigned_at INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT NOT NULL DEFAULT 'active',
  points INTEGER
);
CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  icon TEXT,
  qty INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  value_each INTEGER,
  note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clog_items (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  icon TEXT,
  source TEXT NOT NULL DEFAULT '',
  obtained_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  label TEXT NOT NULL,
  freq TEXT NOT NULL,
  last_done_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  icon TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  target INTEGER,
  low_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS boss_notes (
  player TEXT NOT NULL,
  boss TEXT NOT NULL,
  gear TEXT NOT NULL DEFAULT '',
  inventory TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player, boss)
);
CREATE TABLE IF NOT EXISTS watchlist (
  item_id INTEGER PRIMARY KEY,
  added_at INTEGER NOT NULL
);
`;

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
