-- Migration: 034_add_is_trial.sql
ALTER TABLE marketing_content_tracker ADD COLUMN is_trial INTEGER DEFAULT 0;
