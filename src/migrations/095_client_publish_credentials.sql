-- Migration: 095_client_publish_credentials.sql
-- One publishing key per client for sites with their own CMS (WordPress
-- Application Password, a custom admin's API key, ...). The secret is
-- AES-256-GCM encrypted with CLIENT_CREDENTIALS_KEY from the server .env
-- (src/services/encryption.js, same as artists' bank details). It is
-- write-only: no route returns secret_enc or the plaintext; reads get
-- kind / endpoint / last4 / updated_at only. Publishing decrypts it on the
-- server when 007 approves, so bots and the Mac workers never see it.

CREATE TABLE IF NOT EXISTS client_publish_credentials (
  client_id INTEGER PRIMARY KEY REFERENCES crm_clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wordpress', 'custom')),
  endpoint_url TEXT NOT NULL,
  username TEXT,
  secret_enc TEXT NOT NULL,
  last4 TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
