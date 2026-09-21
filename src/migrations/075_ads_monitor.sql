-- Migration: 075_ads_monitor.sql
-- Ads Monitor: the paid-media counterpart to the SEO agent fleet.
--
-- Deliberately a parallel set of tables rather than extra audit_types on
-- seo_audits. The two fleets answer different questions from different data
-- (seo_audits is keyed on a URL; an ads audit is keyed on a client-month), and
-- a shared CHECK list would have had to grow every time either side added a
-- skill. The lifecycle machinery is the same shape on purpose — the SEO
-- monitor's dedupe index, timeout recovery and SSE contract are the parts that
-- were expensive to get right, so they are reproduced, not reinvented.

-- ---------------------------------------------------------------------------
-- What each ads agent is, how often it goes stale, and which model serves it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ads_agent_config (
  agent_type TEXT PRIMARY KEY,
  label TEXT NOT NULL,             -- card title in the dashboard
  description TEXT NOT NULL,       -- what this agent actually answers
  stale_after_days INTEGER NOT NULL,
  default_model TEXT NOT NULL DEFAULT 'openrouter/deepseek/deepseek-v4-flash',
  -- The fact-pack sections this agent needs. Checked against what
  -- adsFacts.js could actually build for the client BEFORE a run is queued:
  -- an agent whose data is missing is blocked with a reason rather than
  -- handed an empty pack. Without this an ads skill does what the SEO skills
  -- did on a missing data source — writes a plausible audit from training
  -- knowledge, which is how a fabricated "cut Meta spend 40%" reaches a client.
  requires TEXT NOT NULL,          -- JSON array of fact-pack section keys
  sort_order INTEGER NOT NULL DEFAULT 100,
  agent_id TEXT
);

