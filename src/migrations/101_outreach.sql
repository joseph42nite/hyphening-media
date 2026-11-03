-- Migration: 101_outreach.sql
-- Backlink outreach, inside the SEO Monitor (vault: Companies/Hyphening/SOPs/Backlink outreach.md).
--
--   weekly    Boothroyd's routine queues an outreach run per SEO-on client
--   Mac       outreach_worker: DataForSEO data → candidate pages → Claude checks
--             each one and drafts the email → prospects land here as 'to_approve'
--   007       approves (assigning a staff member) or rejects, editing the email first
--   staff     Copy / Open in Gmail, send it themselves, press Mark sent
--   +5 days   no reply → the next run drafts a follow-up → 007 approves it again
--   done      replied / won (link live, checked weekly) / lost
--
-- outreach_targets (044) never had a route or a row; it is replaced.
DROP TABLE IF EXISTS outreach_targets;

CREATE TABLE outreach_prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  -- broken_link: a page linking to a competitor's dead page; we offer ours instead.
  -- competitor_gap: a site linking to 2+ competitors but not to us.
  -- mention: a page naming the client without linking.
  kind TEXT NOT NULL CHECK (kind IN ('broken_link', 'competitor_gap', 'mention')),
  status TEXT NOT NULL DEFAULT 'to_approve' CHECK (status IN (
    'to_approve', 'rejected', 'to_send', 'sent', 'follow_up_to_approve', 'follow_up_to_send',
    'replied', 'won', 'lost')),
  site_domain TEXT NOT NULL,
  page_url TEXT NOT NULL,          -- the page we want the link on
  page_title TEXT,
  dead_url TEXT,                   -- broken_link: the competitor's dead page it links to
  competitor_domain TEXT,
  domain_rank INTEGER,             -- DataForSEO rank of the linking site, for sorting
  our_url TEXT,                    -- the client page we offer (or NULL with blog_topic_id)
  blog_topic_id INTEGER,           -- no matching page yet: a planned blog topic was added
  reason TEXT,                     -- why it's worth asking, one line
  contact_name TEXT,
  contact_email TEXT,
  contact_url TEXT,                -- where the contact was found (contact page)
  email_subject TEXT,
  email_body TEXT,
  email_cc TEXT,                   -- internal staff, comma-separated
  assigned_to INTEGER REFERENCES users(id),
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  reply_note TEXT,
  live_url TEXT,                   -- won: the page that now links to us
  link_verified_at TEXT,
  run_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, kind, page_url)
);
CREATE INDEX idx_outreach_prospects_status ON outreach_prospects(status, client_id);
CREATE INDEX idx_outreach_prospects_assignee ON outreach_prospects(assigned_to, status);

-- One weekly run per client on the Mac. The outcome tells 007 at a glance
-- whether DataForSEO worked: 'dataforseo' failures mean set it up or top it up.
CREATE TABLE outreach_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  -- On failure: 'dataforseo_missing' (no login on the Mac), 'dataforseo_auth'
  -- (login rejected), 'dataforseo_funds' (balance or payment), 'other'.
  failure_kind TEXT,
  error TEXT,
  stats TEXT,                      -- JSON: candidates checked, prospects added, competitors suggested, cost
  cost_usd REAL,
  requested_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_outreach_runs_client ON outreach_runs(client_id, id);

-- Small settings store; first key: outreach_cc (internal staff emails CC'd on outreach).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
