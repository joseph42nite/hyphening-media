-- Migration: 060_client_google_properties.sql
-- Per-client Search Console and GA4 identifiers.
--
-- The claude-seo plugin accepts a `default_property` in its own config file, and
-- using that would be a bug here: audits run for several clients, so one global
-- default means a Search Console query during DentAlchemy's audit returns
-- Janya's search data, filed under DentAlchemy, with nothing in the report to
-- reveal it. Wrong-client data is worse than missing data — it looks real.
--
-- Stored against the client instead, so the worker passes the right property per
-- run and a client with no property configured simply gets no Search Console
-- section rather than someone else's numbers.

-- Search Console property, in the exact form the API expects:
--   'sc-domain:janyafertility.in'      for a domain property
--   'https://janyafertility.in/'       for a URL-prefix property
-- The two are not interchangeable, and a domain property only works if the
-- client has verified DNS ownership.
ALTER TABLE crm_clients ADD COLUMN gsc_property TEXT;

-- GA4 property id, including the prefix the Data API expects:
--   'properties/123456789'
ALTER TABLE crm_clients ADD COLUMN ga4_property_id TEXT;
