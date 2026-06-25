-- Migration: 018_performance_optimizations.sql
-- Add missing indexes to improve database search performance and speed up CASCADE checks.

-- 1. gig_status table indexes (FKs and ordering)
CREATE INDEX IF NOT EXISTS idx_gig_status_artist_id ON gig_status(artist_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_client_id ON gig_status(client_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_venue_id ON gig_status(venue_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_planning_cycle_id ON gig_status(planning_cycle_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_date ON gig_status(gig_date DESC);

-- 2. kanban_tasks table index for created_by
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON kanban_tasks(created_by);

-- 3. client_requests table index for client_id
CREATE INDEX IF NOT EXISTS idx_client_requests_client_id ON client_requests(client_id);

-- 4. marketing_scripts table index for client_id
CREATE INDEX IF NOT EXISTS idx_marketing_scripts_client_id ON marketing_scripts(client_id);

-- 5. marketing_content_tracker index for kanban_task_id
CREATE INDEX IF NOT EXISTS idx_content_kanban_task_id ON marketing_content_tracker(kanban_task_id);

-- 6. marketing_content_tracker composite index for client-based chronological lists
CREATE INDEX IF NOT EXISTS idx_content_client_date ON marketing_content_tracker(client_id, date DESC);

-- 7. marketing_content_script_relation index for script_id
CREATE INDEX IF NOT EXISTS idx_content_script_relation_script_id ON marketing_content_script_relation(script_id);

-- 8. internal_chat_messages index for sender_id
CREATE INDEX IF NOT EXISTS idx_internal_chats_sender ON internal_chat_messages(sender_id);

-- 9. users table index for role searches
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
