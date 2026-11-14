-- 119_fix_note.sql
-- 007's instructions for a "Fix tonight" change: how it should be done, what
-- to keep, which facts to use. Typed in the portal when approving the fix
-- (SeoNightDrawer, Manual tasks), passed to the night worker's fix prompt,
-- and shown next to the fix in the morning so it can be checked against.
-- NULL = approved without a note, exactly as before.

ALTER TABLE seo_recommendations ADD COLUMN fix_note TEXT;
ALTER TABLE ads_recommendations ADD COLUMN fix_note TEXT;
