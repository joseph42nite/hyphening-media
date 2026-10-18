-- Migration: 085_add_blog_audio_url.sql
-- Optional narration audio for a blog post. NULL for every existing post —
-- the frontend only renders a player when this is set, so posts without
-- audio are unaffected. Set via PATCH /api/blog/:id or the signed OpenClaw
-- webhook (update_blog_post), same channel already used to publish posts.

ALTER TABLE blog_posts ADD COLUMN audio_url TEXT;
