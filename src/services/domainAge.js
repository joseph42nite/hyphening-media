/**
 * Marketing Ops Center — Email Domain Age
 * How long ago a lead's email domain was registered. Scam leads posing as a
 * real brand use a lookalike domain registered a day or two before they
 * write in (e.g. cocopat.us cloning cocopat.com, lead #79, 2026-11-08).
 *
 * RDAP first (rdap.org bootstrap); falls back to WHOIS on port 43 for TLDs
 * without RDAP (.us has none). Any failure returns null — the check must
 * never block or lose a lead.
 */

import net from 'net';

const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // domain -> { at, created }

// Mailbox providers: anyone can sign up, so the domain's age says nothing.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'outlook.com',
  'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.in', 'rediffmail.com', 'gmx.com',
  'mail.com', 'yandex.com',
]);

// Reserved names (RFC 2606/6761) used by tests and examples; never look these up.
const RESERVED = /(^|\.)(example\.(com|net|org)|test|invalid|localhost|example)$/i;

export function emailDomain(email) {
  const at = typeof email === 'string' ? email.lastIndexOf('@') : -1;
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

/** Pull a registration date out of an RDAP JSON body. */
export function parseRdapCreated(json) {
  const ev = (json?.events || []).find(e => e.eventAction === 'registration');
  const d = ev ? new Date(ev.eventDate) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Pull a registration date out of raw WHOIS text. */
export function parseWhoisCreated(text) {
  const m = String(text).match(/^\s*(?:Creation Date|Created On|Registered On|Registration Time|created|Domain Registration Date)\s*:\s*(.+)$/im);
  if (!m) return null;
  const d = new Date(m[1].trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Referral line in an IANA WHOIS answer, e.g. "whois: whois.nic.us". */
export function parseWhoisReferral(text) {
  const m = String(text).match(/^\s*(?:whois|refer)\s*:\s*(\S+)/im);
  return m ? m[1] : null;
}

function whoisQuery(host, query) {
  return new Promise((resolve) => {
    let buf = '';
    const sock = net.connect(43, host, () => sock.end(`${query}\r\n`));
    sock.setTimeout(LOOKUP_TIMEOUT_MS, () => { sock.destroy(); resolve(null); });
    sock.on('data', (d) => { buf += d; if (buf.length > 200_000) sock.destroy(); });
    sock.on('end', () => resolve(buf));
    sock.on('error', () => resolve(null));
  });
}

async function rdapCreated(domain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      // rdap.org (Cloudflare) answers Node's default client with a 403.
      headers: { Accept: 'application/rdap+json', 'User-Agent': 'HypheningOps-LeadCheck/1.0' },
    });
    if (!res.ok) return null;
    return parseRdapCreated(await res.json());
  } catch {
    return null;
  }
}

// WHOIS servers for TLDs without RDAP, so the common ones skip the IANA hop
// (whois.iana.org rate-limits and sometimes answers with nothing).
const WHOIS_SERVERS = { us: 'whois.nic.us' };
const referralCache = new Map(); // tld -> whois server

async function whoisServer(tld) {
  if (WHOIS_SERVERS[tld]) return WHOIS_SERVERS[tld];
  if (referralCache.has(tld)) return referralCache.get(tld);
  const iana = await whoisQuery('whois.iana.org', tld);
  const server = iana && parseWhoisReferral(iana);
  if (server) referralCache.set(tld, server);
  return server;
}

async function whoisCreated(domain) {
  const server = await whoisServer(domain.split('.').pop());
  if (!server) return null;
  const text = await whoisQuery(server, domain);
  return text ? parseWhoisCreated(text) : null;
}

/**
 * Registration date of the email's domain, or null when it isn't worth
 * checking (free mail, reserved) or can't be found.
 */
export async function lookupDomainCreated(email) {
  const domain = emailDomain(email);
  if (!domain || !domain.includes('.') || FREE_MAIL.has(domain) || RESERVED.test(domain)) return null;

  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.created;

  const created = (await rdapCreated(domain)) || (await whoisCreated(domain));
  cache.set(domain, { at: Date.now(), created });
  return created;
}
