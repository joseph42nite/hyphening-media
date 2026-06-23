-- Migration: 004_add_monthly_report_fields.sql
-- Add all columns from the Monthly Report Google Sheet

ALTER TABLE marketing_monthly_report ADD COLUMN website_clicks TEXT;
ALTER TABLE marketing_monthly_report ADD COLUMN gmb_views INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN gmb_clicks INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN on_page_score TEXT;
ALTER TABLE marketing_monthly_report ADD COLUMN off_page INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN blogs INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN calls INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN directions INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN reviews INTEGER;
ALTER TABLE marketing_monthly_report ADD COLUMN avg_rating REAL;
ALTER TABLE marketing_monthly_report ADD COLUMN top_keywords TEXT;
ALTER TABLE marketing_monthly_report ADD COLUMN da INTEGER;
