-- Migration: 068_campaign_lead_is_test.sql
-- Marks a lead as a test entry outright, instead of overloading a call outcome.
--
-- "Other" was standing in for "this is not a real lead", but it is a legitimate
-- value of call_outcome — the call happened and did not fit Picked Up or No
-- Answer. A genuine lead marked that way silently stopped counting, and a test
-- lead could never record what actually happened on its call, because saying so
-- would have put it back into the totals.
--
-- The two are orthogonal, so they get separate columns: is_test decides whether
-- a lead counts, call_outcome describes the call, and a test lead may now carry
-- any outcome.
--
-- Existing "Other" rows are marked as tests to preserve exactly the totals
-- currently on screen. After this, "Other" counts like any other outcome, so
-- anything genuinely marked that way should have the flag cleared.

ALTER TABLE campaign_leads ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

UPDATE campaign_leads
SET is_test = 1
WHERE LOWER(TRIM(COALESCE(call_outcome, ''))) = 'other';

CREATE INDEX IF NOT EXISTS idx_campaign_leads_is_test ON campaign_leads(is_test);
