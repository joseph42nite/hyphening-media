-- Migration 126: the marketing system's base layer and cold outbound.
--
-- client_group       which cards fit a client (healthcare clients never get
--                    cold outbound: NMC/Dental Council rules on soliciting).
-- outbound_enabled   the Outbound monitor for this client, the same kind of
--                    switch as blog/seo/ads (PATCH /api/clients/:id/flags).
--                    cro_enabled and lifecycle_enabled are for the Conversion
--                    and Lifecycle monitors; nothing reads them yet.
-- client_brain       one versioned marketing profile per client, read by every
--                    marketing-skills run as .agents/product-marketing.md.
-- outbound_*         per-client sending setup, do-not-contact list, prospects
--                    with their drafted sequence, and what happened to them.
-- growth_*           the card / run / recommendation framework the new
--                    monitors share, instead of a copy per monitor.
--
-- Nothing here sends email. Approved prospects are exported to the client's
-- sending tool; replies, bounces, unsubscribes and bookings come back on
-- POST /api/outbound/events (src/routes/outbound.js).

ALTER TABLE crm_clients ADD COLUMN client_group TEXT
  CHECK (client_group IN ('healthcare', 'b2b_saas', 'b2b_services', 'consumer_local', 'ecommerce'));
ALTER TABLE crm_clients ADD COLUMN outbound_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN cro_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN lifecycle_enabled INTEGER NOT NULL DEFAULT 0;

-- The marketing clients live on 2026-11-26, by name so a database without them is untouched.
UPDATE crm_clients SET client_group = 'healthcare'   WHERE client_group IS NULL AND client_type = 'marketing' AND (name LIKE 'Dr. Divya%' OR name LIKE 'DentAlchemy%');
UPDATE crm_clients SET client_group = 'b2b_saas'     WHERE client_group IS NULL AND client_type = 'marketing' AND name LIKE 'F16s%';
UPDATE crm_clients SET client_group = 'b2b_services' WHERE client_group IS NULL AND client_type = 'marketing' AND (name LIKE 'Hyphening Media%' OR name LIKE 'Muse-ing%');

CREATE TABLE IF NOT EXISTS client_brain (
  client_id INTEGER PRIMARY KEY REFERENCES crm_clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  sections TEXT NOT NULL DEFAULT '{}',   -- JSON { product_overview: "...", ... } (src/services/clientBrain.js BRAIN_SECTIONS)
  claims TEXT NOT NULL DEFAULT '[]',     -- JSON [{ claim, source }]: the only claims copy may make
  learnings TEXT NOT NULL DEFAULT '[]',  -- JSON [{ date, learning, evidence, applies_to, status }]
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every saved version, so a bad edit or a bad AI proposal can be undone.
CREATE TABLE IF NOT EXISTS client_brain_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  sections TEXT NOT NULL,
  claims TEXT NOT NULL,
  learnings TEXT NOT NULL,
  changed_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_brain_versions ON client_brain_versions(client_id, version);

CREATE TABLE IF NOT EXISTS outbound_settings (
  client_id INTEGER PRIMARY KEY REFERENCES crm_clients(id) ON DELETE CASCADE,
  sender_name TEXT,
  sender_title TEXT,
  sending_domains TEXT NOT NULL DEFAULT '[]',     -- JSON ["getf16s.com"]: never the main website domain
  mailbox_provider TEXT CHECK (mailbox_provider IN ('titan', 'google', 'microsoft', 'zoho', 'other')),
  mailboxes_count INTEGER,
  daily_cap_per_mailbox INTEGER NOT NULL DEFAULT 25,
  sending_tool TEXT NOT NULL DEFAULT 'manual' CHECK (sending_tool IN ('manual', 'instantly', 'smartlead', 'other')),
  target_countries TEXT NOT NULL DEFAULT '[]',
  excluded_countries TEXT NOT NULL DEFAULT '["Germany","Austria","Italy"]',
  offer TEXT,                                     -- what we give or ask for in email 1
  booking_method TEXT CHECK (booking_method IN ('own_tool', 'booking_link', 'reply_only')),
  booking_url TEXT,
  reply_owner_name TEXT,
  reply_owner_email TEXT,
  postal_address TEXT,                            -- printed in every email's footer
  opt_out_text TEXT,
  data_sources TEXT NOT NULL DEFAULT '[]',        -- JSON ["directories", "dataforseo", "apollo", "manual"]
  lead_source_notes TEXT,                         -- directories, associations, events to mine
  weekly_new_prospects INTEGER NOT NULL DEFAULT 30,
  events_key TEXT,                                -- shared secret the sending/booking tools send as x-outbound-key
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Never contact: existing customers, unsubscribes, bounces, anyone asked off.
CREATE TABLE IF NOT EXISTS outbound_suppression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  value TEXT NOT NULL,                            -- lower-case email or domain
  kind TEXT NOT NULL CHECK (kind IN ('email', 'domain')),
  reason TEXT NOT NULL DEFAULT 'do_not_contact'
    CHECK (reason IN ('customer', 'unsubscribed', 'bounced', 'complaint', 'competitor', 'do_not_contact')),
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, value)
);

