-- Migration: 098_seo_night.sql
-- Night SEO (master plan Phase 6): due skills run overnight, safe fixes are
-- committed on a branch per client, and 007 approves them with one Deploy
-- button in the SEO Monitor's "Last night" section.
--
-- seo_recommendations gains the fix lifecycle. SQLite can't alter a CHECK
-- constraint, so the table is rebuilt (same columns and ids, plus the new
-- ones); the PRAGMA tells the migration runner to switch foreign keys off
-- around it so dropping the old table doesn't cascade.
--
--   open → (night triage) → ready_to_deploy → completed (Deploy went live)
--                         → needs_007        (outside the safe list; 007 can press "Fix tonight")
--                         → fix_failed       (the fix broke the checks, or the deploy rolled back)
--   fix_triage 'not_code' leaves a recommendation open: it isn't a site change
--   (analytics, Search Console, strategy) and stays in the normal list.
PRAGMA foreign_keys = OFF;

CREATE TABLE seo_recommendations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
  metric TEXT NOT NULL,
  issue TEXT NOT NULL,
  action_required TEXT NOT NULL,
  observation TEXT,
  dependency TEXT,
  failure_check TEXT,
  leading_indicator TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'in_progress', 'completed', 'ignored', 'ready_to_deploy', 'needs_007', 'fix_failed')),
  kanban_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  page_url TEXT,
  -- The night worker's sort: 'safe' (it fixes it), 'needs_007', 'not_code'. NULL = not looked at yet.
  fix_triage TEXT CHECK (fix_triage IS NULL OR fix_triage IN ('safe', 'needs_007', 'not_code')),
  fix_reason TEXT,          -- why it was sorted that way, one line
  fix_approved INTEGER NOT NULL DEFAULT 0,  -- 007 pressed "Fix tonight" on a needs_007 item
  fix_summary TEXT,         -- what changed, before → after, in words
  fix_diff TEXT,            -- the commit's diff (trimmed), for the drawer
  fix_commit TEXT,
  fix_error TEXT,
  fix_batch_id INTEGER,
  fixed_at TEXT,
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (kanban_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

INSERT INTO seo_recommendations_new (id, audit_id, client_id, priority, metric, issue, action_required, observation,
  dependency, failure_check, leading_indicator, status, kanban_task_id, created_at, page_url)
SELECT id, audit_id, client_id, priority, metric, issue, action_required, observation,
  dependency, failure_check, leading_indicator, status, kanban_task_id, created_at, page_url
FROM seo_recommendations;

DROP TABLE seo_recommendations;
ALTER TABLE seo_recommendations_new RENAME TO seo_recommendations;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_seo_recs_audit ON seo_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client ON seo_recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client_status ON seo_recommendations(client_id, status);

-- One night's fixes for one client: the branch they sit on, then what 007 did
-- with it. Deploy and Discard act on a batch.
--   queued → running → ready | empty | failed
--   ready → deploy_queued → deploying → live | rolled_back | deploy_failed
--   ready → discarded
CREATE TABLE IF NOT EXISTS seo_fix_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  night TEXT NOT NULL,              -- IST date the night started, YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'ready', 'empty', 'failed',
    'deploy_queued', 'deploying', 'live', 'rolled_back', 'deploy_failed', 'discarded')),
  branch TEXT,
  base_commit TEXT,                 -- origin/<branch> the fixes were made on
  live_commit TEXT,                 -- what the Deploy pushed
  requested_by TEXT,
  deploy_requested_by TEXT,
  summary TEXT,                     -- one line for the row
  error TEXT,
  log TEXT,                         -- the deploy worker's step log
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  deploy_started_at TEXT,
  deploy_finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_fix_batches_client ON seo_fix_batches(client_id, id);
CREATE INDEX IF NOT EXISTS idx_seo_fix_batches_status ON seo_fix_batches(status);
