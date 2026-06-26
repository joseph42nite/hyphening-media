-- Migration: 020_simplify_task_statuses.sql
-- Disable foreign key constraints during table recreate
PRAGMA foreign_keys = OFF;

-- 1. Recreate kanban_tasks
ALTER TABLE kanban_tasks RENAME TO kanban_tasks_old;

CREATE TABLE kanban_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN (
    'backlog', 'todo', 'in_progress', 'delivered'
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

-- Copy data from old table to new table, mapping statuses.
-- We delete 'cancelled' tasks as per user instruction.
INSERT INTO kanban_tasks (
  id, client_id, title, description, status, priority, task_type, assigned_to,
  due_date, completed_at, revision_count, max_revisions, drive_link, created_by, created_at, updated_at
)
SELECT 
  id, client_id, title, description, 
  CASE 
    WHEN status IN ('review', 'revision', 'approved') THEN 'in_progress'
    ELSE status
  END, 
  priority, task_type, assigned_to,
  due_date, completed_at, revision_count, max_revisions, drive_link, created_by, created_at, updated_at
FROM kanban_tasks_old
WHERE status != 'cancelled';

DROP TABLE kanban_tasks_old;

-- 2. Recreate marketing_content_tracker to fix the foreign key reference pointing to kanban_tasks(id)
ALTER TABLE marketing_content_tracker RENAME TO marketing_content_tracker_old;

CREATE TABLE marketing_content_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT CHECK (platform IN ('instagram', 'youtube')),
  media_id TEXT,
  date TEXT,
  post_type TEXT CHECK (post_type IN ('Story', 'Static', 'Carousel', 'Reel', 'Youtube', 'Short')),
  title TEXT,
  script TEXT,
  status TEXT DEFAULT 'Draft' CHECK (status IN (
    'Draft', 'Pending Client Approval', 'Client Approved', 'Client Rejected', 'Posted', 'Pending'
  )),
  client_comments TEXT,
  client_approved INTEGER DEFAULT 0,
  is_tracked INTEGER DEFAULT 1,
  metric_override TEXT, -- JSON: {"views": true, "likes": true}
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'api_discovered', 'migration')),
  
  -- Metrics
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  avg_watch_time_pct REAL,
  
  -- Auto-computed (set by backend)
  skip_rate_pct REAL,
  engagement_rate_pct REAL,
  save_rate_pct REAL,
  content_score REAL,
  
  boosted TEXT DEFAULT 'No',
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  link TEXT,
  time TEXT,
  caption TEXT,
  follows INTEGER DEFAULT 0,
  youtube_views INTEGER DEFAULT 0,
  youtube_watch_time REAL DEFAULT 0.0,
  youtube_avg_view_duration TEXT,
  youtube_ctr REAL DEFAULT 0.0,
  kanban_task_id INTEGER REFERENCES kanban_tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

INSERT INTO marketing_content_tracker (
  id, client_id, platform, media_id, date, post_type, title, script, status,
  client_comments, client_approved, is_tracked, metric_override, source,
  views, likes, comments, shares, saves, avg_watch_time_pct, skip_rate_pct,
  engagement_rate_pct, save_rate_pct, content_score, boosted, created_at, updated_at,
  link, time, caption, follows, youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr, kanban_task_id
)
SELECT 
  id, client_id, platform, media_id, date, post_type, title, script, status,
  client_comments, client_approved, is_tracked, metric_override, source,
  views, likes, comments, shares, saves, avg_watch_time_pct, skip_rate_pct,
  engagement_rate_pct, save_rate_pct, content_score, boosted, created_at, updated_at,
  link, time, caption, follows, youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr, kanban_task_id
FROM marketing_content_tracker_old;

DROP TABLE marketing_content_tracker_old;

-- Recreate indices
CREATE INDEX IF NOT EXISTS idx_tasks_status ON kanban_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON kanban_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON kanban_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON kanban_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_content_client ON marketing_content_tracker(client_id);
CREATE INDEX IF NOT EXISTS idx_content_platform ON marketing_content_tracker(platform);
CREATE INDEX IF NOT EXISTS idx_content_tracked ON marketing_content_tracker(is_tracked);
CREATE INDEX IF NOT EXISTS idx_content_kanban_task_id ON marketing_content_tracker(kanban_task_id);
CREATE INDEX IF NOT EXISTS idx_content_client_date ON marketing_content_tracker(client_id, date DESC);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
