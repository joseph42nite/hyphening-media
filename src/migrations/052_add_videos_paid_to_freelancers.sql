-- Add videos_paid column to freelancers table
-- Migration: 052_add_videos_paid_to_freelancers.sql

ALTER TABLE freelancers ADD COLUMN videos_paid INTEGER DEFAULT 0;
