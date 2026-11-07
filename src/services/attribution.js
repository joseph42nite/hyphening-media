/**
 * Which ad campaign sent a lead or a click.
 *
 * Landing pages post the page's own label as `campaign_name` ("DentAlchemy
 * Landing Page — Hennur & Kothanur"), which matches no campaign, so every lead
 * arrived unattributed and no campaign could be judged on cost per lead. The
 * campaign was in the page URL all along: Google appends `gad_campaignid` (and
 * a click ID) to every ad click, and that ID is the one the Ads sync stores as
 * `external_campaign_id`.
 *
 * So attribution is resolved here, once, when a lead or click is captured, and
 * the real campaign name is written to `campaign_name`. Every reader — the fact
 * pack, the Marketing Data tab, the client portal — already matches leads to
 * campaigns by that name, so they all agree without a second matching rule.
 * The page's own label is kept in `source_label`.
 */

import db from '../../database.js';

const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid'];
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];

/**
 * Ad parameters from a landing-page URL, plus any sent as separate fields.
 *
 * `fields` wins over the URL: a page that reads the parameters itself and posts
 * them is saying something more deliberate than the address bar. Returns null
 * when nothing ad-related is present.
 */
export function parseAdClick(pageUrl, fields = {}) {
  let params = null;
  if (typeof pageUrl === 'string' && pageUrl) {
    try { params = new URL(pageUrl).searchParams; } catch { params = null; }
  }
  const pick = (key) => {
    const explicit = fields?.[key];
    if (explicit != null && String(explicit).trim() !== '') return String(explicit).trim();
    const fromUrl = params?.get(key);
    return fromUrl && fromUrl.trim() ? fromUrl.trim() : null;
  };

  const out = {};
  for (const key of [...CLICK_IDS, ...UTM, 'gad_campaignid', 'campaign_id']) {
    const v = pick(key);
    if (v) out[key] = v;
  }
  if (!Object.keys(out).length) return null;

  // The numeric campaign ID, from whichever parameter carried it. utm_id and
  // campaign_id are what a final URL suffix like `campaign_id={campaignid}`
  // produces; gad_campaignid is what Google adds on its own.
  const id = [out.gad_campaignid, out.campaign_id, out.utm_id].find(v => /^\d{6,}$/.test(v || ''));
  out.external_campaign_id = id || null;
  out.click_id = CLICK_IDS.map(k => out[k]).find(Boolean) || null;
  return out;
}

/**
 * The client's campaign a parsed click belongs to, or null.
 *
 * By ID first, since a campaign can be renamed and its ID cannot; then by an
 * exact `utm_campaign` name. Only the client's own campaigns are considered —
 * a campaign ID from another client's account must never attribute here.
 */
export function resolveCampaign(clientId, click) {
  if (!click) return null;
  if (click.external_campaign_id) {
    const row = db.prepare(`
      SELECT ad_campaign_name, platform, external_campaign_id FROM marketing_ad_campaigns
      WHERE client_id = ? AND external_campaign_id = ?
      ORDER BY COALESCE(NULLIF(month, ''), SUBSTR(created_at, 1, 7)) DESC, id DESC LIMIT 1
    `).get(clientId, click.external_campaign_id);
    if (row) return { name: row.ad_campaign_name, platform: row.platform, external_campaign_id: row.external_campaign_id };
  }
  if (click.utm_campaign) {
    const row = db.prepare(`
      SELECT ad_campaign_name, platform, external_campaign_id FROM marketing_ad_campaigns
      WHERE client_id = ? AND LOWER(TRIM(ad_campaign_name)) = LOWER(TRIM(?))
      ORDER BY COALESCE(NULLIF(month, ''), SUBSTR(created_at, 1, 7)) DESC, id DESC LIMIT 1
    `).get(clientId, click.utm_campaign);
    if (row) return { name: row.ad_campaign_name, platform: row.platform, external_campaign_id: row.external_campaign_id || null };
  }
  return null;
}

/**
 * Everything a capture route stores about where a lead or click came from.
 *
 * `campaign_name` is the resolved campaign when there is one, otherwise what
 * the page sent. `source_label` is always what the page sent, so nothing the
 * page said is lost by resolving it.
 */
export function attributionFor(clientId, { pageUrl = null, sentCampaignName = null, fields = {} } = {}) {
  const click = parseAdClick(pageUrl, fields);
  const campaign = resolveCampaign(clientId, click);
  return {
    campaign_name: campaign?.name || sentCampaignName || null,
    source_label: sentCampaignName || null,
    platform: campaign?.platform || null,
    external_campaign_id: campaign?.external_campaign_id || click?.external_campaign_id || null,
    click_id: click?.click_id || null,
    page_url: typeof pageUrl === 'string' && pageUrl ? pageUrl.slice(0, 2000) : null,
  };
}
