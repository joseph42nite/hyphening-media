-- Add lead_alerts_enabled column to crm_clients (1 = active, 0 = muted)
ALTER TABLE crm_clients ADD COLUMN lead_alerts_enabled INTEGER DEFAULT 1;

-- Create campaign_leads table
CREATE TABLE IF NOT EXISTS campaign_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  platform TEXT CHECK (platform IN ('YouTube', 'Meta', 'Google', 'Other')),
  source TEXT CHECK (source IN ('form', 'call')),
  campaign_name TEXT,
  lead_status TEXT CHECK (lead_status IN ('Pending', 'Qualified', 'Appointment Booked', 'Rejected')) DEFAULT 'Pending',
  rejection_reason TEXT,
  call_duration_seconds INTEGER,
  additional_data TEXT, -- JSON string for custom fields or raw payload
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Index for querying leads by client
CREATE INDEX IF NOT EXISTS idx_leads_client ON campaign_leads(client_id);
