-- 035_social_comments.sql
-- Caches incoming comments from Instagram Reels & YouTube Shorts for Client Portal

CREATE TABLE IF NOT EXISTS social_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER,
  client_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  comment_id TEXT UNIQUE,
  commenter_name TEXT,
  comment_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES marketing_content_tracker(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_comments_client_id ON social_comments(client_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_content_id ON social_comments(content_id);
