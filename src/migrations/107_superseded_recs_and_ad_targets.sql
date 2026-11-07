-- Migration: 107_superseded_recs_and_ad_targets.sql
--
-- 1. Which newer audit replaced a recommendation (src/services/recommendations.js).
--    Set together with status 'ignored' when the same check runs again and the
--    item was still open and untouched.
ALTER TABLE ads_recommendations ADD COLUMN superseded_by_audit_id INTEGER;
ALTER TABLE seo_recommendations ADD COLUMN superseded_by_audit_id INTEGER;

-- 2. The plan an account is paced and judged against. Nothing stored one
--    before, so pacing compared to the account's own past months and no card
--    could say whether a cost per lead was good. All optional, all INR.
ALTER TABLE crm_clients ADD COLUMN monthly_ad_budget_inr REAL;
ALTER TABLE crm_clients ADD COLUMN target_cost_per_qualified_lead_inr REAL;
ALTER TABLE crm_clients ADD COLUMN target_cost_per_booking_inr REAL;
