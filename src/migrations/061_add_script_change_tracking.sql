-- Migration: 061_add_script_change_tracking.sql
-- Add has_unseen_changes and last_changed_by columns to marketing_scripts

ALTER TABLE marketing_scripts ADD COLUMN has_unseen_changes INTEGER DEFAULT 0;
ALTER TABLE marketing_scripts ADD COLUMN last_changed_by TEXT DEFAULT 'staff';
