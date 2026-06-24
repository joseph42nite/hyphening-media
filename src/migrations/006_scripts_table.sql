-- Migration: 006_scripts_table.sql
-- Create marketing_scripts table
CREATE TABLE IF NOT EXISTS marketing_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- Format: YYYY-MM
  title TEXT NOT NULL,
  script_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Script Made' CHECK (status IN ('Script Made', 'Shot', 'Edited', 'Posted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Create relational table between marketing_content_tracker and marketing_scripts
CREATE TABLE IF NOT EXISTS marketing_content_script_relation (
  content_id INTEGER NOT NULL,
  script_id INTEGER NOT NULL,
  PRIMARY KEY (content_id, script_id),
  FOREIGN KEY(content_id) REFERENCES marketing_content_tracker(id) ON DELETE CASCADE,
  FOREIGN KEY(script_id) REFERENCES marketing_scripts(id) ON DELETE CASCADE
);
