-- Migration: 073_backlink_gap_analysis.sql
-- Adds the backlink_gap skill: which domains link to a competitor but not to us.
--
-- This is a different question from the one 062 answered. That migration let a
-- skill run against a competitor's URL, which benchmarks them — their technical
-- score beside ours. Gap analysis compares the two link profiles instead and
-- returns the domains linking to them and not to us, which is a prospect list
-- rather than a score. The seo-backlinks skill has carried this as Section 6
-- since it was installed; it has never run once, because a run payload had no
-- way to name the competitor to compare against.
--
-- Kept as a separate audit_type rather than an option on 'backlinks' so the two
-- keep separate history. A gap report and a profile audit answer different
-- questions and age differently: a profile is worth re-reading weekly, a
-- prospect list is worth working through for a month before regenerating.

-- The competitor this run compares against. NULL for every other audit type,
-- which is every existing run, so no backfill is needed.
--
-- Stores the domain rather than a client_competitors row id on purpose. The
-- worker needs a string to hand the skill, and a competitor that gets deleted
-- from the tracking table should not orphan or silently blank the run that
-- already used it — the report says which domain it compared against, and this
-- column has to keep agreeing with the report.
ALTER TABLE seo_agent_runs ADD COLUMN competitor_domain TEXT;

-- Mirrored onto the audit for the same reason 062 mirrored target_url: so the
-- dashboard can label and group a stored report without joining back to the run.
ALTER TABLE seo_audits ADD COLUMN competitor_domain TEXT;

-- 30 days, not the 7 that 'backlinks' uses. A referring-domain gap does not
-- meaningfully change week to week, and the output is a list somebody has to
-- work through by hand. Re-running it weekly would regenerate a list nobody had
-- finished acting on and reset the sense of what had already been tried.
--
-- Sonnet rather than the deepseek default 'backlinks' carries: this skill reads
-- two full referring-domain sets and has to judge topical relevance between
-- them, which is the part that decides whether the list is worth anything.
INSERT OR IGNORE INTO agent_run_config (audit_type, stale_after_days, default_model, notes)
VALUES (
  'backlink_gap',
  30,
  'claude-sonnet-5',
  'Monthly. Domains linking to a tracked competitor but not to us — the outreach prospect list. Requires an approved competitor and DataForSEO.'
);

-- Finding the queued/running gap run for one client and competitor pair. The
-- trigger route checks this before queueing so two people cannot start the same
-- comparison twice, which would spend the DataForSEO calls twice for one answer.
CREATE INDEX IF NOT EXISTS idx_seo_agent_runs_gap
  ON seo_agent_runs(client_id, agent_type, competitor_domain, status);
