-- Migration: 008_remove_script_status_and_add_task_link.sql
PRAGMA foreign_keys = OFF;

-- 1. Add kanban_task_id to marketing_content_tracker
-- Catch error if duplicate column (handled dynamically by SQLite or by recreating)
ALTER TABLE marketing_content_tracker ADD COLUMN kanban_task_id INTEGER REFERENCES kanban_tasks(id) ON DELETE SET NULL;

-- 2. Remove status from marketing_scripts
ALTER TABLE marketing_scripts RENAME TO marketing_scripts_old;

CREATE TABLE marketing_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- Format: YYYY-MM
  title TEXT NOT NULL,
  script_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

INSERT INTO marketing_scripts (id, client_id, month, title, script_text, created_at, updated_at)
SELECT id, client_id, month, title, script_text, created_at, updated_at
FROM marketing_scripts_old;

DROP TABLE marketing_scripts_old;

-- 3. Recreate marketing_content_script_relation to point to new marketing_scripts table
DROP TABLE IF EXISTS marketing_content_script_relation;

CREATE TABLE marketing_content_script_relation (
  content_id INTEGER NOT NULL,
  script_id INTEGER NOT NULL,
  PRIMARY KEY (content_id, script_id),
  FOREIGN KEY(content_id) REFERENCES marketing_content_tracker(id) ON DELETE CASCADE,
  FOREIGN KEY(script_id) REFERENCES marketing_scripts(id) ON DELETE CASCADE
);

PRAGMA foreign_keys = ON;
