-- Migration: 058_add_month_to_ad_campaigns.sql
-- Adds month column (YYYY-MM) to marketing_ad_campaigns table for Month-on-Month performance tracking

ALTER TABLE marketing_ad_campaigns ADD COLUMN month TEXT;

-- Update existing rows to default month based on created_at
UPDATE marketing_ad_campaigns 
SET month = strftime('%Y-%m', created_at) 
WHERE month IS NULL OR month = '';

-- Create index on client_id and month
CREATE INDEX IF NOT EXISTS idx_ads_client_month ON marketing_ad_campaigns(client_id, month);
