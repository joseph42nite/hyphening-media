-- Records every time a client opens a lead's phone or WhatsApp from the portal.
-- One row per click rather than a counter column, so the totals can later be
-- sliced by date or channel without a second migration.
CREATE TABLE IF NOT EXISTS lead_contact_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'whatsapp')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  -- A deleted lead takes its clicks with it, the same way its own row leaves no
  -- trace in the counts above the table.
  FOREIGN KEY (lead_id) REFERENCES campaign_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_clicks_client ON lead_contact_clicks(client_id);
CREATE INDEX IF NOT EXISTS idx_lead_clicks_lead ON lead_contact_clicks(lead_id);
