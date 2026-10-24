-- Migration: 092_automation_mode.sql
--
-- Whether a fleet runs on its schedule or only when someone asks. One row per
-- fleet. 'manual' is the default and the only state a fresh install starts in:
-- a scheduled run that nobody asked for is a token bill, and the scheduler
-- checks this row before queueing anything.

CREATE TABLE IF NOT EXISTS automation_modes (
  scope TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','auto')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO automation_modes (scope, mode) VALUES ('ads', 'manual');
