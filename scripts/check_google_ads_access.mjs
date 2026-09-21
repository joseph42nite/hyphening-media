#!/usr/bin/env node
/**
 * Answers one question: can this installation read Google Ads yet, and if not,
 * which of the setup steps is missing?
 *
 * Google Ads access has three independent parts, and a failure in any of them
 * surfaces as a similarly unhelpful permission error. Testing them separately
 * and naming the one that failed is the difference between a five-minute fix
 * and an afternoon.
 *
 *   1. A service account key this process can read.
 *   2. The Cloud project holding it has Google Ads API access at a level above
 *      Test — applied for on the Google Ads API Overview page in Cloud Console.
 *   3. The service account has been added as a user on each ad account.
 *
 * Read-only: it lists accessible customers and, when given one, reads a single
 * campaign row. It changes nothing.
 *
 *   node scripts/check_google_ads_access.mjs
 *   node scripts/check_google_ads_access.mjs --customer 1234567890
 *   node scripts/check_google_ads_access.mjs --customer 1234567890 --login 9876543210
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

// v25 is current. Probed 2026-09-21: v22 through v25 respond, v21 and older
// return a bare 404 with an empty body — which reads as a network fault rather
// than a retired version, so the default matters.
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const digits = (v) => (v ? String(v).replace(/\D/g, '') : null);

/** The same key the SEO tooling already uses, unless pointed elsewhere. */
function findKey() {
  const candidates = [
    process.env.GOOGLE_ADS_SERVICE_ACCOUNT_KEY,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(os.homedir(), '.config', 'claude-seo', 'service-account.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Service account -> access token. No user interaction, no refresh token. */
async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: key.client_email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    key.private_key,
    { algorithm: 'RS256' },
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Turns Google's error shape into the setup step that is actually missing. */
function diagnose(status, body) {
  const text = JSON.stringify(body);

  // The state a correctly-configured new project lands in: the service account
  // is on the account and the key works, but the project has never applied for
  // an access level, so every production account is refused.
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|only approved for use with test accounts/i.test(text)) {
    return [
      'The Cloud project has never applied for an access level, so it can only reach TEST accounts.',
      '',
      '    Cloud Console -> Google Ads API Overview -> Upgrade access level -> Apply for access',
      '',
      '    Explorer (2,880 operations/day) is granted automatically on submission and needs no',
      '    brand verification. A daily sync of a few clients uses single figures per day, so',
      '    Explorer is ample; Basic (15,000/day) requires brand verification and is only worth',
      '    the wait if this grows a lot.',
    ].join('\n  ');
  }
  if (/DEVELOPER_TOKEN_NOT_APPROVED|developer token is not approved/i.test(text)) {
    return 'The developer token is not approved for production. Post-sunset this is decided by the Cloud project instead — apply on the Google Ads API Overview page in Cloud Console.';
  }
  if (/DEVELOPER_TOKEN_PROHIBITED|developer-token|DeveloperTokenError/i.test(text)) {
    return 'Google still wants a developer-token header on this request. Set GOOGLE_ADS_DEVELOPER_TOKEN and re-run.';
  }
  if (/USER_PERMISSION_DENIED|NOT_ADS_USER/i.test(text)) {
    return 'The service account is not a user on that ad account. In Google Ads: Admin -> Access and security -> add the service account email with read-only access. If the account sits under a manager account, pass --login <MCC id> as well.';
  }
  if (/CUSTOMER_NOT_FOUND|CustomerError/i.test(text)) {
    return 'That customer ID was not found. Use the 10-digit ID with no dashes, and pass --login <MCC id> if you reach it through a manager account.';
  }
  if (status === 403 && /Google Ads API has not been used|SERVICE_DISABLED/i.test(text)) {
    return 'The Google Ads API is not enabled on this Cloud project. Enable it in the API Library.';
  }
  if (status === 401) {
    return 'The access token was rejected. Check the service account key is the one belonging to the project that has Google Ads access.';
  }
  return null;
}

async function callAds(url, token, { login = null, body = null } = {}) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Only sent when present. Post-sunset the header is no longer issued to new
  // projects; an installation that still has one keeps working by setting it.
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (login) headers['login-customer-id'] = login;

  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const line = (label, value) => console.log(`${label.padEnd(26)} ${value}`);
  console.log('\nGoogle Ads API access check\n' + '='.repeat(60));

  // 1. Key
  const keyPath = findKey();
  if (!keyPath) {
    console.log('\n✗ No service account key found.');
    console.log('  Looked at GOOGLE_ADS_SERVICE_ACCOUNT_KEY, GOOGLE_APPLICATION_CREDENTIALS,');
    console.log('  and ~/.config/claude-seo/service-account.json');
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  line('Key file', keyPath);
  line('Service account', key.client_email);
  line('Cloud project', key.project_id);
  line('API version', API_VERSION);
  // Confirmed empirically 2026-09-21: v25 accepted a request with no
  // developer-token header at all and failed on the access level instead, so
  // the header is genuinely gone for projects created after the sunset.
  line('Developer token header', process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? 'set' : 'not set (not required post-sunset)');

  // 2. Token
  let token;
  try {
    token = await getAccessToken(key);
    console.log('\n✓ Access token obtained.');
  } catch (err) {
    console.log(`\n✗ Could not get an access token.\n  ${err.message}`);
    process.exit(1);
  }

  // 3. Which accounts can it see? This alone separates "project has no access"
  //    from "service account is not on the account".
  const list = await callAds(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    token,
  );

  if (!list.ok) {
    console.log(`\n✗ listAccessibleCustomers failed (HTTP ${list.status}).`);
    const hint = diagnose(list.status, list.json);
    if (hint) console.log(`\n  → ${hint}`);
    console.log(`\n  Raw: ${JSON.stringify(list.json).slice(0, 600)}`);
    process.exit(1);
  }

  const names = list.json.resourceNames || [];
  console.log(`\n✓ ${names.length} account(s) visible to this service account:`);
  for (const n of names) console.log(`    ${n.replace('customers/', '')}`);

  if (!names.length) {
    console.log('\n  → The project has API access but the service account is not a user on any');
    console.log('    ad account yet. In Google Ads: Admin -> Access and security -> add');
    console.log(`    ${key.client_email} with read-only access.`);
    return;
  }

  // 4. Can it actually read campaign data? Visibility and readability are
  //    different permissions, and only the second one the sync needs.
  const customer = digits(arg('customer')) || names[0].replace('customers/', '');
  const login = digits(arg('login'));
  console.log(`\nReading one campaign row from ${customer}${login ? ` via manager ${login}` : ''}...`);

  const read = await callAds(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customer}/googleAds:search`,
    token,
    {
      login,
      body: {
        query: `SELECT customer.descriptive_name, customer.currency_code, customer.time_zone,
                       campaign.name, campaign.status, segments.month,
                       metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
                FROM campaign
                WHERE segments.date DURING LAST_30_DAYS
                LIMIT 3`,
      },
    },
  );

  if (!read.ok) {
    console.log(`\n✗ Campaign read failed (HTTP ${read.status}).`);
    const hint = diagnose(read.status, read.json);
    if (hint) console.log(`\n  → ${hint}`);
    console.log(`\n  Raw: ${JSON.stringify(read.json).slice(0, 600)}`);
    process.exit(1);
  }

  const rows = read.json.results || [];
  console.log(`\n✓ Read succeeded. ${rows.length} row(s) in the last 30 days.`);

  if (rows.length) {
    const c = rows[0].customer || {};
    line('\nAccount', c.descriptiveName || '(unnamed)');
    line('Currency', c.currencyCode || '?');
    line('Time zone', c.timeZone || '?');
    // Stated loudly: spend lands in a column named _inr, and a non-INR account
    // silently understates it by the exchange rate.
    if (c.currencyCode && c.currencyCode !== 'INR') {
      console.log(`\n  ⚠ This account bills in ${c.currencyCode}, not INR. The sync will refuse it`);
      console.log('    rather than write a converted guess into total_ad_spend_inr.');
    }
    console.log('');
    for (const r of rows) {
      const m = r.metrics || {};
      const spend = (Number(m.costMicros || 0) / 1e6).toFixed(2);
      console.log(`  ${r.segments?.month || '?'}  ${(r.campaign?.name || '?').slice(0, 34).padEnd(36)} ${spend.padStart(10)} ${String(m.impressions || 0).padStart(9)} imp ${String(m.clicks || 0).padStart(6)} clk`);
    }
  }

  console.log('\nEverything needed for the sync is in place.\n');
}

main().catch(err => { console.error('\nUnexpected error:', err.message); process.exit(1); });
