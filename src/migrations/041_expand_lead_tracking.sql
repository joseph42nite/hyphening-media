-- Alter campaign_leads to support detailed progressive lead tracking
ALTER TABLE campaign_leads ADD COLUMN qualification_status TEXT CHECK (qualification_status IN ('Pending', 'Qualified', 'Disqualified')) DEFAULT 'Pending';
ALTER TABLE campaign_leads ADD COLUMN call_outcome TEXT CHECK (call_outcome IN ('Pending', 'Picked Up', 'No Answer', 'Other')) DEFAULT 'Pending';
ALTER TABLE campaign_leads ADD COLUMN appointment_status TEXT CHECK (appointment_status IN ('Pending', 'Booked', 'Not Booked')) DEFAULT 'Pending';
ALTER TABLE campaign_leads ADD COLUMN appointment_date TEXT DEFAULT NULL;

-- Migrate existing data based on legacy lead_status
UPDATE campaign_leads SET qualification_status = 'Qualified' WHERE lead_status = 'Qualified';
UPDATE campaign_leads SET qualification_status = 'Qualified', call_outcome = 'Picked Up', appointment_status = 'Booked' WHERE lead_status = 'Appointment Booked';
UPDATE campaign_leads SET qualification_status = 'Disqualified' WHERE lead_status = 'Rejected';
