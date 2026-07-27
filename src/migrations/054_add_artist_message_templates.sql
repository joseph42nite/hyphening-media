-- Migration 054: Create table for storing Quick Artist Message Templates
CREATE TABLE IF NOT EXISTS artist_message_templates (
  template_key TEXT PRIMARY KEY,
  template_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO artist_message_templates (template_key, template_text) VALUES 
('onboarding', ''),
('confirmation', '');
