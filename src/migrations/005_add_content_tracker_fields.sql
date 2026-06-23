-- Migration: 005_add_content_tracker_fields.sql
-- Add all columns from the Content Tracker Google Sheet

ALTER TABLE marketing_content_tracker ADD COLUMN link TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN time TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN caption TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN follows INTEGER DEFAULT 0;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_views INTEGER DEFAULT 0;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_watch_time REAL DEFAULT 0.0;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_avg_view_duration TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_ctr REAL DEFAULT 0.0;
