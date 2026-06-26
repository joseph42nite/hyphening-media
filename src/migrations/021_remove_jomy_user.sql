-- Migration: 021_remove_jomy_user.sql
-- Delete Jomy George admin user from the database.
DELETE FROM users WHERE email = 'admin@hyphening.com' OR name = 'Jomy George';
