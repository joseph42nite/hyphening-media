-- Migration: 108_ads_seo_recs_off_kanban.sql
--
-- The Kanban board was replaced by the Leads page, so the SEO and Ads Monitors
-- no longer send recommendations to it. Items that were sent there were parked
-- at 'in_progress' with no board to see them on; they go back to 'open' so they
-- show in their monitor again. The kanban_tasks rows stay: the Calendar tab
-- still uses that table. The kanban_task_id columns are left in place, unused.

UPDATE ads_recommendations SET status = 'open', kanban_task_id = NULL
WHERE kanban_task_id IS NOT NULL AND status = 'in_progress';

UPDATE seo_recommendations SET status = 'open', kanban_task_id = NULL
WHERE kanban_task_id IS NOT NULL AND status = 'in_progress';
