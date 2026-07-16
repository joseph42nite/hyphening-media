-- Disable foreign keys temporarily to recreate the table with updated check constraint
PRAGMA foreign_keys=OFF;

-- Create new table with updated CHECK constraint and DEFAULT value for appointment_status
CREATE TABLE IF NOT EXISTS campaign_leads_new (
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
  additional_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  qualification_status TEXT CHECK (qualification_status IN ('Pending', 'Qualified', 'Disqualified')) DEFAULT 'Pending',
  call_outcome TEXT CHECK (call_outcome IN ('Pending', 'Picked Up', 'No Answer', 'Other')) DEFAULT 'Pending',
  appointment_status TEXT CHECK (appointment_status IN ('Follow Up', 'Booked', 'Not Booked')) DEFAULT 'Follow Up',
  appointment_date TEXT,
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- Copy data from old table to new table, converting any 'Pending' appointment_status to 'Follow Up'
INSERT INTO campaign_leads_new (
  id, client_id, name, email, phone, platform, source, campaign_name, lead_status,
  rejection_reason, call_duration_seconds, additional_data, created_at, updated_at,
  qualification_status, call_outcome, appointment_status, appointment_date
)
SELECT 
  id, client_id, name, email, phone, platform, source, campaign_name, lead_status,
  rejection_reason, call_duration_seconds, additional_data, created_at, updated_at,
  qualification_status, call_outcome, 
  CASE WHEN appointment_status = 'Pending' THEN 'Follow Up' ELSE appointment_status END, 
  appointment_date
FROM campaign_leads;

-- Drop old table
DROP TABLE campaign_leads;

-- Rename new table to original
ALTER TABLE campaign_leads_new RENAME TO campaign_leads;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_leads_client ON campaign_leads(client_id);

-- Re-enable foreign keys
PRAGMA foreign_keys=ON;
