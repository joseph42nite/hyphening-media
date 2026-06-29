-- Migration: 028_add_parent_id_to_crm_clients.sql
-- Add parent_id self-reference to crm_clients for parent company grouping

ALTER TABLE crm_clients ADD COLUMN parent_id INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL;
