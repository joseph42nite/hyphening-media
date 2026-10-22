-- Migration 091: Create lead_industries table to persist and edit saved industries
CREATE TABLE IF NOT EXISTS lead_industries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default industries
INSERT OR IGNORE INTO lead_industries (name) VALUES
  ('FnB'),
  ('Healthcare'),
  ('Interior Designers');

-- Backfill any existing custom industries from leads table
INSERT OR IGNORE INTO lead_industries (name)
SELECT DISTINCT TRIM(industry)
FROM leads
WHERE industry IS NOT NULL AND TRIM(industry) != '';
