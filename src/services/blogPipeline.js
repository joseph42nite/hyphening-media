// Per-client blog pipeline settings (migration 094), the client's publishing
// key (095) and the one read every worker and bot uses: buildBlogConfig().
//
// Shared by the admin routes (src/routes/clients.js) and the client portal
// (src/routes/portal.js), same reason as onboardingFields.js: one list, so the
// two can't drift.

import db from '../../database.js';
import { encrypt, decrypt } from './encryption.js';
import { getMode } from './automationMode.js';
import { ONBOARDING_FIELDS, ONBOARDING_JSON_FIELDS } from './onboardingFields.js';

export const PUBLISH_TARGETS = ['hyphening_webhook', 'cms_api', 'repo_file', 'handoff'];
export const REVIEW_OPTIONS = ['none', 'client', 'clinician'];
export const COMPLIANCE_PROFILES = ['general', 'healthcare'];
export const PUBLISH_MODES = ['approve_each', 'approve_batch'];
export const CREDENTIAL_KINDS = ['wordpress', 'custom'];

// Quality bar per compliance profile (decision 0.4, 2026-11-03).
export const QUALITY_BAR = { general: 71, healthcare: 80 };

// Admin-only settings. Order is the order the form shows them.
export const PIPELINE_FIELDS = [
  'blog_publish_target', 'repo_path', 'blog_site_url', 'blog_languages',
  'blog_audio_enabled', 'blog_review_required', 'blog_compliance_profile',
  'blog_author_name', 'blog_reviewer_name', 'blog_posts_per_month', 'blog_publish_mode',
];

// What the client can fill in from the portal. Requests only.
export const PREFERENCE_FIELDS = ['blog_pref_reviewer_name', 'blog_pref_topics_avoid', 'blog_pref_requests'];

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * Validate and normalise an admin update. Returns { updates } with only the
 * fields that were sent, or { error } naming the first bad one.
 */
export function validatePipelineInput(body) {
  const updates = {};
  for (const field of PIPELINE_FIELDS) {
    if (body?.[field] === undefined) continue;
    let val = blankToNull(body[field]);

    switch (field) {
      case 'blog_publish_target':
        if (!PUBLISH_TARGETS.includes(val)) return { error: `${field} must be one of: ${PUBLISH_TARGETS.join(', ')}` };
        break;
      case 'blog_review_required':
        if (!REVIEW_OPTIONS.includes(val)) return { error: `${field} must be one of: ${REVIEW_OPTIONS.join(', ')}` };
        break;
      case 'blog_compliance_profile':
        if (!COMPLIANCE_PROFILES.includes(val)) return { error: `${field} must be one of: ${COMPLIANCE_PROFILES.join(', ')}` };
        break;
      case 'blog_publish_mode':
        if (!PUBLISH_MODES.includes(val)) return { error: `${field} must be one of: ${PUBLISH_MODES.join(', ')}` };
        break;
      case 'blog_audio_enabled':
        val = val ? 1 : 0;
        break;
      case 'blog_posts_per_month':
        val = Number(val ?? 0);
        if (!Number.isInteger(val) || val < 0 || val > 60) return { error: `${field} must be a whole number from 0 to 60` };
        break;
      case 'blog_languages': {
        const list = Array.isArray(val) ? val : String(val ?? '').split(/[\s,]+/);
        const codes = [...new Set(list.map((c) => String(c).trim()).filter(Boolean))];
        if (codes.length === 0) codes.push('en');
        const bad = codes.find((c) => !LANGUAGE_CODE.test(c));
        if (bad) return { error: `blog_languages: "${bad}" is not a language code (e.g. en, hi, kn, en-IN)` };
        val = JSON.stringify(codes);
        break;
      }
      case 'blog_site_url':
        if (val !== null && !/^https?:\/\/\S+$/i.test(val)) return { error: `${field} must start with http:// or https://` };
        break;
      case 'repo_path':
        if (val !== null && !val.startsWith('/')) return { error: `${field} must be an absolute path on the Mac` };
        break;
      default:
        if (val !== null) val = String(val).trim().slice(0, 200);
    }
    updates[field] = val;
  }
  return { updates };
}

export function validatePreferenceInput(body) {
  const updates = {};
  for (const field of PREFERENCE_FIELDS) {
    if (body?.[field] === undefined) continue;
    const val = blankToNull(body[field]);
    updates[field] = val === null ? null : String(val).trim().slice(0, 2000);
  }
  return { updates };
}

/** Status of the client's publishing key. Never the secret. */
export function getCredentialStatus(clientId) {
  const row = db.prepare(`
    SELECT kind, endpoint_url, username, last4, updated_at, updated_by
    FROM client_publish_credentials WHERE client_id = ?
  `).get(clientId);
  return row ? { set: true, ...row } : { set: false };
}

/**
 * Store (or replace) a client's publishing key, encrypted. Throws a
 * KeyMissingError when CLIENT_CREDENTIALS_KEY isn't configured, so the route
 * can say so instead of storing anything in the clear.
 */
export class KeyMissingError extends Error {}

