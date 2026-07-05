-- Migration: 033_add_scheduled_at.sql
ALTER TABLE marketing_content_tracker ADD COLUMN scheduled_at DATETIME;
