-- Add treatment_type column to campaign_leads for tracking medical/dental/service treatments
ALTER TABLE campaign_leads ADD COLUMN treatment_type TEXT;
