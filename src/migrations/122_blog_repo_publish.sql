-- Migration: 122_blog_repo_publish.sql
-- Publishing approved posts to a client site whose blog lives in its code
-- repo (blog_publish_target 'repo_file', e.g. Dr. Divya's blogs-data.ts).
-- 007's Approve queues it; the Mac's blog publish worker adds the post to the
-- repo, pushes and deploys per the repo's deploy manifest, then reports back.
--   publish_state: NULL (not a repo post) | queued | running | live | failed
-- The run stays 'approved' until the deploy is live, then turns 'published'.

ALTER TABLE blog_agent_runs ADD COLUMN publish_state TEXT
  CHECK (publish_state IS NULL OR publish_state IN ('queued', 'running', 'live', 'failed'));
ALTER TABLE blog_agent_runs ADD COLUMN publish_commit TEXT;
ALTER TABLE blog_agent_runs ADD COLUMN publish_log TEXT;
ALTER TABLE blog_agent_runs ADD COLUMN cover_source TEXT;
