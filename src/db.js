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
