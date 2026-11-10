-- 115_ig_watch_time_seconds.sql
-- Instagram reports a reel's average watch time in milliseconds
-- (ig_reels_avg_watch_time) and its skip rate as a percentage
-- (reels_skip_rate). Since July the sync converted the watch time to seconds
-- but wrote it into avg_watch_time_pct, so the tracker showed "28.64%", and
-- skip_rate_pct was derived as 100 minus those seconds, which means nothing.
--
--   avg_watch_time_sec  average watch time in seconds, straight from Instagram.
--
-- Rows the sync has written move their seconds over, and the made-up skip
-- rate is cleared; the next sync fills the real reels_skip_rate in.
ALTER TABLE marketing_content_tracker ADD COLUMN avg_watch_time_sec REAL;

UPDATE marketing_content_tracker
SET avg_watch_time_sec = avg_watch_time_pct,
    avg_watch_time_pct = NULL,
    skip_rate_pct = NULL
WHERE avg_watch_time_pct IS NOT NULL
  AND metrics_synced_at IS NOT NULL
  AND instagram_media_id GLOB '[0-9]*';
