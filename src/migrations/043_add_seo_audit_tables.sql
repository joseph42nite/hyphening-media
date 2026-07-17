-- Migration: 043_add_seo_audit_tables.sql

ALTER TABLE crm_clients ADD COLUMN website_url TEXT;
ALTER TABLE crm_clients ADD COLUMN instagram_url TEXT;
ALTER TABLE crm_clients ADD COLUMN youtube_url TEXT;

CREATE TABLE IF NOT EXISTS seo_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  audit_type TEXT NOT NULL CHECK(audit_type IN (
    'full','page','technical','content','content_brief','schema','sitemap','images',
    'geo','local','maps','hreflang','google','backlinks','cluster','sxo','drift',
    'ecommerce','flow','competitor_pages','plan','programmatic','dataforseo','image_gen'
  )),
  url TEXT NOT NULL,
  health_score INTEGER,
  technical_score INTEGER,
  content_score INTEGER,
  on_page_score INTEGER,
  schema_score INTEGER,
  performance_score INTEGER,
  geo_score INTEGER,
  backlinks_score INTEGER,
  local_score INTEGER,
  sxo_score INTEGER,
  summary TEXT,
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seo_recommendations (
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
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'ignored')),
  kanban_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (kanban_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_audits_client ON seo_audits(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_audits_type ON seo_audits(client_id, audit_type);
CREATE INDEX IF NOT EXISTS idx_seo_recs_audit ON seo_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_seo_recs_client ON seo_recommendations(client_id);
