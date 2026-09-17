-- Migration: 074_add_cinematographer_role.sql
-- Add the 'cinematographer' role (read-only access to client scripts) and a login for it.
--
-- SQLite can't alter a CHECK constraint, so the users table is rebuilt. The
-- PRAGMA below tells the migration runner to disable foreign keys around this
-- migration (it can't be toggled inside the transaction), so dropping the old
-- table doesn't cascade into sessions, chat, tasks, etc.
PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'ops_video_editor', 'ops_social_media_manager', 'cinematographer')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, password_hash, name, role, is_active, created_at, updated_at)
SELECT id, email, password_hash, name, role, is_active, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'cinematographer@hyphening.com',
  '$2a$12$uX49fXl6qHH.NZxlj1TIpu4J87R4B59D/geeD0G0NAaRFbHSyeQMm',
  'Cinematographer',
  'cinematographer'
);
