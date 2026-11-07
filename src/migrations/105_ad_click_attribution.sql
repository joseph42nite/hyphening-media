-- Migration: 105_ad_click_attribution.sql
--
-- Where a lead or contact click came from, resolved at capture time by
-- src/services/attribution.js.
--
--   source_label          what the page sent as campaign_name (its own label);
--                         campaign_name now holds the resolved campaign
--   external_campaign_id  the ad platform's campaign ID, from gad_campaignid /
--                         campaign_id / utm_id in the page URL
--   click_id              gclid, gbraid, wbraid or fbclid
--   page_url              (leads only; clicks already had it)

ALTER TABLE campaign_leads ADD COLUMN page_url TEXT;
ALTER TABLE campaign_leads ADD COLUMN source_label TEXT;
ALTER TABLE campaign_leads ADD COLUMN external_campaign_id TEXT;
ALTER TABLE campaign_leads ADD COLUMN click_id TEXT;

ALTER TABLE landing_contact_clicks ADD COLUMN source_label TEXT;
ALTER TABLE landing_contact_clicks ADD COLUMN external_campaign_id TEXT;
ALTER TABLE landing_contact_clicks ADD COLUMN click_id TEXT;

-- Back-fill the clicks recorded before this: every one kept its full page URL,
-- and Google's own gad_campaignid parameter is in it. Leads cannot be
-- back-filled — the lead form never sent a URL.
UPDATE landing_contact_clicks
SET source_label = campaign_name,
    external_campaign_id = (
      SELECT CASE WHEN INSTR(rest, '&') > 0 THEN SUBSTR(rest, 1, INSTR(rest, '&') - 1) ELSE rest END
      FROM (SELECT SUBSTR(page_url, INSTR(page_url, 'gad_campaignid=') + 15) AS rest)
    )
WHERE page_url LIKE '%gad_campaignid=%';

UPDATE landing_contact_clicks
SET click_id = (
      SELECT CASE WHEN INSTR(rest, '&') > 0 THEN SUBSTR(rest, 1, INSTR(rest, '&') - 1) ELSE rest END
      FROM (SELECT SUBSTR(page_url, INSTR(page_url, 'gclid=') + 6) AS rest)
    )
WHERE page_url LIKE '%gclid=%';

-- The resolved campaign name, only where the ID belongs to this client's own
-- synced campaigns. An ID with no match keeps the page's label.
UPDATE landing_contact_clicks
SET campaign_name = (
      SELECT a.ad_campaign_name FROM marketing_ad_campaigns a
      WHERE a.client_id = landing_contact_clicks.client_id
        AND a.external_campaign_id = landing_contact_clicks.external_campaign_id
      ORDER BY COALESCE(NULLIF(a.month, ''), SUBSTR(a.created_at, 1, 7)) DESC, a.id DESC
      LIMIT 1
    )
WHERE external_campaign_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM marketing_ad_campaigns a
    WHERE a.client_id = landing_contact_clicks.client_id
      AND a.external_campaign_id = landing_contact_clicks.external_campaign_id
  );

CREATE INDEX IF NOT EXISTS idx_campaign_leads_ext_campaign ON campaign_leads(client_id, external_campaign_id);
