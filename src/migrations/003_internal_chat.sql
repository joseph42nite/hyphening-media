-- Migration: 003_internal_chat.sql
-- Create table for internal client-based chats

CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_internal_chats_client ON internal_chat_messages(client_id);
