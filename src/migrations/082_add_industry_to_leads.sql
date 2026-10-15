-- Migration 082: Add industry / sector (FnB, Healthcare) to leads table
ALTER TABLE leads ADD COLUMN industry TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
