-- Migration: 059_openclaw_skill_inventory.sql
-- Records what OpenClaw actually has installed, as OpenClaw reports it.
--
-- Skill health was invisible to us until it cost a week. seo-geo's SKILL.md
-- lost its YAML frontmatter during a webhook-edit pass, which made the skill
-- undiscoverable; the model silently fell through to seo-local and returned a
-- geographic-SEO audit for a Generative Engine Optimization request. A later
-- check found a UTF-8 BOM on 20 of 22 files. None of that was detectable from
-- this side — the runs looked like ordinary timeouts and one wrong-but-plausible
-- result.
--
-- A skill is only useful to us if it parses, is discoverable, and still carries
-- the instruction to POST results back. This stores all three so the dashboard
-- can show it and the trigger route can refuse a skill that cannot work.

CREATE TABLE IF NOT EXISTS openclaw_skill_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reported_at TEXT NOT NULL,          -- ISO 8601, from OpenClaw
  trigger TEXT,                       -- on_demand | after_change | startup
  runner_model TEXT,
  skill_count INTEGER NOT NULL DEFAULT 0,
  unhealthy_count INTEGER NOT NULL DEFAULT 0,
  missing_skills TEXT,                -- JSON array
  unexpected_skills TEXT,             -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Current state only. Each report is a full snapshot and replaces the previous
-- one, so a skill that disappears from OpenClaw disappears here too rather than
-- lingering as a stale healthy row.
CREATE TABLE IF NOT EXISTS openclaw_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER REFERENCES openclaw_skill_reports(id),
  name TEXT NOT NULL UNIQUE,          -- frontmatter name, e.g. 'seo-geo'
  version TEXT,
  dirname TEXT,                       -- may differ from name (seo-seo-content -> seo-content)
  byte_size INTEGER,
  sha256 TEXT,
  lines INTEGER,
  frontmatter_parsed INTEGER NOT NULL DEFAULT 0,
  frontmatter_error TEXT,
  bom_present INTEGER NOT NULL DEFAULT 0,
  has_references INTEGER NOT NULL DEFAULT 0,
  has_templates INTEGER NOT NULL DEFAULT 0,
  has_assets INTEGER NOT NULL DEFAULT 0,
  -- Whether the skill still carries the instruction to POST results back. An
  -- upgrade that overwrites skills/ removes it silently, and the symptom is a
  -- run that completes on OpenClaw and never reports — indistinguishable from a
  -- hang until the timeout fires.
  webhook_pointer_present INTEGER NOT NULL DEFAULT 0,
  last_modified TEXT,
  -- Derived: can the model see and load this skill at all. Deliberately does
  -- NOT include webhook_pointer_present — during the move from inline webhook
  -- sections to a shared protocol file every skill reports it false, and gating
  -- on it would read as a total outage.
  healthy INTEGER NOT NULL DEFAULT 0,
  reported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openclaw_skills_healthy ON openclaw_skills(healthy);
