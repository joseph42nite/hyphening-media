-- Migration: 050_support_per_url_seo_audits.sql
-- Add page_url column to allow multiple audit results per (client_id, audit_type),
-- one row per URL audited in a run. Audits remain historical records (no upsert/unique
-- constraint) so re-auditing the same page just adds a new row, consistent with how
-- every other audit_type already accumulates history over time.

ALTER TABLE seo_audits ADD COLUMN page_url TEXT;

-- Backfill existing rows so page_url is never null for pre-migration audits.
UPDATE seo_audits SET page_url = url WHERE page_url IS NULL;

DROP INDEX IF EXISTS idx_seo_audits_type;
CREATE INDEX IF NOT EXISTS idx_seo_audits_type_page ON seo_audits(client_id, audit_type, page_url);
