-- Migration: 083_add_api_readonly_role.sql
-- Add the 'api_readonly' role for external read-only API agents. Access is
-- limited to GET /api/clients and GET /api/clients/:id (enforced in
-- src/middleware/auth.js). No login is created here; accounts are created
-- out-of-band so no credentials land in git.
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
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'ops_video_editor', 'ops_social_media_manager', 'cinematographer', 'api_readonly')),
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
