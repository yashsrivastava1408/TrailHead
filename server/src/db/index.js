import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  github_username TEXT NOT NULL,
  resume_text     TEXT NOT NULL DEFAULT '',
  free_hours      INTEGER NOT NULL DEFAULT 2,
  dislikes_dsa    INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'analyzed',
  profile         TEXT,
  analysis        TEXT,
  decision        TEXT,
  chosen_path     TEXT,
  plan_started_at INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trials (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  path_id    TEXT NOT NULL,
  answer     TEXT NOT NULL,
  score      INTEGER NOT NULL,
  enjoyment  INTEGER NOT NULL,
  feedback   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, path_id)
);

CREATE TABLE IF NOT EXISTS plan_days (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  day        INTEGER NOT NULL,
  title      TEXT NOT NULL,
  task       TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  skill      TEXT NOT NULL DEFAULT '',
  done       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, seq)
);
`;

/** Opens (and creates, if needed) the SQLite database. Use ':memory:' in tests. */
export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
