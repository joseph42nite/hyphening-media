/**
 * GA4 Data API, read-only, through the same service account and token code as
 * the Google Ads client (getAccessToken in googleAdsClient.js) — one Google
 * identity for Ads, GA4 and the SEO tooling, not a second auth module.
 *
 * Exists for one number the ads fleet lacked: sessions on the landing page by
 * channel. claude-seo's ga4_report.py is filtered to organic traffic, so paid
 * sessions — the denominator for contact clicks and form leads — needed this.
 */

import { getAccessToken } from './googleAdsClient.js';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

async function runReport(propertyId, body) {
  const pid = String(propertyId || '').replace(/\D/g, '');
  if (!pid) throw new Error('A numeric GA4 property ID is required.');
  const token = await getAccessToken(SCOPE);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 200);
    // The usual cause, and one the API words unhelpfully.
    const hint = res.status === 403 ? 'The service account has no access to this GA4 property: add it as a Viewer in GA4 Admin → Property access management. ' : '';
    throw new Error(`${hint}GA4 ${res.status}: ${msg}`);
  }
  return json.rows || [];
}

/**
 * Sessions by month, host and default channel group. The host matters because
 * one property often holds several sites (dentalchemy.in and ads.dentalchemy.in).
 */
export async function getSessionMonths(propertyId, { since, until }) {
  const rows = await runReport(propertyId, {
    dateRanges: [{ startDate: since, endDate: until }],
    dimensions: [{ name: 'yearMonth' }, { name: 'hostName' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
    limit: 10000,
  });
  return rows.map(r => {
    const [ym, host, channel] = r.dimensionValues.map(d => d.value);
    const [sessions, engaged, keyEvents] = r.metricValues.map(m => Number(m.value || 0));
    return { month: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`, host, channel, sessions, engagedSessions: engaged, keyEvents };
  });
}
