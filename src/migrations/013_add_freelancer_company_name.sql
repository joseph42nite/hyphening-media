-- Migration: 013_add_freelancer_company_name.sql
-- Alter freelancers table to add a nullable company_name column.

ALTER TABLE freelancers ADD COLUMN company_name TEXT;
