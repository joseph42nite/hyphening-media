-- Migration: 079_ad_groups.sql
--
-- Ad group performance, one row per ad group per month.
--
-- A separate table rather than more columns on marketing_ad_campaigns because
-- the relationship is one-to-many and the interesting number lives here. In
-- DentAlchemy's September, one campaign's ad groups split ₹34,854 to "Open
-- Dentist" against ₹5,905 to "Near Me/General Dentist" — a 6x difference
-- invisible at campaign level, and exactly the kind of thing a budget
-- recommendation should be made of.
--
-- Synced only. Nothing enters this table by hand: there is no form for it, and
-- a partially hand-filled ad group table would be worse than none, since it
-- would not sum to its campaign.

CREATE TABLE IF NOT EXISTS marketing_ad_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  -- The campaign row this belongs to. Nullable: an ad group can arrive in a
  -- sync whose campaign row was skipped because a manual row held that month,
  -- and losing the ad group detail as well would compound that.
  campaign_id INTEGER,
  external_campaign_id TEXT,
  external_adgroup_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  platform TEXT,
  month TEXT NOT NULL,
  spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  -- Platform-modelled, frequently fractional, and never a CRM lead.
  platform_conversions REAL,
  source_currency TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES marketing_ad_campaigns(id) ON DELETE SET NULL
);

-- The upsert target. Keyed on the platform's own id, not the name, so renaming
-- an ad group updates its row rather than creating a second one beside it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_groups_unique
  ON marketing_ad_groups(client_id, month, external_adgroup_id);

CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign
  ON marketing_ad_groups(campaign_id);
