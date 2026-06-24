-- Migration: 016_alter_artists_table.sql
-- Add onboarding fields to artists table

ALTER TABLE artists ADD COLUMN instruments TEXT;
ALTER TABLE artists ADD COLUMN insta_link TEXT;
ALTER TABLE artists ADD COLUMN description TEXT;
ALTER TABLE artists ADD COLUMN rating INTEGER;
ALTER TABLE artists ADD COLUMN notes TEXT;
ALTER TABLE artists ADD COLUMN perf_with_m INTEGER DEFAULT 0;
ALTER TABLE artists ADD COLUMN last_perf_date TEXT DEFAULT 'No gigs yet';
