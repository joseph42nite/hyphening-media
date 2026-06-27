-- Add assigned_to column to marketing_content_tracker table
-- Migration: 027_add_assigned_to_content_tracker.sql

-- 1. Add assigned_to column to marketing_content_tracker
ALTER TABLE marketing_content_tracker ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 2. Update existing content tracker rows for Reels, YouTube videos, and Shorts to be assigned to the video editor
UPDATE marketing_content_tracker 
SET assigned_to = (SELECT id FROM users WHERE role = 'ops_video_editor' AND is_active = 1 LIMIT 1)
WHERE post_type IN ('Reel', 'Youtube', 'Short');

-- 3. Update existing corresponding kanban tasks to be assigned to the video editor and set task_type to 'video'
UPDATE kanban_tasks
SET assigned_to = (SELECT id FROM users WHERE role = 'ops_video_editor' AND is_active = 1 LIMIT 1),
    task_type = 'video'
WHERE id IN (
  SELECT kanban_task_id 
  FROM marketing_content_tracker 
  WHERE post_type IN ('Reel', 'Youtube', 'Short') AND kanban_task_id IS NOT NULL
);
