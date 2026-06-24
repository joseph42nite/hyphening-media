-- Migration: 015_alter_venues_table.sql
-- Alter venues table to add client_id, poc_email, and social_links columns.

ALTER TABLE venues ADD COLUMN client_id INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL;
ALTER TABLE venues ADD COLUMN poc_email TEXT;
ALTER TABLE venues ADD COLUMN social_links TEXT;
