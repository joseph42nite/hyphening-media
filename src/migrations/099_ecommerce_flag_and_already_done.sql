-- Migration: 099_ecommerce_flag_and_already_done.sql
--
-- 1. crm_clients.is_ecommerce: whether the client sells online. The SEO
--    Monitor's e-commerce skill card (product schema, Shopping, marketplaces)
--    is only available, and only run at night, for clients marked yes. Set in
--    the Clients tab's edit form.
--
-- 2. A fourth night sort, 'already_done': the site's code already does what the
--    recommendation asks (often because a fix was pushed earlier and nobody
--    marked it). The night worker closes these as completed with a note of what
--    it found, instead of leaving them open for ever. SQLite can't alter the
--    CHECK on fix_triage, so seo_recommendations is rebuilt again (same columns
--    and ids); the PRAGMA tells the migration runner to switch foreign keys off.
ALTER TABLE crm_clients ADD COLUMN is_ecommerce INTEGER NOT NULL DEFAULT 0;

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
  fix_triage TEXT CHECK (fix_triage IS NULL OR fix_triage IN ('safe', 'needs_007', 'not_code', 'already_done')),
  fix_reason TEXT,
  fix_approved INTEGER NOT NULL DEFAULT 0,
  fix_summary TEXT,
  fix_diff TEXT,
  fix_commit TEXT,
  fix_error TEXT,
  fix_batch_id INTEGER,
  fixed_at TEXT,
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (kanban_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

INSERT INTO seo_recommendations_new SELECT
  id, audit_id, client_id, priority, metric, issue, action_required, observation, dependency, failure_check,
  leading_indicator, status, kanban_task_id, created_at, page_url, fix_triage, fix_reason, fix_approved,
  fix_summary, fix_diff, fix_commit, fix_error, fix_batch_id, fixed_at
FROM seo_recommendations;

DROP TABLE seo_recommendations;
ALTER TABLE seo_recommendations_new RENAME TO seo_recommendations;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_seo_recs_audit ON seo_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client ON seo_recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client_status ON seo_recommendations(client_id, status);

-- Recommendations the first night (2026-11-03) sorted as "not_code" are
-- looked at again under the new rule: some were really already done.
UPDATE seo_recommendations SET fix_triage = NULL, fix_reason = NULL WHERE status = 'open' AND fix_triage = 'not_code';
