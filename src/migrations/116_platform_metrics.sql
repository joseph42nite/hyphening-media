-- 116_platform_metrics.sql
-- Every figure the client portal shows comes from the platform that reports it.
--
-- Instagram (INSTAGRAM_GET_IG_MEDIA_INSIGHTS):
--   ig_reach               accounts reached
--   ig_total_interactions  Instagram's own interaction count
--   ig_profile_visits      profile visits (carousels and single posts only)
--   (follows already exists; Instagram now fills it for carousels and posts)
--
-- YouTube: likes and comments used to land in the shared likes/comments
-- columns, where Instagram's figures then overwrote them on cross-posted reels.
-- They get their own columns. YouTube Analytics (YOUTUBE_QUERY_ANALYTICS)
-- fills the rest:
--   youtube_shares, youtube_subscribers_gained
--   youtube_avg_view_pct   average percentage of the video watched
--   (youtube_watch_time and youtube_avg_view_duration already exist and
--    were typed in by hand; the sync now fills them)
--   youtube_analytics_synced_at  when Analytics last returned a row for it
ALTER TABLE marketing_content_tracker ADD COLUMN ig_reach INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN ig_total_interactions INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN ig_profile_visits INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_likes INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_comments INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_shares INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_subscribers_gained INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_avg_view_pct REAL;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_analytics_synced_at TEXT;

-- YouTube-only rows: their likes and comments were YouTube's, so move them.
-- Cross-posted rows are left alone; the next sync fills youtube_likes and
-- youtube_comments, and the shared columns keep Instagram's.
UPDATE marketing_content_tracker
SET youtube_likes = likes,
    youtube_comments = comments,
    likes = 0,
    comments = 0
WHERE youtube_video_id IS NOT NULL
  AND (LOWER(COALESCE(platform, '')) LIKE '%youtube%' OR LOWER(COALESCE(platform, '')) LIKE '%shorts%');
