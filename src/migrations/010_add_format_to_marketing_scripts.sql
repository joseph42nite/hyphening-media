-- Migration: 010_add_format_to_marketing_scripts.sql
-- Add format column to marketing_scripts table to support Reels vs Long Format scripts.
ALTER TABLE marketing_scripts ADD COLUMN format TEXT DEFAULT 'reel' CHECK (format IN ('reel', 'long_format'));
