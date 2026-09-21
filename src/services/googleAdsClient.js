/**
 * Google Ads API client.
 *
 * Deliberately built on fetch and a hand-rolled service-account JWT rather than
 * the official library. The whole surface we need is two GAQL queries against
 * one REST endpoint, and the official client pulls in gRPC, protobuf and a
 * large generated type tree to provide it.
 *
 * Auth is the same service account the SEO tooling already uses. Since the
 * developer-token sunset (September 2026) the API needs no developer-token
 * header at all: access is decided by the Cloud project that issued the
 * credentials, so a key from an approved project is the entire story. Verified
 * against the live account on 2026-09-21 — a request with no such header
 * succeeded once the project had Explorer access, and failed on the access
 * level, not the header, before that.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

// v25 was current when this was written. v22-v25 respond; v21 and older return
// a bare 404 with an empty body, which reads as a network fault rather than a
// retired version — so pinning the version is worth more than it looks.
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

/**
 * Google's channel type -> our `platform` column.
 *
 * YouTube matters here: a YouTube ad is a Google Ads VIDEO campaign, not a
 * separate product, so the same sync fills both platforms. Without this map
 * every video campaign would land as 'Google' and the YouTube card would stay
 * blocked while its spend sat in the account.
 *
 * DEMAND_GEN spans YouTube, Discover and Gmail. It is called Google rather
 * than YouTube because attributing mixed inventory to one surface would be a
 * guess, and the inventory split is not in the API response.
 */
const CHANNEL_TO_PLATFORM = {
  SEARCH: 'Google',
  SHOPPING: 'Google',
  DISPLAY: 'Google',
  PERFORMANCE_MAX: 'Google',
  SMART: 'Google',
  LOCAL: 'Google',
  LOCAL_SERVICES: 'Google',
  DISCOVERY: 'Google',
  DEMAND_GEN: 'Google',
  MULTI_CHANNEL: 'Google',
  VIDEO: 'YouTube',
};

export function platformForChannel(channelType) {
  return CHANNEL_TO_PLATFORM[channelType] || 'Google';
}

/**
 * The service account key, from the first place it is found.
 *
 * GOOGLE_ADS_SERVICE_ACCOUNT_KEY takes either a path or the key's JSON inline.
 * Inline matters for the server: the SEO tooling reads this key from a file in
 * a developer's home directory, and a deployed process has no such directory —
 * the first production sync failed for exactly that reason. An env var keeps
 * the credential out of the repo and out of a backup of it.
 *
 * Returns null when nothing is configured, so the caller can say which of the
 * places it looked were empty rather than throwing a bare file-not-found.
 */
export function findServiceAccountKey() {
  const inline = process.env.GOOGLE_ADS_SERVICE_ACCOUNT_KEY || '';
  if (inline.trim().startsWith('{')) {
    try {
      return { path: 'GOOGLE_ADS_SERVICE_ACCOUNT_KEY (inline)', key: JSON.parse(inline) };
    } catch (err) {
      throw new Error(`GOOGLE_ADS_SERVICE_ACCOUNT_KEY looks like inline JSON but does not parse: ${err.message}`);
    }
  }

  const candidates = [
    process.env.GOOGLE_ADS_SERVICE_ACCOUNT_KEY,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    // Where the SEO tooling keeps it on a developer machine. Last, so a server
    // that sets an env var is never surprised by a stray file.
    path.join(os.homedir(), '.config', 'claude-seo', 'service-account.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return { path: p, key: JSON.parse(fs.readFileSync(p, 'utf8')) };
      } catch (err) {
        throw new Error(`Service account key at ${p} is not readable JSON: ${err.message}`);
      }
    }
  }
  return { missing: candidates };
}

// Tokens last an hour. Cached because a sync of several clients would otherwise
// mint one per client, and the exchange is the slowest part of a short run.
let tokenCache = { token: null, expiresAt: 0 };

export async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const found = findServiceAccountKey();
  if (!found || found.missing) {
    // Names the paths actually checked. The previous message said only which
    // variables to set, which on a server where neither is set and no file
    // exists gives nothing to act on.
    const looked = (found?.missing || []).join(', ') || '(nothing configured)';
    throw new Error(
      'No Google service account key found. Set GOOGLE_ADS_SERVICE_ACCOUNT_KEY to the key\'s JSON ' +
      'or to a path on this machine. Looked in: ' + looked,
    );
  }

  const { key } = found;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    key.private_key,
    { algorithm: 'RS256' },
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);

  // Refreshed a minute early so a long sync cannot expire mid-run.
  tokenCache = { token: body.access_token, expiresAt: Date.now() + ((body.expires_in || 3600) - 60) * 1000 };
  return tokenCache.token;
}

const digits = (v) => (v == null ? null : String(v).replace(/\D/g, ''));

