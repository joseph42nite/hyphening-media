-- OpenClaw Pending Actions table for Telegram confirmation flow
CREATE TABLE IF NOT EXISTS openclaw_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
  telegram_message_id TEXT,
  telegram_chat_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
