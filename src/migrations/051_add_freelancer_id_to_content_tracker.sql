-- Add freelancer_id to marketing_content_tracker table
-- Migration: 051_add_freelancer_id_to_content_tracker.sql

ALTER TABLE marketing_content_tracker ADD COLUMN freelancer_id INTEGER REFERENCES freelancers(id) ON DELETE SET NULL;
