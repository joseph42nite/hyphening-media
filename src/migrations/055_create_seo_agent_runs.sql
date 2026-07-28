-- Migration: 055_create_seo_agent_runs.sql
-- A real job record for every SEO agent trigger handed off to OpenClaw.
--
-- Before this table the only "is it running?" signal lived in React state,
-- so a page refresh (or a second click) would happily queue the same agent
-- twice and pay for it twice. openclaw_pending_actions can't serve as the
-- queue: its rows are written once as 'auto_approved' and never advanced,
-- so it is an audit trail, not a state machine.

CREATE TABLE IF NOT EXISTS seo_agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  agent_type TEXT NOT NULL,
  -- queued    = row claimed, hand-off to OpenClaw not confirmed yet
  -- running   = OpenClaw accepted the hook, audit is in flight
  -- completed = create_seo_audit webhook arrived
  -- failed    = hand-off failed, or OpenClaw reported an error result
  -- cancelled = operator cancelled from the dashboard
  -- timed_out = no webhook within the skill's expected window
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','cancelled','timed_out')),
  openclaw_run_id TEXT,           -- runId returned by the OpenClaw hook gateway
  model TEXT,
  requested_by TEXT,              -- email of the staff user who clicked Run
  pending_action_id INTEGER,      -- openclaw_pending_actions row, for the audit trail
  audit_id INTEGER,               -- seo_audits row produced by this run, once known
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- The actual anti-double-queue guard. A partial unique index means SQLite
-- itself rejects a second in-flight run for the same client+agent, so a
-- double-click or two racing requests cannot both spawn a runner. Finished
-- runs fall out of the index, leaving the slot free for the next trigger.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_agent_runs_inflight
  ON seo_agent_runs(client_id, agent_type)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_seo_agent_runs_client ON seo_agent_runs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_agent_runs_status ON seo_agent_runs(status);
