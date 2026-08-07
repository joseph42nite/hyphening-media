-- Migration: 062_competitor_audits.sql
-- Lets an audit run against a URL that is not the client's own site.
--
-- Every run so far has audited crm_clients.website_url, because every run was a
-- client deliverable. Competitor research needs the same skills pointed at
-- someone else's domain while staying attached to the client it informs — so
-- Janya's dashboard can show Oasis Fertility's technical score beside Janya's
-- own, rather than the comparison living in a file nobody opens.
--
-- Kept as columns on the existing tables rather than a parallel
-- competitor_audits table: the audit pipeline, the checker, the score
-- resolution and the report renderer all work identically whoever owns the URL.
-- A second table would mean maintaining two copies of all of it.

-- The URL this run actually audited. NULL means the client's own site, which
-- is what every existing run is — so no backfill is needed and the default
-- behaviour is unchanged.
ALTER TABLE seo_agent_runs ADD COLUMN target_url TEXT;

-- Set when the run is competitor research rather than a client deliverable.
-- Freshness, the due-audit badge and the client's own score cards all filter
-- these out: a competitor's technical score says nothing about whether the
-- client's own technical audit is stale.
ALTER TABLE seo_agent_runs ADD COLUMN is_competitor INTEGER NOT NULL DEFAULT 0;

-- Mirrored onto the audit so the dashboard can group and compare without
-- joining back to the run every time.
ALTER TABLE seo_audits ADD COLUMN target_url TEXT;
ALTER TABLE seo_audits ADD COLUMN is_competitor INTEGER NOT NULL DEFAULT 0;

-- Competitors tracked per client. Discovery proposes, a human approves before
-- anything is audited — auto-discovery alone would happily spend ten minutes
-- auditing a directory listing like JustDial simply because it outranks the
-- client for a head term.
CREATE TABLE IF NOT EXISTS client_competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id),
  domain TEXT NOT NULL,              -- 'oasisindia.in'
  url TEXT NOT NULL,                 -- full URL actually audited
  label TEXT,                        -- human name, e.g. 'Oasis Fertility'
  -- How this competitor got here: 'discovered' (proposed by search, not yet
  -- approved), 'approved' (a human confirmed it), 'rejected' (a human said no —
  -- kept so discovery stops re-proposing directories and aggregators).
  status TEXT NOT NULL DEFAULT 'discovered',
  -- The query it surfaced for, and where it ranked. Context for deciding
  -- whether it is a real competitor or an unrelated site that happens to rank.
  discovered_for_query TEXT,
  discovered_position INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(client_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_client_competitors_client ON client_competitors(client_id, status);
CREATE INDEX IF NOT EXISTS idx_seo_audits_competitor ON seo_audits(client_id, is_competitor);
