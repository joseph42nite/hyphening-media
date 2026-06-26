-- Migration: 024_add_social_platform_ids.sql
ALTER TABLE marketing_content_tracker ADD COLUMN facebook_post_id TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN instagram_media_id TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN youtube_video_id TEXT;

CREATE INDEX IF NOT EXISTS idx_content_facebook_post_id ON marketing_content_tracker(facebook_post_id);
CREATE INDEX IF NOT EXISTS idx_content_instagram_media_id ON marketing_content_tracker(instagram_media_id);
CREATE INDEX IF NOT EXISTS idx_content_youtube_video_id ON marketing_content_tracker(youtube_video_id);
