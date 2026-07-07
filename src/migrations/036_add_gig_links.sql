-- Add Swiggy and Zomato links to gig_status table
ALTER TABLE gig_status ADD COLUMN swiggy_link TEXT;
ALTER TABLE gig_status ADD COLUMN zomato_link TEXT;
