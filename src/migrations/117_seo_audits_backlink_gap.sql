-- Migration: 117_seo_audits_backlink_gap.sql
--
-- 073 added the backlink_gap skill but never added it to the CHECK on
-- seo_audits.audit_type, so every gap report was rejected on arrival (run #124,
-- 2026-11-10, was the first to try). SQLite can't alter a CHECK, so the table
-- is rebuilt with the same columns, ids and indexes; the PRAGMA tells the
-- migration runner to switch foreign keys off so seo_recommendations and the
-- other children are not cascaded away when the old table is dropped.

PRAGMA foreign_keys = OFF;

CREATE TABLE seo_audits_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  audit_type TEXT NOT NULL CHECK(audit_type IN (
    'full','page','technical','content','content_brief','schema','sitemap','images',
    'geo','local','maps','hreflang','google','backlinks','cluster','sxo','drift',
    'ecommerce','flow','competitor_pages','plan','programmatic','dataforseo','image_gen',
    'backlink_gap'
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
  page_url TEXT,
  audit_score INTEGER,
  target_url TEXT,
  is_competitor INTEGER NOT NULL DEFAULT 0,
  competitor_domain TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

INSERT INTO seo_audits_new (
  id, client_id, audit_type, url, health_score, technical_score, content_score,
  on_page_score, schema_score, performance_score, geo_score, backlinks_score,
  local_score, sxo_score, summary, report_json, created_at, page_url,
  audit_score, target_url, is_competitor, competitor_domain
)
SELECT
  id, client_id, audit_type, url, health_score, technical_score, content_score,
  on_page_score, schema_score, performance_score, geo_score, backlinks_score,
  local_score, sxo_score, summary, report_json, created_at, page_url,
  audit_score, target_url, is_competitor, competitor_domain
FROM seo_audits;

DROP TABLE seo_audits;
ALTER TABLE seo_audits_new RENAME TO seo_audits;

CREATE INDEX idx_seo_audits_client ON seo_audits(client_id);
CREATE INDEX idx_seo_audits_type_page ON seo_audits(client_id, audit_type, page_url);
CREATE INDEX idx_seo_audits_competitor ON seo_audits(client_id, is_competitor);
