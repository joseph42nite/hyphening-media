-- Migration: 040_add_cross_post_links.sql
-- Add platform-specific link columns to marketing_content_tracker for cross-posting
ALTER TABLE marketing_content_tracker ADD COLUMN instagram_link TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_link TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN facebook_link TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN linkedin_link TEXT;
