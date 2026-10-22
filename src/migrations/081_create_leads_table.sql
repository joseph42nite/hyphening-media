-- Migration 081: Create leads table for agency sales CRM
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  company_name TEXT,
  location TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  follow_up_date TEXT, -- YYYY-MM-DD format
  status TEXT NOT NULL DEFAULT 'New', -- 'New', 'Follow Up', 'Contacted', 'Proposal Sent', 'Converted', 'Lost'
  industry TEXT, -- 'FnB', 'Healthcare', 'Interior Designers', etc.
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
