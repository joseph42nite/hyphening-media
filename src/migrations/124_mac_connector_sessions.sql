-- Migration: 124_mac_connector_sessions.sql
--
-- One row per Mac connector connection, so the SEO Monitor can say whether
-- the Mac was connected during last night's deploy window (00:30-03:00 IST).
-- On 22-23 Nov 2026 OpenMausBot was closed, Q never started the connector,
-- and nothing ran at night with nothing on the dashboard saying why.
--
-- The socket lives in one PM2 cluster process; the table is what every
-- process can read. last_seen_at moves on each heartbeat ping (every 20 s),
-- so a session cut off by a server restart, which never gets a close event,
-- still ends where it was last heard from.

CREATE TABLE IF NOT EXISTS mac_connector_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  disconnected_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mac_connector_sessions_seen ON mac_connector_sessions (last_seen_at);
