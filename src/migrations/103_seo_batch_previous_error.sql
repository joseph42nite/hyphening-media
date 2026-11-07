-- 103_seo_batch_previous_error.sql
-- Pressing Deploy again cleared the reason the last attempt failed
-- (2026-11-07), so the retry keeps it here until the batch goes live.
ALTER TABLE seo_fix_batches ADD COLUMN previous_error TEXT;
