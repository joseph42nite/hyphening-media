-- Marketing Ops Center — Rename Video Editor to Ashu, Social Media Manager to Omkar
-- Migration: 031_rename_ops_staff.sql

UPDATE users SET name = 'Ashu' WHERE email = 'editor@hyphening.com';
UPDATE users SET name = 'Omkar' WHERE email = 'social@hyphening.com';
