-- Migration: 047_seed_client_website_urls.sql

UPDATE crm_clients SET website_url = 'https://www.drdivyasharma.com' WHERE id = 1;
UPDATE crm_clients SET website_url = 'https://janyafertility.in' WHERE id = 2;
UPDATE crm_clients SET website_url = 'https://dentalchemy.in' WHERE id = 3;
UPDATE crm_clients SET website_url = 'https://tbchsr.com' WHERE id = 4;
UPDATE crm_clients SET website_url = 'https://tbckbh.com' WHERE id = 5;
UPDATE crm_clients SET website_url = 'https://zaffran.com' WHERE id = 6;
