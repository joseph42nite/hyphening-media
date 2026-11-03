-- Migration: 096_blog_topics_and_runs.sql
-- The night blog pipeline (vault: Group/Master Plan - Automation, Phase 5).
--
-- blog_topics: each client's queue of approved topics. The 01:00 IST
-- schedule takes the next 'planned' one per client per night. Filled from the
-- Blog tab or by the bots' add_blog_topics webhook (a whole calendar at once).
--
-- blog_agent_runs: one row per post, from queued to published. The draft
-- lives here, not in blog_posts: blog_posts is Hyphening's own public blog,
-- and other clients publish elsewhere. Approving copies it to its target.
-- Statuses:
--   queued → running → ready             (worker finished, waits for 007)
--                    → client_review     (client/clinician reviews first)
--                    → failed            (error or health check blocked)
--   ready → approved → published         (published by the server)
--   ready → approved                     (manual target: Q / handoff finishes it)
--   ready / client_review → rejected

CREATE TABLE IF NOT EXISTS blog_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  target_keyword TEXT,
  notes TEXT,
  planned_for TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'queued', 'drafted', 'published', 'skipped')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_topics_client_status ON blog_topics(client_id, status, planned_for);

CREATE TABLE IF NOT EXISTS blog_agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES blog_topics(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'client_review', 'ready', 'approved', 'published', 'rejected', 'failed')),
  requested_by TEXT,
  worker TEXT,
  model TEXT,
  started_at TEXT,
  finished_at TEXT,
  -- the draft
  title TEXT,
  slug TEXT,
  excerpt TEXT,
  content TEXT,
  category TEXT,
  tags TEXT,
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  internal_links TEXT,
  cover_image_url TEXT,
  cover_alt TEXT,
  schema_json TEXT,
  audio_url TEXT,
  -- checks
  quality_score INTEGER,
  quality_bar INTEGER,
  blockers TEXT,
  evidence TEXT,
  error TEXT,
  -- review and publishing
  client_review_note TEXT,
  client_reviewed_at TEXT,
  reject_reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  blog_post_id INTEGER,
  published_url TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_runs_status ON blog_agent_runs(status, client_id);
