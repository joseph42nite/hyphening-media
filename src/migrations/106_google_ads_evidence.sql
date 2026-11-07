-- Migration: 106_google_ads_evidence.sql
--
-- Account evidence the Google Ads sync now pulls beyond campaign totals, so the
-- ads fleet can check what claude-ads' Google audit checks instead of returning
-- "unknown": conversion setup, search terms, keywords, negatives, impression
-- share, and GA4 sessions. All synced only — nothing enters these by hand — and
-- replaced for the months a sync covers (src/services/adsSyncWorker.js).

-- Google's own count of lead conversions (lead-form, call and contact
-- categories it counts). This is what the platform reports as leads; `leads`
-- stays 0 on synced rows, as before, so the CRM count is never overwritten.
ALTER TABLE marketing_ad_campaigns ADD COLUMN platform_lead_conversions REAL;
ALTER TABLE marketing_ad_campaigns ADD COLUMN search_impression_share_pct REAL;
ALTER TABLE marketing_ad_campaigns ADD COLUMN search_lost_to_budget_pct REAL;
ALTER TABLE marketing_ad_campaigns ADD COLUMN search_lost_to_rank_pct REAL;
ALTER TABLE marketing_ad_campaigns ADD COLUMN bidding_strategy TEXT;
ALTER TABLE marketing_ad_campaigns ADD COLUMN daily_budget REAL;

CREATE TABLE IF NOT EXISTS ads_conversion_actions (
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL DEFAULT 'Google',
  action_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  type TEXT,
  category TEXT,
  primary_for_goal INTEGER,
  counting_type TEXT,
  in_conversions INTEGER,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, platform, action_id),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads_conversion_months (
  client_id INTEGER NOT NULL,
  external_campaign_id TEXT NOT NULL,
  month TEXT NOT NULL,
  action_name TEXT NOT NULL,
  category TEXT,
  conversions REAL,
  all_conversions REAL,
  PRIMARY KEY (client_id, external_campaign_id, month, action_name),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads_search_terms (
  client_id INTEGER NOT NULL,
  external_campaign_id TEXT NOT NULL,
  month TEXT NOT NULL,
  term TEXT NOT NULL,
  status TEXT,
  impressions INTEGER,
  clicks INTEGER,
  spend REAL,
  conversions REAL,
  PRIMARY KEY (client_id, external_campaign_id, month, term),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads_keywords (
  client_id INTEGER NOT NULL,
  external_campaign_id TEXT NOT NULL,
  month TEXT NOT NULL,
  text TEXT NOT NULL,
  match_type TEXT NOT NULL,
  status TEXT,
  quality_score INTEGER,
  impressions INTEGER,
  clicks INTEGER,
  spend REAL,
  conversions REAL,
  PRIMARY KEY (client_id, external_campaign_id, month, text, match_type),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads_negative_keywords (
  client_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  text TEXT NOT NULL,
  match_type TEXT NOT NULL,
  PRIMARY KEY (client_id, level, external_campaign_id, text, match_type),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ga4_session_months (
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  host TEXT NOT NULL,
  channel TEXT NOT NULL,
  sessions INTEGER,
  engaged_sessions INTEGER,
  key_events REAL,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, month, host, channel),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

ALTER TABLE crm_clients ADD COLUMN ads_last_evidence_error TEXT;
