-- Migration: 044_add_outreach_and_control_tables.sql

-- Outreach targets, pitches, PR requests (unchanged from prior plan)
CREATE TABLE IF NOT EXISTS outreach_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  site_name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('seo_backlinks_gap','manual','competitor_intersect','pr_platform')),
  category TEXT,
  domain_authority INTEGER,
  vetting_status TEXT NOT NULL DEFAULT 'unvetted' CHECK(vetting_status IN ('unvetted','approved','rejected_spam','rejected_irrelevant')),
  contact_name TEXT,
  contact_email TEXT,
  contact_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outreach_pitches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  assigned_to TEXT,
  pitch_subject TEXT,
  pitch_body TEXT,
  date_sent TEXT,
  follow_up_date TEXT,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK(status IN ('drafted','sent','followed_up','replied','accepted','declined','live','stale')),
  link_type TEXT CHECK(link_type IN ('dofollow','nofollow','sponsored', NULL)),
  live_url TEXT,
  is_paid_placement INTEGER NOT NULL DEFAULT 0,
  placement_cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (target_id) REFERENCES outreach_targets(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pr_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  request_summary TEXT NOT NULL,
  deadline TEXT,
  relevance_score INTEGER,
  draft_quote TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','used','missed','not_relevant')),
  outlet_name TEXT,
  live_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Approval gate: nothing runs (and spends tokens) without this
CREATE TABLE IF NOT EXISTS openclaw_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  action_type TEXT NOT NULL,           -- e.g. 'run_seo_agent', 'post_social', etc.
  action_payload TEXT NOT NULL,        -- JSON: { agentType, url, model, ... }
  requested_by TEXT NOT NULL,          -- staff user id
  requested_role TEXT NOT NULL,        -- 'admin' | 'staff'
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','auto_approved')),
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Per-agent cadence/staleness config
CREATE TABLE IF NOT EXISTS agent_run_config (
  audit_type TEXT PRIMARY KEY,
  stale_after_days INTEGER NOT NULL,   -- e.g. 30 for monthly, 7 for weekly, 9999 for "once"
  default_model TEXT NOT NULL DEFAULT 'claude', -- 'claude' | 'deepseek-v4-flash'
  notes TEXT
);

-- Token & cost usage log — one row per agent run
CREATE TABLE IF NOT EXISTS token_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  audit_id INTEGER,                    -- link back to seo_audits row, if applicable
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,                 -- 'claude-sonnet-4-6', 'deepseek-v4-flash', etc.
  triggered_by TEXT NOT NULL,          -- staff user id
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  external_api_cost_usd REAL NOT NULL DEFAULT 0, -- DataForSEO etc., logged separately from LLM cost
  duration_seconds INTEGER,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES seo_audits(id) ON DELETE SET NULL
);

-- Optional: monthly/weekly budget caps per client, to hard-stop overspend
CREATE TABLE IF NOT EXISTS token_budgets (
  client_id INTEGER PRIMARY KEY,
  monthly_budget_usd REAL NOT NULL DEFAULT 50,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80, -- warn at 80% of budget
  hard_stop INTEGER NOT NULL DEFAULT 0,             -- 1 = block new runs once budget hit
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outreach_targets_client ON outreach_targets(client_id);
CREATE INDEX IF NOT EXISTS idx_outreach_pitches_target ON outreach_pitches(target_id);
CREATE INDEX IF NOT EXISTS idx_outreach_pitches_client_status ON outreach_pitches(client_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_requests_client ON pr_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON openclaw_pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_token_usage_client ON token_usage_log(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage_log(agent_type, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_staff ON token_usage_log(triggered_by, created_at);
