-- Migration: 007_update_task_type_constraint.sql
-- Disable foreign key constraints during table recreate
PRAGMA foreign_keys = OFF;

-- Rename existing table
ALTER TABLE kanban_tasks RENAME TO kanban_tasks_old;

-- Create new table with updated check constraint containing 'script', and assigned_to referencing users
CREATE TABLE kanban_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN (
    'backlog', 'todo', 'in_progress', 'review', 'revision', 'approved', 'delivered', 'cancelled'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  task_type TEXT DEFAULT 'video' CHECK (task_type IN ('video', 'script', 'graphic', 'social', 'other')),
  assigned_to INTEGER,
  due_date TEXT,
  completed_at TEXT,
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 3,
  drive_link TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Copy data from old table to new table
INSERT INTO kanban_tasks (
  id, client_id, title, description, status, priority, task_type, assigned_to,
  due_date, completed_at, revision_count, max_revisions, drive_link, created_by, created_at, updated_at
)
SELECT 
  id, client_id, title, description, status, priority, task_type, assigned_to,
  due_date, completed_at, revision_count, max_revisions, drive_link, created_by, created_at, updated_at
FROM kanban_tasks_old;

-- Drop old table
DROP TABLE kanban_tasks_old;

-- Recreate indices
CREATE INDEX IF NOT EXISTS idx_tasks_status ON kanban_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON kanban_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON kanban_tasks(assigned_to);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
