-- Migration: 026_add_artist_pending_amount.sql
ALTER TABLE artists ADD COLUMN total_amount_pending_inr REAL DEFAULT 0;