/**
 * Turns Google's error shape into the setup step that is actually missing.
 *
 * Three independent things can be wrong — the project's access level, the
 * service account's membership of the account, and the customer id — and all
 * three surface as an indistinguishable PERMISSION_DENIED. Naming the right one
 * is the difference between a five-minute fix and an afternoon.
 */
export function explainError(status, body) {
  const text = JSON.stringify(body || {});
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|only approved for use with test accounts/i.test(text)) {
    return 'The Cloud project can only reach test accounts. Apply for access in Cloud Console → Google Ads API Overview → Upgrade access level.';
  }
  if (/USER_PERMISSION_DENIED|NOT_ADS_USER/i.test(text)) {
    return 'The service account is not a user on this ad account. Add it in Google Ads → Admin → Access and security, with read-only access. If the account sits under a manager account, set that manager id on the client too.';
  }
  if (/CUSTOMER_NOT_FOUND/i.test(text)) {
    return 'That customer ID was not found. Use the 10-digit ID with no dashes.';
  }
  if (/SERVICE_DISABLED|Google Ads API has not been used/i.test(text)) {
    return 'The Google Ads API is not enabled on this Cloud project.';
  }
  if (status === 401) return 'The access token was rejected — check the service account key.';
  return null;
}

/**
 * Runs one GAQL query and returns every row, following pagination.
 *
 * Note there is no pageSize: the API rejects it on this endpoint outright,
 * which is a 400 that reads as a malformed query rather than an unsupported
 * option.
 */
export async function query(customerId, gaql, { loginCustomerId = null } = {}) {
  const token = await getAccessToken();
  const cid = digits(customerId);
  if (!cid) throw new Error('A 10-digit customer ID is required.');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Only sent if an installation still has one. Not required post-sunset.
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  // Required whenever the account is reached through a manager account. Its
  // absence fails as a permission error that never mentions the real cause.
  const login = digits(loginCustomerId);
  if (login) headers['login-customer-id'] = login;

  const rows = [];
  let pageToken = null;

  do {
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query: gaql, ...(pageToken ? { pageToken } : {}) }) },
    );
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const hint = explainError(res.status, body);
      const detail = body?.error?.message || JSON.stringify(body).slice(0, 200);
      const err = new Error(hint ? `${hint} (${detail})` : `Google Ads API ${res.status}: ${detail}`);
      err.status = res.status;
      err.actionable = !!hint;
      throw err;
    }

    rows.push(...(body.results || []));
    pageToken = body.nextPageToken || null;
  } while (pageToken);

  return rows;
}

/** Accounts this service account can see at all. Useful for setup checks. */
export async function listAccessibleCustomers() {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = explainError(res.status, body);
    throw new Error(hint || `listAccessibleCustomers failed (${res.status})`);
  }
  return (body.resourceNames || []).map(n => n.replace('customers/', ''));
}

/** Name, currency and timezone. Read before any sync — a non-INR account must
 *  not have its spend written into a column named _inr. */
export async function getAccountInfo(customerId, opts = {}) {
  const rows = await query(
    customerId,
    'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer',
    opts,
  );
  const c = rows[0]?.customer;
  if (!c) throw new Error(`No account details returned for ${customerId}.`);
  return {
    id: c.id,
    name: c.descriptiveName || null,
    currency: c.currencyCode || null,
    timeZone: c.timeZone || null,
    isManager: !!c.manager,
    isTest: !!c.testAccount,
  };
}

/** Campaign performance by month over a date range. One row per campaign-month. */
export async function getCampaignMonths(customerId, { since, until, ...opts } = {}) {
  const rows = await query(customerId, `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type, segments.month,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `, opts);

  return rows.map(r => ({
    campaignId: String(r.campaign.id),
    name: r.campaign.name,
    status: r.campaign.status,
    channelType: r.campaign.advertisingChannelType,
    platform: platformForChannel(r.campaign.advertisingChannelType),
    // segments.month is the first day of the month; we store 'YYYY-MM'.
    month: String(r.segments.month).slice(0, 7),
    // cost_micros is millionths of the ACCOUNT's currency, not always rupees.
    spend: Number(r.metrics?.costMicros || 0) / 1e6,
    impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0),
    // Fractional by design — Google models conversions. Never a lead count.
    conversions: Number(r.metrics?.conversions || 0),
  }));
}

/** Ad group performance by month. The level where the interesting spread lives:
 *  one ad group took ₹34,854 while another in the same campaign took ₹5,905. */
export async function getAdGroupMonths(customerId, { since, until, ...opts } = {}) {
  const rows = await query(customerId, `
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status,
           segments.month,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM ad_group
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `, opts);

  return rows.map(r => ({
    campaignId: String(r.campaign.id),
    campaignName: r.campaign.name,
    adGroupId: String(r.adGroup.id),
    name: r.adGroup.name,
    status: r.adGroup.status,
    month: String(r.segments.month).slice(0, 7),
    spend: Number(r.metrics?.costMicros || 0) / 1e6,
    impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0),
    conversions: Number(r.metrics?.conversions || 0),
  }));
}
