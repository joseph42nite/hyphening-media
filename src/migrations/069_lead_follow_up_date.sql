-- Migration: 069_lead_follow_up_date.sql
-- Records when a lead marked "Follow Up" is due to be contacted again.
--
-- "Follow Up" is the default appointment status, so it is where most leads sit,
-- and nothing recorded when to come back to them. appointment_date exists but is
-- only written when the status is "Booked" — the route nulls it otherwise — so
-- it cannot carry this without conflating a confirmed appointment with an
-- intention to call again.
--
-- A date rather than a timestamp: a follow-up is due on a day, and asking for a
-- time invites a precision nobody keeps to.

ALTER TABLE campaign_leads ADD COLUMN follow_up_date TEXT;

-- Due and overdue follow-ups are read on every portal load, filtered by date
-- across a client's leads.
CREATE INDEX IF NOT EXISTS idx_campaign_leads_follow_up
  ON campaign_leads(client_id, follow_up_date);
