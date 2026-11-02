/**
 * Marketing Ops Center — Website Lead Bot Checks
 * Pure helpers used by the public lead route: a signed load-time token,
 * input validation, and content heuristics. No CAPTCHA, nothing the visitor sees.
 */

import crypto from 'crypto';

const MIN_FILL_MS = 3000;                 // nobody types a real enquiry in under 3s
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

// Field bots love to fill. Rendered off-screen in every form; humans never see it.
export const HONEYPOT_FIELD = 'website_url';

function secret() {
  return process.env.LEAD_FORM_SECRET || process.env.JWT_ACCESS_SECRET || 'dev-lead-form-secret';
}

function sign(ts) {
  return crypto.createHmac('sha256', secret()).update(`lead-form:${ts}`).digest('hex').slice(0, 32);
}

/** Token handed to the form when it renders: "<issued-at ms>.<hmac>". */
export function issueFormToken(now = Date.now()) {
  return `${now}.${sign(now)}`;
}

/** Returns null when the token is fine, otherwise a short reason string. */
export function checkFormToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string') return 'missing form token';
  const [tsRaw, mac] = token.split('.');
  const ts = Number(tsRaw);
  if (!ts || !mac) return 'malformed form token';
  const expected = sign(ts);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return 'invalid form token';
  }
  const age = now - ts;
  if (age < MIN_FILL_MS) return `submitted ${age}ms after load`;
  if (age > MAX_TOKEN_AGE_MS) return 'form token expired';
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 100, email: 254, company: 200, focus: 200, message: 5000 };

/**
 * Normalise and validate the submitted fields.
 * Returns { error } for input a real person would need to fix, else { data }.
 */
export function validateLeadInput(body = {}) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const data = {
    name: str(body.name),
    email: str(body.email).toLowerCase(),
    company: str(body.company),
    focus: str(body.focus),
    message: str(body.message),
  };

  if (!data.name) return { error: 'Please enter your name.' };
  if (!data.email || !EMAIL_RE.test(data.email)) return { error: 'Please enter a valid email address.' };
  for (const [field, max] of Object.entries(LIMITS)) {
    if (data[field].length > max) return { error: `${field[0].toUpperCase() + field.slice(1)} is too long (max ${max} characters).` };
  }
  return { data };
}

/**
 * Content signals typical of spam. Returns a reason string or null.
 * Flagged leads are kept (status 'Spam'), so these can afford to be a little eager.
 */
export function detectSpamContent({ name, company, message }) {
  const all = `${name} ${company} ${message}`;
  const urlCount = (all.match(/https?:\/\/|www\./gi) || []).length;
  if (urlCount > 2) return `${urlCount} links in submission`;
  if (/\[url=|<a\s+href|\[link=/i.test(all)) return 'link markup in submission';
  if (/https?:\/\/|www\./i.test(name)) return 'link in name';
  if (/[Ѐ-ӿ]{4,}/.test(all)) return 'Cyrillic text';
  if (/\b(viagra|cialis|casino|crypto ?invest|forex|bitcoin|backlinks? (package|service)|guest post|seo ranking guarantee)\b/i.test(all)) {
    return 'spam keyword';
  }
  if (/^[a-z0-9]{15,}$/i.test(name) && !/\s/.test(name)) return 'random-string name';
  return null;
}
