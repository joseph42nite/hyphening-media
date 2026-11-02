-- Migration 093: Public website lead intake
--
-- Website forms (homepage footer, Kage partner form) now POST to
-- /api/public/leads instead of only showing a thank-you / opening mailto:.
-- The lead is saved before any email is attempted, so an SMTP failure never
-- loses it; notified_at / notify_error record how the alert to sales went.
--
-- Submissions that trip the bot heuristics are still stored, with
-- status = 'Spam' and the reason, so a false positive can be recovered from
-- the Ops Center rather than silently dropped. (Honeypot hits are not stored.)

ALTER TABLE leads ADD COLUMN source TEXT;        -- e.g. 'website:footer', 'website:kage'
ALTER TABLE leads ADD COLUMN spam_reason TEXT;   -- NULL for clean leads
ALTER TABLE leads ADD COLUMN notified_at TEXT;   -- when the email alert was sent
ALTER TABLE leads ADD COLUMN notify_error TEXT;  -- last SMTP error, if sending failed

CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
