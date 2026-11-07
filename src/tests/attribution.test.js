import { describe, it, expect } from 'vitest';
import db from '../../database.js';
import { parseAdClick, resolveCampaign, attributionFor } from '../services/attribution.js';

// A real DentAlchemy click URL shape (IDs altered).
const GOOGLE_URL = 'https://ads.dentalchemy.in/?gad_source=1&gad_campaignid=24100646116&gbraid=0AAAABEVJU1F&gclid=Cj0KCQiA77DX';

describe('parseAdClick', () => {
  it("reads Google's campaign ID and click ID from the URL", () => {
    const c = parseAdClick(GOOGLE_URL);
    expect(c.external_campaign_id).toBe('24100646116');
    expect(c.gclid).toBe('Cj0KCQiA77DX');
    expect(c.click_id).toBe('Cj0KCQiA77DX');
  });

  it('reads a campaign ID sent by a final URL suffix', () => {
    const c = parseAdClick('https://x.example/?utm_campaign=Search%20%7C%20Generic&campaign_id=24087050844');
    expect(c.external_campaign_id).toBe('24087050844');
    expect(c.utm_campaign).toBe('Search | Generic');
  });

  it('prefers fields the page posted over the URL', () => {
    const c = parseAdClick('https://x.example/?utm_campaign=from-url', { utm_campaign: 'from-field' });
    expect(c.utm_campaign).toBe('from-field');
  });

  it('returns null for a page with no ad parameters, or no URL at all', () => {
    expect(parseAdClick('https://x.example/about')).toBeNull();
    expect(parseAdClick(null)).toBeNull();
    expect(parseAdClick('not a url')).toBeNull();
  });

  it('ignores a campaign ID that is not numeric', () => {
    expect(parseAdClick('https://x.example/?campaign_id=spring').external_campaign_id).toBeNull();
  });

  it('records an fbclid as the click ID when there is no Google one', () => {
    expect(parseAdClick('https://x.example/?fbclid=IwAR123').click_id).toBe('IwAR123');
  });
});

describe('resolveCampaign', () => {
  // Read from the data rather than created, so these tests never write to the
  // database the dashboard reads.
  const synced = db.prepare(`
    SELECT client_id, external_campaign_id, ad_campaign_name FROM marketing_ad_campaigns
    WHERE external_campaign_id IS NOT NULL LIMIT 1
  `).get();

  it("resolves a campaign ID to that client's own campaign", () => {
    if (!synced) return;
    const r = resolveCampaign(synced.client_id, { external_campaign_id: synced.external_campaign_id });
    expect(r.name).toBe(synced.ad_campaign_name);
  });

  it("never resolves another client's campaign ID", () => {
    if (!synced) return;
    expect(resolveCampaign(-1, { external_campaign_id: synced.external_campaign_id })).toBeNull();
  });

  it('keeps the page label when nothing resolves, and always records it', () => {
    const a = attributionFor(-1, { pageUrl: GOOGLE_URL, sentCampaignName: 'Landing Page' });
    expect(a.campaign_name).toBe('Landing Page');
    expect(a.source_label).toBe('Landing Page');
    expect(a.external_campaign_id).toBe('24100646116');
    expect(a.click_id).toBe('Cj0KCQiA77DX');
  });
});
