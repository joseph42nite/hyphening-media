-- 102_comment_replies.sql
-- A comment answered from the portal inbox leaves the inbox; the reply is kept
-- so "Show replied" can show what was sent.
ALTER TABLE social_comments ADD COLUMN replied_at DATETIME;
ALTER TABLE social_comments ADD COLUMN reply_text TEXT;
