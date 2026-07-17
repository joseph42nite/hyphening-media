-- Migration: 048_add_page_url_to_seo_recommendations.sql
ALTER TABLE seo_recommendations ADD COLUMN page_url TEXT;
