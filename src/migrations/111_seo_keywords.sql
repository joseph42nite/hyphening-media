-- Migration: 111_seo_keywords.sql
-- Keyword-checked blog topics (src/services/keywordPlan.js). Once a month,
-- each client's candidate keywords are collected from Search Console (near
-- misses) and DataForSEO (ideas from the client's niche keywords), scored in
-- code, and listed in the Blog Monitor. Approving one makes it a blog topic;
-- the next month's run records where the client now ranks for it.

CREATE TABLE IF NOT EXISTS seo_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,                 -- lower-case, trimmed
  source TEXT NOT NULL CHECK (source IN ('search_console', 'ideas')),
  search_volume INTEGER,                 -- monthly, India (DataForSEO)
  difficulty INTEGER,                    -- 0-100 (DataForSEO keyword difficulty)
  intent TEXT,                           -- informational | commercial | transactional | navigational
  impressions INTEGER,                   -- Search Console, last 90 days
  position REAL,                         -- Search Console average position at the last refresh
  prev_position REAL,                    -- the refresh before that
  score REAL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, keyword)
);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_client_status ON seo_keywords(client_id, status, score);

-- Seeds come from onboarding (crm_clients.brand_niche_keywords), falling
-- back to the client's top Search Console searches when that is empty.

-- How many of the month's best keywords become topics on their own (0 = off,
-- every keyword waits for 007).
ALTER TABLE crm_clients ADD COLUMN keywords_auto_approve INTEGER NOT NULL DEFAULT 0;

-- The approved keyword a topic was made from.
ALTER TABLE blog_topics ADD COLUMN keyword_id INTEGER REFERENCES seo_keywords(id) ON DELETE SET NULL;
