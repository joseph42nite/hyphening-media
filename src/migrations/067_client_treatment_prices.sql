-- Migration: 067_client_treatment_prices.sql
-- Values a booking by what it was actually for.
--
-- ROAS has been revenue_generated / spend, where revenue_generated is typed in
-- by hand per campaign. Nobody knows campaign-level revenue for a clinic, so the
-- field is guessed or left at zero and ROAS is the least trustworthy column on
-- the leaderboard.
--
-- campaign_leads already records treatment_type per lead — Janya's bookings are
-- tagged IVF Treatment, IVF Consultation, IUI Evaluation, Male Infertility — so
-- the estimate does not need a per-client average. Averaging would smear a cycle
-- and a consultation into one number: her July bookings (consultation + male
-- infertility) and August bookings (IVF treatment + IUI) are two apiece and
-- close to an order of magnitude apart in value. A flat average shows those
-- months as identical.
--
-- Prices are per client because the same procedure name is priced differently by
-- different practices. crm_clients.default_booking_value_inr covers bookings
-- whose treatment_type is null or not yet priced, so they do not silently count
-- as zero; the API reports how many bookings fell back so the gap stays visible
-- rather than quietly depressing ROAS.

CREATE TABLE IF NOT EXISTS client_treatment_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  treatment_type TEXT NOT NULL,
  price_inr REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (client_id, treatment_type),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_treatment_prices_client
  ON client_treatment_prices(client_id);

ALTER TABLE crm_clients ADD COLUMN default_booking_value_inr REAL;
