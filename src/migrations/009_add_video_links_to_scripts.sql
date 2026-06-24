-- Migration: 009_add_video_links_to_scripts.sql
-- Add reference_video_link and reaction_video_link to marketing_scripts table
ALTER TABLE marketing_scripts ADD COLUMN reference_video_link TEXT;
ALTER TABLE marketing_scripts ADD COLUMN reaction_video_link TEXT;
