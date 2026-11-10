/**
 * The "Google access" step of client onboarding: one place where a client
 * (in their portal) or 007 (in Clients) sees what Google access we need, and
 * presses one button to check it.
 *
 *   Search Console  client adds our service account as a user. The check finds
 *                   the property for the client's own website and saves it.
 *   GA4             client adds the same account as a Viewer and types the
 *                   property ID. The check saves it only if that property
 *                   records visits to the client's own website.
 *   Business Profile client invites our agency account as a Manager and says
 *                   so here. Google confirms it once the Business Profile API
 *                   is connected (later phase).
 *
 * Both checks are tied to the client's website so a client can never attach
 * another client's data to their reports, and failure messages never name
 * anyone else's sites.
 */

import db from '../../database.js';
import { findServiceAccountKey } from './googleAdsClient.js';
import { listSites } from './searchConsoleClient.js';
import { getSessionMonths } from './ga4Client.js';

const defaultSources = { listSites, getSessionMonths };

const host = (url) => {
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

/** Same site: equal hosts, or one a subdomain of the other (ads.example.in ~ example.in). */
export function sameSite(a, b) {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** The Search Console property for a website: a domain property first, then an exact URL prefix, then a related one. */
export function pickProperty(sites, websiteUrl) {
  const site = host(websiteUrl);
  const hostOfProp = (p) => (p.startsWith('sc-domain:') ? p.slice('sc-domain:'.length).toLowerCase() : host(p));
  const matches = sites.map(s => s.siteUrl).filter(p => sameSite(hostOfProp(p), site));
  return matches.find(p => p.startsWith('sc-domain:'))
    || matches.find(p => hostOfProp(p) === site)
    || matches[0]
    || null;
}

export function serviceAccountEmail() {
  try { return findServiceAccountKey()?.key?.client_email || null; } catch { return null; }
}

function clientRow(clientId) {
  const c = db.prepare('SELECT id, name, website_url, gsc_property, ga4_property_id, gbp_invite_sent_at FROM crm_clients WHERE id = ?').get(clientId);
  if (!c) throw new Error('Client not found');
  return c;
}

/** What the onboarding card shows. */
export function getGoogleAccess(clientId) {
  const c = clientRow(clientId);
  return {
    website_url: c.website_url,
    service_account_email: serviceAccountEmail(),
    agency_email: process.env.GBP_AGENCY_EMAIL || null,
    search_console: { connected: !!c.gsc_property, property: c.gsc_property || null },
    ga4: { connected: !!c.ga4_property_id, property_id: c.ga4_property_id || null },
    business_profile: { invite_sent_at: c.gbp_invite_sent_at || null, api_connected: false },
  };
}

function last30Days(now = new Date()) {
  const end = new Date(now.getTime() - 86400000);
  const start = new Date(end.getTime() - 29 * 86400000);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

/**
 * Runs both checks and saves whatever passes. `ga4_property_id` is the ID the
 * client typed; without it the saved one is re-checked.
 * Returns { search_console: { ok, message }, ga4: { ok, message }, access }.
 */
export async function checkGoogleAccess(clientId, { ga4_property_id: typed } = {}, { sources = defaultSources } = {}) {
  const c = clientRow(clientId);
  const site = host(c.website_url);
  const email = serviceAccountEmail() || 'our service account';
  const result = {};

  if (!site) {
    const msg = 'Add the website address to this client first.';
    return { search_console: { ok: false, message: msg }, ga4: { ok: false, message: msg }, access: getGoogleAccess(clientId) };
  }

  // Search Console: find it ourselves, so nothing typed can point elsewhere.
  try {
    const property = pickProperty(await sources.listSites(), c.website_url);
    if (property) {
      db.prepare("UPDATE crm_clients SET gsc_property = ?, updated_at = datetime('now') WHERE id = ?").run(property, clientId);
      result.search_console = { ok: true, message: `Connected: ${property}` };
    } else {
      result.search_console = { ok: false, message: `We can't see ${site} yet. In Search Console open Settings → Users and permissions → Add user, enter ${email} with Full permission, then check again.` };
    }
  } catch (err) {
    result.search_console = { ok: false, message: `Search Console could not be checked right now (${err.message}). Try again in a few minutes.` };
  }

  // GA4: the typed ID only counts if it records visits to this client's site.
  const pid = String(typed || c.ga4_property_id || '').replace(/\D/g, '');
  if (!pid) {
    result.ga4 = { ok: false, message: 'Enter your GA4 property ID (GA4 → Admin → Property details, a number like 358910776).' };
  } else {
    try {
      const rows = await sources.getSessionMonths(pid, last30Days());
      if (rows.some(r => sameSite(host(r.host), site))) {
        db.prepare("UPDATE crm_clients SET ga4_property_id = ?, updated_at = datetime('now') WHERE id = ?").run(pid, clientId);
        result.ga4 = { ok: true, message: `Connected: property ${pid}` };
      } else {
        result.ga4 = { ok: false, message: `GA4 property ${pid} has no visits to ${site} in the last 30 days. Check the ID belongs to this website.` };
      }
    } catch (err) {
      const noAccess = /403|no access|permission/i.test(err.message);
      result.ga4 = {
        ok: false,
        message: noAccess
          ? `We can't read GA4 property ${pid} yet. In GA4 open Admin → Property access management → Add users, enter ${email} as a Viewer, then check again.`
          : `GA4 could not be checked right now (${err.message}). Try again in a few minutes.`,
      };
    }
  }

  return { ...result, access: getGoogleAccess(clientId) };
}

/** The client says they've invited our agency account on their Business Profile. */
export function markGbpInviteSent(clientId) {
  clientRow(clientId);
  db.prepare("UPDATE crm_clients SET gbp_invite_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(clientId);
  return getGoogleAccess(clientId);
}
