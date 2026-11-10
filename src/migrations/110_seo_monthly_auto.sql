-- Migration: 110_seo_monthly_auto.sql
-- Month-end SEO report, filled from Search Console, GA4 and our own records
-- (src/services/seoMonthly.js), and held as a draft until someone publishes it.
--
-- The old hand-typed columns (on_page_score, off_page, da, top_keywords,
-- ai_overview_visible) stay in the table so past months keep their history;
-- the dashboard and portal just stop showing them.

-- Search Console totals for the month. search_clicks is a number; the old
-- website_clicks is TEXT holding things like '9.37k' and stays for history.
ALTER TABLE marketing_monthly_report ADD COLUMN search_clicks INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN search_impressions INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN avg_position REAL;
-- Searches (with at least 10 impressions) whose average position was 1-3 / 1-10.
ALTER TABLE marketing_monthly_report ADD COLUMN queries_top3 INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN queries_top10 INTEGER;
-- JSON: [{ query, clicks, impressions, position, prev_position }], top by clicks.
ALTER TABLE marketing_monthly_report ADD COLUMN top_queries TEXT;

-- Work done that month, counted from our own tables.
ALTER TABLE marketing_monthly_report ADD COLUMN fixes_live INTEGER;

-- 'draft' rows are hidden from the client portal until published. Every
-- existing row was already visible, so they start as 'published'.
ALTER TABLE marketing_monthly_report ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published'));
-- JSON: { filled: [column, ...], notes: [text, ...] } from the last auto-fill.
ALTER TABLE marketing_monthly_report ADD COLUMN auto_sources TEXT;
ALTER TABLE marketing_monthly_report ADD COLUMN auto_filled_at TEXT;
