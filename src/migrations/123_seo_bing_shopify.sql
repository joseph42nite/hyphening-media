-- Migration: 123_seo_bing_shopify.sql
--
-- Cards for two skills new in claude-seo 2.6.2.
--
-- bing: the site's link profile as Bing Webmaster Tools sees it. Microsoft
-- Copilot answers come from the Bing index. Monthly, like backlink_gap: link
-- data does not move week to week. Needs a Bing Webmaster API key and the site
-- verified under it; src/routes/seo.js gates on what the worker's probe
-- (scripts/lib/bing.mjs) reports, never on a guess.
--
-- shopify: a signed, uncapped crawl of a Shopify store. No Shopify client yet,
-- so it is shown but switched off in src/routes/seo.js, and 9999 keeps it out
-- of the night queue for good: a full-store crawl is a deliberate run.
--
-- seo-posthog is the third new skill. It gets no card until a client sends
-- pageviews to PostHog.
--
-- seo_audits.audit_type has a CHECK, so the table is rebuilt exactly as 117 did
-- for backlink_gap. Skipping that is how run #124's report was dropped.

INSERT OR IGNORE INTO agent_run_config (audit_type, stale_after_days, default_model, notes)
VALUES
  ('bing', 30, 'claude-sonnet-5-5',
   'Monthly. Link profile from Bing Webmaster Tools (Copilot draws on the Bing index). Needs BING_WEBMASTER_API_KEY and the site verified under it.'),
  ('shopify', 9999, 'claude-sonnet-5-5',
   'On demand only. Signed, uncapped Shopify store crawl. Switched off until a Shopify client is onboarded.');

PRAGMA foreign_keys = OFF;

CREATE TABLE seo_audits_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  audit_type TEXT NOT NULL CHECK(audit_type IN (
    'full','page','technical','content','content_brief','schema','sitemap','images',
    'geo','local','maps','hreflang','google','backlinks','cluster','sxo','drift',
    'ecommerce','flow','competitor_pages','plan','programmatic','dataforseo','image_gen',
    'backlink_gap','bing','shopify'
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