export function saveCredential(clientId, { kind, endpoint_url, username, secret }, actorEmail) {
  const key = process.env.CLIENT_CREDENTIALS_KEY;
  if (!key) throw new KeyMissingError('CLIENT_CREDENTIALS_KEY is not set on the server');
  const secret_enc = encrypt(String(secret), key);
  const last4 = String(secret).slice(-4);
  db.prepare(`
    INSERT INTO client_publish_credentials (client_id, kind, endpoint_url, username, secret_enc, last4, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(client_id) DO UPDATE SET
      kind = excluded.kind, endpoint_url = excluded.endpoint_url, username = excluded.username,
      secret_enc = excluded.secret_enc, last4 = excluded.last4,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(clientId, kind, endpoint_url, blankToNull(username) ?? null, secret_enc, last4, actorEmail || null);
  return getCredentialStatus(clientId);
}

export function validateCredentialInput(body) {
  const { kind, endpoint_url, username, secret } = body || {};
  if (!CREDENTIAL_KINDS.includes(kind)) return { error: `kind must be one of: ${CREDENTIAL_KINDS.join(', ')}` };
  if (!/^https:\/\/\S+$/i.test(endpoint_url || '')) return { error: 'endpoint_url must be an https:// URL' };
  if (typeof secret !== 'string' || secret.trim().length < 8) return { error: 'secret must be at least 8 characters' };
  if (kind === 'wordpress' && !username) return { error: 'WordPress needs the username the Application Password belongs to' };
  return { value: { kind, endpoint_url: endpoint_url.replace(/\/+$/, ''), username, secret: secret.trim() } };
}

const parseJsonArray = (text) => {
  try {
    const arr = JSON.parse(text || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/**
 * Everything a blog/SEO worker or bot needs about one client, in one object.
 * No secrets: the publishing key appears as its status only.
 */
export function buildBlogConfig(clientId) {
  const row = db.prepare(`
    SELECT id, name, client_type, is_active, website_url, gsc_property, ga4_property_id,
           blog_enabled, seo_enabled, ads_enabled, brand_onboarded_at, blog_prefs_updated_at,
           ${ONBOARDING_FIELDS.join(', ')}, ${PIPELINE_FIELDS.join(', ')}, ${PREFERENCE_FIELDS.join(', ')}
    FROM crm_clients WHERE id = ?
  `).get(clientId);
  if (!row) return null;

  const onboarding = {};
  for (const f of ONBOARDING_FIELDS) {
    onboarding[f] = ONBOARDING_JSON_FIELDS.includes(f) ? parseJsonArray(row[f]) : row[f];
  }
  const pipeline = {};
  for (const f of PIPELINE_FIELDS) pipeline[f] = row[f];
  pipeline.blog_languages = parseJsonArray(row.blog_languages);
  pipeline.blog_audio_enabled = !!row.blog_audio_enabled;
  pipeline.quality_bar = QUALITY_BAR[row.blog_compliance_profile] ?? QUALITY_BAR.general;

  const preferences = {};
  for (const f of PREFERENCE_FIELDS) preferences[f] = row[f];

  return {
    generated_at: new Date().toISOString(),
    client: {
      id: row.id, name: row.name, client_type: row.client_type, is_active: !!row.is_active,
      website_url: row.website_url, gsc_property: row.gsc_property || null, ga4_property_id: row.ga4_property_id || null,
    },
    flags: { blog_enabled: !!row.blog_enabled, seo_enabled: !!row.seo_enabled, ads_enabled: !!row.ads_enabled },
    automation: { blog: getMode('blog'), seo: getMode('seo') },
    onboarding: { ...onboarding, brand_onboarded_at: row.brand_onboarded_at, filled: !!row.brand_onboarded_at },
    pipeline,
    preferences: { ...preferences, updated_at: row.blog_prefs_updated_at },
    // Not even the CMS username: this object goes to the read-only agent account.
    publish_credential: (({ set, kind, last4, updated_at }) => (set ? { set, kind, last4, updated_at } : { set }))(getCredentialStatus(clientId)),
  };
}

/**
 * A harmless authenticated read against the client's CMS, so a wrong key
 * shows up at onboarding rather than on publish day. Returns the HTTP status
 * only; the response body is never read back to the caller.
 */
export async function testCredential(clientId) {
  const row = db.prepare('SELECT kind, endpoint_url, username, secret_enc FROM client_publish_credentials WHERE client_id = ?').get(clientId);
  if (!row) return { ok: false, error: 'No publishing key saved for this client' };
  const key = process.env.CLIENT_CREDENTIALS_KEY;
  if (!key) throw new KeyMissingError('CLIENT_CREDENTIALS_KEY is not set on the server');

  const secret = decrypt(row.secret_enc, key);
  const url = row.kind === 'wordpress' ? `${row.endpoint_url}/wp-json/wp/v2/users/me` : row.endpoint_url;
  const headers = row.kind === 'wordpress'
    ? { Authorization: `Basic ${Buffer.from(`${row.username}:${secret}`).toString('base64')}` }
    : { Authorization: `Bearer ${secret}` };

  try {
    const res = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'No answer within 10 seconds' : 'Could not reach the endpoint' };
  }
}
