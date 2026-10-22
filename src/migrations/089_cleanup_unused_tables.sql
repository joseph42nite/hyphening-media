-- Migration 089: Remove unused and dead database tables
-- calendar_events: Unused table from initial schema, calendar uses kanban_tasks and content_tracker
DROP TABLE IF EXISTS calendar_events;

-- migration_metadata: Legacy metadata table superseded by _migrations
DROP TABLE IF EXISTS migration_metadata;

-- outreach_pitches: Dead table created in migration 044 with no routes, queries, or UI
DROP TABLE IF EXISTS outreach_pitches;

-- pr_requests: Dead table created in migration 044 with no routes, queries, or UI
DROP TABLE IF EXISTS pr_requests;
