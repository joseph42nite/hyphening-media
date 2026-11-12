-- 118_night_fix_no_change.sql
-- A night fix that changed nothing used to be stored as fix_failed, even when
-- the reason was "the code already does this" (17 on Hyphening Media after
-- 2026-11-12, all "No change made: ..."). The worker now says which it was
-- (seoNight.submitSeoFixBatch): already done → completed, can't be done in
-- the safe list → needs_007.
--
-- The rows already stored can't be split reliably from their text (some are
-- done, some need files outside the safe list), so they go back to unsorted
-- and tonight's sort decides each one, reading the code as it is now.
--
-- Safe findings past a night's 8-fix cap need no data change: they are
-- candidates again from this release (NIGHT_CANDIDATE in seoNight.js).

UPDATE seo_recommendations
SET status = 'open', fix_triage = NULL, fix_reason = NULL, fix_error = NULL, fix_summary = NULL, fix_approved = 0
WHERE status = 'fix_failed' AND fix_error LIKE 'No change made:%' AND superseded_by_audit_id IS NULL;

UPDATE ads_recommendations
SET status = 'open', fix_triage = NULL, fix_reason = NULL, fix_error = NULL, fix_summary = NULL, fix_approved = 0
WHERE status = 'fix_failed' AND fix_error LIKE 'No change made:%' AND superseded_by_audit_id IS NULL;
