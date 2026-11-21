-- Migration 121: Per-venue overrides for Quick Artist Message Templates.
-- A venue without a row here falls back to the default in artist_message_templates.
CREATE TABLE IF NOT EXISTS venue_artist_message_templates (
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  template_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (venue_id, template_key)
);
