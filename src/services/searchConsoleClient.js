/**
 * Search Console Search Analytics API, read-only, through the same service
 * account and token code as Google Ads and GA4 (getAccessToken in
 * googleAdsClient.js).
 *
 * The property must be in the exact form stored in crm_clients.gsc_property:
 * 'sc-domain:example.com' or 'https://example.com/' (see migration 060).
 */

import { getAccessToken } from './googleAdsClient.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

async function searchAnalytics(property, body) {
  if (!property) throw new Error('A Search Console property is required.');
  const token = await getAccessToken(SCOPE);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 200);
    // 403 is nearly always the service account missing from the property.
    const hint = res.status === 403
      ? 'The service account has no access to this Search Console property: add it as a user in Search Console → Settings → Users and permissions. '
      : '';
    throw new Error(`${hint}Search Console ${res.status}: ${msg}`);
  }
  return json.rows || [];
}

/** Totals for a date range: { clicks, impressions, position }. */
export async function getTotals(property, { since, until }) {
  const rows = await searchAnalytics(property, { startDate: since, endDate: until, dataState: 'final' });
  const r = rows[0] || {};
  return { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? null };
}

/** One row per search query: { query, clicks, impressions, position }. */
export async function getQueries(property, { since, until, limit = 1000 }) {
  const rows = await searchAnalytics(property, {
    startDate: since, endDate: until, dimensions: ['query'], rowLimit: limit, dataState: 'final',
  });
  return rows.map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }));
}