-- ---------------------------------------------------------------------------
-- A stored ads analysis. One row per agent run that produced a result.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ads_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  agent_type TEXT NOT NULL,
  -- The client-month this analysis is about. An ads audit is always about a
  -- window of spend, never about "now" — without this a re-run in October
  -- silently supersedes September's conclusions about September.
  period_month TEXT,               -- 'YYYY-MM', or NULL for multi-month views

  -- Scores, 0-100. Each agent fills the one it owns plus health_score where it
  -- has an opinion on overall account health. Same reason seo_audits has ten:
  -- a shared column would mean a creative score and a pacing score compete for
  -- the same cell and the card shows whichever ran last.
  health_score INTEGER,
  efficiency_score INTEGER,        -- performance: CPL/CPC/CTR vs the account's own history
  lead_quality_score INTEGER,      -- lead_quality
  funnel_score INTEGER,            -- funnel
  creative_score INTEGER,          -- creative
  landing_score INTEGER,           -- landing
  pacing_score INTEGER,            -- pacing
  roas_score INTEGER,              -- roas
  audit_score INTEGER,             -- fallback for agents with no dedicated column

  summary TEXT,
  report_json TEXT,                -- full structured report, incl. the fact pack it ran on
  -- The fact pack's own hash. Two runs over identical numbers should reach the
  -- same conclusions; when they do not, this is what makes that visible
  -- instead of it reading as the account having changed.
  facts_hash TEXT,
  -- Recorded per audit, not per installation: an account with no leads logged
  -- yields a real performance audit and a meaningless funnel one, and the card
  -- has to be able to say which.
  data_gaps TEXT,                  -- JSON array of {section, reason}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ads_audits_client ON ads_audits(client_id, agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_audits_period ON ads_audits(client_id, period_month);

-- ---------------------------------------------------------------------------
-- Actions produced by an audit. Mirrors seo_recommendations, including the
-- conversion path into the Kanban board, so ads work lands where the team
-- already looks instead of in a report nobody reopens.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ads_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Critical','High','Medium','Low')),
  platform TEXT,                   -- 'Google' | 'Meta' | 'YouTube' | NULL for account-wide
  campaign_name TEXT,              -- the campaign this is about, when it is about one
  metric TEXT NOT NULL,            -- 'CPL', 'CTR', 'Qualification rate', ...
  issue TEXT NOT NULL,
  action_required TEXT NOT NULL,
  observation TEXT,                -- the numbers this was read off
  -- What would make this recommendation wrong. Carried over from
  -- seo_recommendations, where it is the field that stops an action being
  -- followed for three months after the thing it assumed stopped being true.
  failure_check TEXT,
  expected_impact TEXT,            -- e.g. "~₹8,200/mo at current CPL"
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','ignored')),
  kanban_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audit_id) REFERENCES ads_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (kanban_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ads_recs_audit ON ads_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_ads_recs_open ON ads_recommendations(client_id, status);

-- ---------------------------------------------------------------------------
-- The job record. Same state machine as seo_agent_runs, same partial unique
-- index doing the actual anti-double-queue work.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ads_agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','cancelled','timed_out')),
  period_month TEXT,               -- the month this run analyses
  openclaw_run_id TEXT,
  model TEXT,
  actual_model TEXT,               -- which model really served it; free tiers fall through
  requested_by TEXT,
  -- 'manual' | 'scheduled'. A scheduled run that finds nothing wrong is a
  -- success; a manual one that does is a wasted click. Telling them apart is
  -- what lets the monitor run itself without the queue reading as noise.
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  pending_action_id INTEGER,
  audit_id INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_agent_runs_inflight
  ON ads_agent_runs(client_id, agent_type)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_ads_agent_runs_client ON ads_agent_runs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_agent_runs_status ON ads_agent_runs(status);

-- ---------------------------------------------------------------------------
-- The fleet.
--
-- Twelve agents, not thirty-three. The reference implementation this is modelled
-- on (AgriciDaniel/claude-ads) covers twelve ad platforms through their APIs;
-- this installation has credentials for none of them. What it does have is the
-- outcome data those APIs cannot see — which leads qualified, which booked an
-- appointment, what a booked treatment is worth — so the fleet is scoped to
-- questions that first-party data can actually answer, and every agent below
-- names the data it needs in `requires`.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO ads_agent_config
  (agent_type, label, description, stale_after_days, requires, sort_order) VALUES

('full', 'Full Ads Audit',
 'Every agent below in one pass: efficiency, lead quality, funnel, budget split, pacing and true ROAS, reconciled into one account verdict and one ranked action list.',
 30, '["spend"]', 10),

('performance', 'Performance & Efficiency',
 'CTR, CPC and cost per lead per campaign, read against this account''s own prior months rather than an industry benchmark that may not describe it.',
 7, '["spend"]', 20),

('lead_quality', 'Lead Quality',
 'Qualification and rejection rates per campaign, and cost per QUALIFIED lead — the number that decides whether cheap leads were actually cheap.',
 7, '["spend","leads"]', 30),

('funnel', 'Funnel Drop-off',
 'Lead to qualified to appointment booked, stage by stage, with the drop-off that costs the most money named first.',
 7, '["leads"]', 40),

('roas', 'True ROAS',
 'Revenue from booked appointments priced off the client''s own treatment list, against spend. Replaces the self-reported revenue column with something traceable.',
 14, '["spend","leads","prices"]', 50),

('budget', 'Budget Reallocation',
 'Where the next rupee should go, ranked by cost per qualified lead, with the reallocation stated as an amount rather than a direction.',
 14, '["spend"]', 60),

('platform_split', 'Platform Split',
 'Google vs Meta vs YouTube on the same efficiency measures, so a platform is not judged against a benchmark set by a different one.',
 14, '["spend_multi_platform"]', 70),

('pacing', 'Budget Pacing',
 'Spend so far this month against the month''s plan, projected to month end, with the over- or under-spend stated in rupees and days.',
 3, '["spend_current_month"]', 80),

('anomaly', 'Anomaly Watch',
 'Month-on-month breaks in spend, CPL, CTR and lead volume beyond this account''s own normal variation. The agent the schedule runs unattended.',
 1, '["spend_multi_month"]', 90),

('creative', 'Creative Signal',
 'Which organic posts actually held attention, and which of those angles have not been tried as paid creative yet.',
 30, '["content"]', 100),

('landing', 'Landing Page Conversion',
 'What happens to paid traffic after the click: contact-click rate, the page''s own SEO audit findings, and the conversion leaks between them.',
 30, '["landing"]', 110),

('report', 'Client Ads Report',
 'The month written up for the client: what was spent, what it returned, what changed and what happens next. Numbers only from the fact pack.',
 30, '["spend"]', 120);
