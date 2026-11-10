-- Migration: 112_google_access.sql
-- The "Google access" step of client onboarding (src/services/googleAccess.js).
-- Search Console and GA4 need no new columns: a passing check saves
-- gsc_property / ga4_property_id (migration 060) itself.

-- When the client said they invited our agency account as a Manager on their
-- Business Profile. Google's own confirmation comes once the Business Profile
-- API is connected; until then this is what 007 has to go on.
ALTER TABLE crm_clients ADD COLUMN gbp_invite_sent_at TEXT;
