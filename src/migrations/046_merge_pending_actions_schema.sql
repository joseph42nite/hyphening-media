-- Migration: 046_merge_pending_actions_schema.sql
-- Merges the Telegram action queue schema (from 017) and the SEO/agent approval schema (from 044) into a unified openclaw_pending_actions table.

DROP TABLE IF EXISTS openclaw_pending_actions;

CREATE TABLE openclaw_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT UNIQUE,               -- UUID for Telegram callback confirmation (from 017)
  client_id INTEGER,                   -- Reference to CRM client (from 044)
  event_type TEXT,                     -- Webhook event type (from 017)
  action_type TEXT,                    -- SEO/agent action type (from 044)
  payload TEXT,                        -- JSON payload for Telegram confirmation (from 017)
  action_payload TEXT,                 -- JSON payload for SEO/agent trigger (from 044)
  requested_by TEXT,                   -- Staff user ID who triggered (from 044)
  requested_role TEXT,                 -- Role of the requester (from 044)
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','auto_approved')),
  telegram_message_id TEXT,            -- Telegram confirmation message ID for editing
  telegram_chat_id TEXT,               -- Telegram chat ID
  resolved_by TEXT,                    -- Admin resolver (from 044)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,                    -- Timestamp when action was approved/rejected
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON openclaw_pending_actions(status);
