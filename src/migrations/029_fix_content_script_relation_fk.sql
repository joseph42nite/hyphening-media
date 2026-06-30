-- Migration: 029_fix_content_script_relation_fk.sql
-- Disable foreign key constraints during table recreate
PRAGMA foreign_keys = OFF;

-- Recreate marketing_content_script_relation to point to the correct marketing_content_tracker table
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

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
