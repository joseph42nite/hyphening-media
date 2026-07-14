-- Migration: 039_add_status_to_marketing_scripts.sql
PRAGMA foreign_keys = OFF;

-- 1. Rename and recreate marketing_scripts to add status and client_comments columns
ALTER TABLE marketing_scripts RENAME TO marketing_scripts_old;

CREATE TABLE marketing_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- Format: YYYY-MM
  title TEXT NOT NULL,
  script_text TEXT NOT NULL,
  reference_video_link TEXT,
  reaction_video_link TEXT,
  format TEXT DEFAULT 'reel',
  status TEXT DEFAULT 'Pending Client Approval' CHECK (status IN (
    'Draft', 'Pending Client Approval', 'Client Approved', 'Client Rejected', 'Posted', 'Pending'
  )),
  client_comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

INSERT INTO marketing_scripts (
  id, client_id, month, title, script_text, reference_video_link, reaction_video_link, format, status, client_comments, created_at, updated_at
)
SELECT 
  s.id, s.client_id, s.month, s.title, s.script_text, s.reference_video_link, s.reaction_video_link, s.format,
  COALESCE(t.status, 'Pending Client Approval') AS status,
  t.client_comments AS client_comments,
  s.created_at, s.updated_at
FROM marketing_scripts_old s
LEFT JOIN marketing_content_script_relation r ON s.id = r.script_id
LEFT JOIN marketing_content_tracker t ON r.content_id = t.id;

DROP TABLE marketing_scripts_old;

-- 2. Recreate marketing_content_script_relation to point to the new marketing_scripts table
ALTER TABLE marketing_content_script_relation RENAME TO marketing_content_script_relation_old;

CREATE TABLE marketing_content_script_relation (
  content_id INTEGER NOT NULL,
  script_id INTEGER NOT NULL,
  PRIMARY KEY (content_id, script_id),
  FOREIGN KEY(content_id) REFERENCES marketing_content_tracker(id) ON DELETE CASCADE,
  FOREIGN KEY(script_id) REFERENCES marketing_scripts(id) ON DELETE CASCADE
);

INSERT INTO marketing_content_script_relation (content_id, script_id)
SELECT content_id, script_id FROM marketing_content_script_relation_old;

DROP TABLE marketing_content_script_relation_old;

PRAGMA foreign_keys = ON;
