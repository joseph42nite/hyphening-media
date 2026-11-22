/**
 * Bing Webmaster Tools, for the SEO worker's capabilities report.
 * src/routes/seo.js unlocks the Bing card for a client only when this says the
 * key works and that client's site is verified under it.
 *
 * The key is read where claude-seo's own scripts read it (backlinks_auth.py),
 * so the probe and the skill can never disagree about whether one is set:
 *   1. ~/.config/claude-seo/backlinks-api.json  "bing_api_key"
 *   2. BING_WEBMASTER_API_KEY in ~/.claude/settings.json env (where the
 *      plugin's install.sh writes it), then in this process's env
 * It is never printed. Bing takes it as a query parameter, so request URLs are
 * never logged either.
 */

import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function bingKey(home = os.homedir()) {
  const cfg = readJson(path.join(home, '.config/claude-seo/backlinks-api.json'));
  if (cfg?.bing_api_key) return cfg.bing_api_key;
  const settings = readJson(path.join(home, '.claude/settings.json'));
  return settings?.env?.BING_WEBMASTER_API_KEY || process.env.BING_WEBMASTER_API_KEY || null;
}

/** example.com from any URL or bare host, without www. */
export function siteHost(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

/**
 * Whether Bing answers for this key, and whether `url`'s site is verified
 * under it. Uses GetUserSites, which is free. Never throws:
 * { available, verified?, reason? }   reason: missing | auth | other
 */
export async function probe(url, { key = bingKey(), fetchFn = fetch } = {}) {
  if (!key) return { available: false, reason: 'missing' };
  try {
    const res = await fetchFn(`${BASE}/GetUserSites?apikey=${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401 || res.status === 403) return { available: false, reason: 'auth' };
    if (!res.ok) return { available: false, reason: 'other', error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    const sites = Array.isArray(body?.d) ? body.d : [];
    const host = siteHost(url);
    const verified = !!host && sites.some((s) => siteHost(s?.Url) === host && s?.IsVerified !== false);
    return { available: true, verified };
  } catch (err) {
    return { available: false, reason: 'other', error: err.message };
  }
}
