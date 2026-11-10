-- 114_manual_tasks.sql
-- The Manual tasks tab (src/services/manualTasks.js): every open SEO or ads
-- finding a person has to do by hand, grouped by area, with an owner.
--
--   manual_area     where the work happens: offsite, gbp, google, content,
--                   ad_account, business, other. The night worker sets it when
--                   it sorts a finding as not_code; older rows fall back to the
--                   card that found them (manualTasks.js areaFor).
--   assigned_to     the staff email it's assigned to.
--   manual_note     why it was marked "Not doing", or a note on "Done".
--   manual_by / manual_at  who closed it from the tab, and when.
ALTER TABLE seo_recommendations ADD COLUMN manual_area TEXT;
ALTER TABLE seo_recommendations ADD COLUMN assigned_to TEXT;
ALTER TABLE seo_recommendations ADD COLUMN manual_note TEXT;
ALTER TABLE seo_recommendations ADD COLUMN manual_by TEXT;
ALTER TABLE seo_recommendations ADD COLUMN manual_at TEXT;

ALTER TABLE ads_recommendations ADD COLUMN manual_area TEXT;
ALTER TABLE ads_recommendations ADD COLUMN assigned_to TEXT;
ALTER TABLE ads_recommendations ADD COLUMN manual_note TEXT;
ALTER TABLE ads_recommendations ADD COLUMN manual_by TEXT;
ALTER TABLE ads_recommendations ADD COLUMN manual_at TEXT;
