-- Migration 125: track coreyhaines31/marketingskills next to claude-seo,
-- claude-blog and claude-ads.
--
-- It powers the planned Client Brain and the Outbound, Conversion and
-- Lifecycle monitors. It is tracked before it is installed: the Mac reports
-- the latest release hourly, and Q's Monday review safety-checks it, so the
-- first install is of a release someone has read. Until then the SEO
-- Monitor's plugin line shows it as not installed.
--
-- plugin_status.plugin has a CHECK, so the table is rebuilt the way 123 did
-- for seo_audits. plugin_updates references it by name and is untouched.

PRAGMA foreign_keys = OFF;

CREATE TABLE plugin_status_new (
  plugin TEXT PRIMARY KEY CHECK (plugin IN ('claude-seo', 'claude-blog', 'claude-ads', 'marketing-skills')),
  repo TEXT NOT NULL,                   -- AgriciDaniel/claude-seo
  installed_version TEXT,
  installed_sha TEXT,
  latest_version TEXT,
  latest_sha TEXT,
  latest_published_at TEXT,
  status_reported_at TEXT,              -- last time the Mac reported installed/latest
  -- Q's weekly review of the latest release.
  reviewed_version TEXT,
  reviewed_sha TEXT,
  review_verdict TEXT CHECK (review_verdict IN ('safe', 'test_first', 'wait', 'breaks')),
  review_summary TEXT,
  review_impact TEXT,
  new_skills TEXT,                      -- JSON array of skill names new in the reviewed release
  reviewed_by TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO plugin_status_new SELECT
  plugin, repo, installed_version, installed_sha, latest_version, latest_sha, latest_published_at,
  status_reported_at, reviewed_version, reviewed_sha, review_verdict, review_summary, review_impact,
  new_skills, reviewed_by, reviewed_at, updated_at
FROM plugin_status;

DROP TABLE plugin_status;
ALTER TABLE plugin_status_new RENAME TO plugin_status;

INSERT OR IGNORE INTO plugin_status (plugin, repo) VALUES ('marketing-skills', 'coreyhaines31/marketingskills');

PRAGMA foreign_keys = ON;