CREATE TABLE IF NOT EXISTS outbound_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'to_approve' CHECK (status IN (
    'to_approve', 'rejected', 'approved', 'in_sequence', 'replied', 'positive',
    'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost', 'bounced', 'unsubscribed')),
  company TEXT NOT NULL,
  domain TEXT,
  country TEXT,
  industry TEXT,
  size_band TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT,
  email_status TEXT NOT NULL DEFAULT 'unverified' CHECK (email_status IN ('unverified', 'valid', 'risky', 'invalid')),
  linkedin_url TEXT,
  signal TEXT,                                    -- why now
  why_prospect TEXT,                              -- why them, one line
  source_urls TEXT NOT NULL DEFAULT '[]',
  score TEXT CHECK (score IN ('hot', 'warm', 'cold')),
  tier INTEGER CHECK (tier IN (1, 2, 3)),
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  sequence TEXT NOT NULL DEFAULT '[]',            -- JSON [{ step, day, subject, body }]
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  last_event_at TEXT,
  reply_note TEXT,
  run_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, contact_email)
);
CREATE INDEX IF NOT EXISTS idx_outbound_leads_status ON outbound_leads(client_id, status);
CREATE INDEX IF NOT EXISTS idx_outbound_leads_domain ON outbound_leads(client_id, domain);

CREATE TABLE IF NOT EXISTS outbound_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES outbound_leads(id) ON DELETE SET NULL,
  email TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'sent', 'reply', 'positive_reply', 'bounce', 'unsubscribe', 'complaint',
    'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost', 'note')),
  detail TEXT,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('sending_tool', 'booking', 'staff', 'worker')),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outbound_events_client ON outbound_events(client_id, id);
CREATE INDEX IF NOT EXISTS idx_outbound_events_lead ON outbound_events(lead_id);

-- The shared monitor framework. Cards are seeded in src/services/growthCards.js
-- (code, so a card and the code that checks its inputs never drift apart);
-- this table only holds per-card overrides 007 may change.
CREATE TABLE IF NOT EXISTS growth_card_config (
  card_key TEXT PRIMARY KEY,
  stale_after_days INTEGER,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS growth_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  card_key TEXT NOT NULL,
  monitor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  requested_by TEXT,
  model TEXT,
  summary TEXT,
  result TEXT,          -- JSON from the worker, kept as sent
  applied_at TEXT,      -- brain proposals: when someone applied it
  applied_by TEXT,
  error TEXT,
  log TEXT,
  cost_usd REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_growth_runs_client ON growth_runs(client_id, card_key, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_runs_live ON growth_runs(client_id, card_key) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS growth_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES growth_runs(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  monitor TEXT NOT NULL,
  card_key TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_recs_client ON growth_recommendations(client_id, status);
