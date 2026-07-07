PRAGMA foreign_keys = OFF;

-- Drop indexes
DROP INDEX IF EXISTS idx_gig_status_artist_id;
DROP INDEX IF EXISTS idx_gig_status_client_id;
DROP INDEX IF EXISTS idx_gig_status_venue_id;
DROP INDEX IF EXISTS idx_gig_status_planning_cycle_id;
DROP INDEX IF EXISTS idx_gig_status_date;

-- Rename old table
ALTER TABLE gig_status RENAME TO old_gig_status;

-- Create new table without planning_cycle_id column or foreign key
CREATE TABLE gig_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  artist_id INTEGER NOT NULL,
  venue_id INTEGER,
  gig_date TEXT NOT NULL,
  fee_inr REAL DEFAULT 0,
  advance_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Paid', 'Pending', 'Advance Paid', 'Cancelled', 'Hold', 'Confirmed')),
  confirmation_token TEXT,
  token_expires_at TEXT,
  swiggy_link TEXT,
  zomato_link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL
);

-- Copy data
INSERT INTO gig_status (id, client_id, artist_id, venue_id, gig_date, fee_inr, advance_paid, status, confirmation_token, token_expires_at, swiggy_link, zomato_link, created_at, updated_at)
SELECT id, client_id, artist_id, venue_id, gig_date, fee_inr, advance_paid, status, confirmation_token, token_expires_at, swiggy_link, zomato_link, created_at, updated_at
FROM old_gig_status;

-- Drop old table
DROP TABLE old_gig_status;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_gig_status_artist_id ON gig_status(artist_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_client_id ON gig_status(client_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_venue_id ON gig_status(venue_id);
CREATE INDEX IF NOT EXISTS idx_gig_status_date ON gig_status(gig_date DESC);

-- Drop planning cycles table
DROP TABLE IF EXISTS artist_planning_cycles;

PRAGMA foreign_keys = ON;
