-- Migration: 064_youtube_performance_metrics.sql
-- Stores the YouTube figures needed to judge a video against its own age and format.
--
-- The tracker ranks YouTube by raw view count, which measures how long a video
-- has existed more than how well it is doing. On Divya's channel the top row by
-- views is a 208-day-old Short coasting at 34 views/day, while the video
-- actually performing — 269 views/day — sits near the bottom with 766 views.
--
-- Shorts and long-form are also averaged together today despite behaving
-- differently: Shorts pull 1,745 views on average against 1,007 for long-form,
-- but long-form earns 1.85% likes against 0.82%. Reach and engagement are
-- separate questions and the table cannot currently tell them apart.
--
-- All of it derives from the snippet/statistics/contentDetails payload the sync
-- already requests, so populating these costs no additional API calls. They are
-- stored rather than computed on read so the existing SELECT t.* queries, the
-- CSV export and the client portal all pick them up without change.
--
-- Distinct from the manually-entered youtube_watch_time / youtube_ctr columns,
-- which come from YouTube Analytics and are left alone.

ALTER TABLE marketing_content_tracker ADD COLUMN youtube_published_at TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_duration_seconds INTEGER;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_format TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_views_per_day REAL;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_like_rate_pct REAL;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_comment_rate_pct REAL;
