-- 115_manual_tasks_sort.sql
-- The night sort called everything that wasn't a small safe edit "not_code",
-- so Manual tasks filled with code changes, re-checks the cards already do,
-- content we can produce, and the same GA4 task raised by six cards. The sort
-- now has three more outcomes (seoNight.js submitSeoTriage):
--   code       a site or app change outside the safe list → needs_007 (Fix tonight)
--   automatic  a re-run, re-check or monitoring a card or API already covers → closed
--   content    a new article or page to write → its keyword goes to the Keywords
--              panel (source 'audit'), where blog topics come from
-- and not_code findings that ask for the same thing share a manual_group, so
-- the tab shows them as one task.

ALTER TABLE seo_recommendations ADD COLUMN manual_group TEXT;
ALTER TABLE ads_recommendations ADD COLUMN manual_group TEXT;

-- Keyword candidates can now come from an audit finding. SQLite can't change a
-- CHECK in place, so the table is rebuilt with the same ids. Foreign keys are
-- off for the swap so blog_topics.keyword_id (ON DELETE SET NULL) is untouched.
PRAGMA foreign_keys = OFF;
CREATE TABLE seo_keywords_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('search_console', 'ideas', 'audit')),
  search_volume INTEGER,
  difficulty INTEGER,
  intent TEXT,
  impressions INTEGER,
  position REAL,
  prev_position REAL,
  score REAL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, keyword)
);
INSERT INTO seo_keywords_new SELECT id, client_id, keyword, source, search_volume, difficulty, intent, impressions,
  position, prev_position, score, status, decided_by, decided_at, checked_at, created_at FROM seo_keywords;
DROP TABLE seo_keywords;
ALTER TABLE seo_keywords_new RENAME TO seo_keywords;
PRAGMA foreign_keys = ON;
CREATE INDEX IF NOT EXISTS idx_seo_keywords_client_status ON seo_keywords(client_id, status, score);

-- Send today's open "not_code" SEO findings back through tonight's sort under
-- the new rules (unsorted findings are candidates for the night batch).
UPDATE seo_recommendations SET fix_triage = NULL, fix_reason = NULL, manual_area = NULL
WHERE status = 'open' AND fix_triage = 'not_code' AND superseded_by_audit_id IS NULL;
