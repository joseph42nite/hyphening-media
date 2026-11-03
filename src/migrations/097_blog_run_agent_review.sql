-- Migration: 097_blog_run_agent_review.sql
-- The OpenMausBot team's review of a night draft (Vesper, 06:30 IST), shown
-- next to the post in the Blog Monitor so 007 approves with the bots' view in
-- front of him. Set through the signed webhook (review_blog_run); it never
-- changes the run's status: approving stays 007's.

ALTER TABLE blog_agent_runs ADD COLUMN agent_recommendation TEXT
  CHECK (agent_recommendation IS NULL OR agent_recommendation IN ('approve', 'reject', 'needs_007'));
ALTER TABLE blog_agent_runs ADD COLUMN agent_review TEXT;
ALTER TABLE blog_agent_runs ADD COLUMN agent_reviewed_by TEXT;
ALTER TABLE blog_agent_runs ADD COLUMN agent_reviewed_at TEXT;
