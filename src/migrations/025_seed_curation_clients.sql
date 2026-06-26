-- Migration: 025_seed_curation_clients.sql
-- Seed artist curation clients

INSERT INTO crm_clients (name, client_type)
SELECT 'TBC HSR', 'artist_curation'
WHERE NOT EXISTS (SELECT 1 FROM crm_clients WHERE name = 'TBC HSR' AND client_type = 'artist_curation');

INSERT INTO crm_clients (name, client_type)
SELECT 'TBC KBH', 'artist_curation'
WHERE NOT EXISTS (SELECT 1 FROM crm_clients WHERE name = 'TBC KBH' AND client_type = 'artist_curation');

INSERT INTO crm_clients (name, client_type)
SELECT 'Zaffran', 'artist_curation'
WHERE NOT EXISTS (SELECT 1 FROM crm_clients WHERE name = 'Zaffran' AND client_type = 'artist_curation');
