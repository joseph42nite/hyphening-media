-- Migration: 109_ads_recs_site_fixes.sql
--
-- Ads findings join the night fix pipeline. The ones that are changes to the
-- client's website code (a landing page, a form, a tracking tag) are sorted and
-- fixed by the same night worker as SEO findings, on the same branch, and go
-- live with the same Deploy button: one queue per client, because both land in
-- the same repo and the same deploy.
--
-- `kind` says where a finding is acted on:
--   site_code   the client's website code — goes to the night fix worker
--   ad_account  inside the ad platform (keywords, bids, budgets, conversions)
--   business    the clinic or the team (lead follow-up, walk-ins, plan settings)
--   NULL        not sorted (findings from before this migration); the night
--               worker sorts these too, and calls the non-code ones not_code
--
-- The fix columns and statuses are the ones seo_recommendations has (098, 099).
-- SQLite can't alter a CHECK, so the table is rebuilt with the same ids.
PRAGMA foreign_keys = OFF;

CREATE TABLE ads_recommendations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Critical','High','Medium','Low')),
  platform TEXT,
  campaign_name TEXT,
  metric TEXT NOT NULL,
  issue TEXT NOT NULL,
  action_required TEXT NOT NULL,
  observation TEXT,
  failure_check TEXT,
  expected_impact TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'in_progress', 'completed', 'ignored', 'ready_to_deploy', 'needs_007', 'fix_failed')),
  kanban_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_by_audit_id INTEGER,
  kind TEXT CHECK (kind IS NULL OR kind IN ('site_code', 'ad_account', 'business')),
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
  FOREIGN KEY (audit_id) REFERENCES ads_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

INSERT INTO ads_recommendations_new (id, audit_id, client_id, priority, platform, campaign_name, metric, issue,
  action_required, observation, failure_check, expected_impact, status, kanban_task_id, created_at, superseded_by_audit_id)
SELECT id, audit_id, client_id, priority, platform, campaign_name, metric, issue,
  action_required, observation, failure_check, expected_impact, status, kanban_task_id, created_at, superseded_by_audit_id
FROM ads_recommendations;

DROP TABLE ads_recommendations;
ALTER TABLE ads_recommendations_new RENAME TO ads_recommendations;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_ads_recs_audit ON ads_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_ads_recs_open ON ads_recommendations(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_recs_batch ON ads_recommendations(fix_batch_id);
