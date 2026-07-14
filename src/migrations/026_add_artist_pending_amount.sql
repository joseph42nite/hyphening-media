-- Migration: 026_add_artist_pending_amount.sql
-- total_amount_pending_inr is already added in 001_init.sql, making this a no-op to prevent duplicate column errors in clean installations.
SELECT 1;
