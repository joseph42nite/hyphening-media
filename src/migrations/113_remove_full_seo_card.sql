-- 113_remove_full_seo_card.sql
-- The Full card ran claude-seo's seo-audit, which re-runs technical, content,
-- schema, sitemap, performance, backlinks and the rest in one shallow pass.
-- Each of those has its own card on its own cadence, so Full only repeated
-- them. The SEO Monitor's cards and Tanner's night queue (seoNight.dueSkills)
-- both come from this table, so removing the row removes the card and stops
-- it being queued. Past 'full' audits stay in seo_audits as history.
DELETE FROM agent_run_config WHERE audit_type = 'full';
