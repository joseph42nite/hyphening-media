-- Call and WhatsApp taps on the client's own landing page.
--
-- These used to arrive through the lead capture webhook, which created a lead
-- row per tap: a visitor pressing a button is interest, not a captured lead,
-- and it buried the real leads under placeholder rows. Counted here instead.
--
-- Kept apart from lead_contact_clicks because the two answer different
-- questions and have no lead in common: this one is a visitor nobody can name,
-- that one is the client's staff working a lead that already exists.
CREATE TABLE IF NOT EXISTS landing_contact_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'whatsapp')),
  campaign_name TEXT,
  page_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_landing_clicks_client ON landing_contact_clicks(client_id);
