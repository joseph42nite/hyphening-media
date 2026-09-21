-- Migration: 078_ads_sync_tables.sql
--
-- Schema the Google Ads sync needs before it can write a single row. Added
-- ahead of the integration on purpose: every one of these guards a way the
-- sync could quietly destroy data that was typed in by hand, and adding them
-- afterwards means the first run is the one that finds out.

-- ---------------------------------------------------------------------------
-- Where a campaign row came from.
--
-- The single most important column here. Without it a sync that runs against a
-- month somebody already typed in has no way to tell its own rows from theirs,
-- and the obvious implementation — delete the month, re-insert from the API —
-- silently destroys hand-entered history. The sync may only ever touch rows it
-- created.
--
-- Existing rows are 'manual' because that is what they are: every campaign in
-- this table today was entered through the dashboard or seeded.
-- ---------------------------------------------------------------------------
ALTER TABLE marketing_ad_campaigns ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'google_ads', 'meta_ads'));

-- The platform's own id for the campaign, so a rename on the platform updates
-- the existing row instead of creating a second one beside it. Null for manual
-- rows, which have no such id.
ALTER TABLE marketing_ad_campaigns ADD COLUMN external_campaign_id TEXT;

-- When this row last came back from the platform, and in which currency the
-- platform reported it.
--
-- `cost_micros` is denominated in the ad account's own currency. Writing a USD
-- account's spend into total_ad_spend_inr understates it by roughly ninety
-- times, and nothing downstream could detect that — the number is simply small.
-- Recording what the platform said lets the sync refuse rather than guess.
ALTER TABLE marketing_ad_campaigns ADD COLUMN synced_at TEXT;
ALTER TABLE marketing_ad_campaigns ADD COLUMN source_currency TEXT;

-- Platform-reported conversions, kept apart from `leads`.
--
-- Google's conversion count is not a row in campaign_leads. Merging them would
-- destroy the capture-rate signal — the gap between what the platform counted
-- and what reached the CRM — which is the most useful thing the fact pack
-- currently surfaces.
ALTER TABLE marketing_ad_campaigns ADD COLUMN platform_conversions REAL;

-- ---------------------------------------------------------------------------
-- One row per campaign per month per client. The sync's upsert target.
--
-- Without this a retry, an overlapping date window, or two workers running at
-- once each append a second copy of the same month, and every total downstream
-- doubles. Verified against the existing table before adding: no duplicates.
--
-- COALESCE on month because rows predating that column derive it from
-- created_at, and NULLs do not collide in a unique index — two null-month rows
-- for the same campaign would both be allowed through.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_campaigns_unique
  ON marketing_ad_campaigns(
    client_id,
    COALESCE(month, strftime('%Y-%m', created_at)),
    platform,
    ad_campaign_name
  );

-- ---------------------------------------------------------------------------
-- Per-client sync state.
--
-- On the client rather than in a separate table: there is one ad account link
-- per client per platform, and the dashboard asks "when did this last sync, and
-- did it work?" in the same breath as it asks for the customer id.
-- ---------------------------------------------------------------------------
ALTER TABLE crm_clients ADD COLUMN ads_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN ads_last_synced_at TEXT;

-- The last failure, kept until a run succeeds. A sync that has been failing for
-- three weeks otherwise looks identical to one that has never been set up —
-- both show no recent data, and only one of them is an emergency.
ALTER TABLE crm_clients ADD COLUMN ads_last_sync_error TEXT;

-- ---------------------------------------------------------------------------
-- An append-only record of what each sync did.
--
-- Exists so "the numbers changed" is answerable. A synced figure that moves
-- between months is normal — platforms restate conversions for weeks after the
-- fact — but without a log there is no way to tell a restatement from a bug in
-- our own upsert, and the first time a client queries a number that is the only
-- question that matters.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ads_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  trigger_source TEXT NOT NULL DEFAULT 'scheduled',
  months_requested TEXT,          -- JSON array, e.g. ["2026-08","2026-09"]
  campaigns_seen INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  -- Rows the platform returned that were NOT written because a manual row of
  -- the same name already held that month. Surfaced rather than resolved: the
  -- fix is a human deciding which is right, and a sync that silently won would
  -- be the data loss this whole migration exists to prevent.
  rows_skipped_manual INTEGER DEFAULT 0,
  currency TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ads_sync_runs_client
  ON ads_sync_runs(client_id, started_at DESC);

-- One sync per client per platform at a time. Same partial-unique-index trick
-- the agent runs use, and for the same reason: two concurrent syncs of the same
-- account would race each other's upserts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_sync_runs_inflight
  ON ads_sync_runs(client_id, platform) WHERE status = 'running';
