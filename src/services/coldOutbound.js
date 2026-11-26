/**
 * Cold outbound for any client with outbound_enabled on.
 *
 *   Onboarding (admin or client portal) → outbound_settings + do-not-contact list
 *   Outbound monitor card "Find prospects" → growth worker (prospecting +
 *     cold-email skills) → leads with a drafted sequence, status to_approve
 *   007 approves or rejects each → approved leads export as CSV for the
 *     client's sending tool (Titan or other mailboxes on secondary domains,
 *     connected to Instantly / Smartlead, or sent by hand)
 *   The sending tool and the client's own booking tool post replies, bounces,
 *     unsubscribes and bookings to POST /api/outbound/events with the client's
 *     events key → the lead moves on; bounces and unsubscribes are suppressed.
 *
 * Nothing here sends email. Not the backlink outreach in outreach.js: that
 * one asks sites for links; this one sells the client's product.
 */

import crypto from 'crypto';
import db from '../../database.js';

export const MAILBOX_PROVIDERS = ['titan', 'google', 'microsoft', 'zoho', 'other'];
export const SENDING_TOOLS = ['manual', 'instantly', 'smartlead', 'other'];
export const BOOKING_METHODS = ['own_tool', 'booking_link', 'reply_only'];
export const DATA_SOURCES = ['directories', 'dataforseo', 'apollo', 'manual'];
export const SUPPRESSION_REASONS = ['customer', 'unsubscribed', 'bounced', 'complaint', 'competitor', 'do_not_contact'];
export const LEAD_STATUSES = ['to_approve', 'rejected', 'approved', 'in_sequence', 'replied', 'positive',
  'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost', 'bounced', 'unsubscribed'];
export const EVENT_TYPES = ['sent', 'reply', 'positive_reply', 'bounce', 'unsubscribe', 'complaint',
  'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost', 'note'];
// Countries the cold-email skill says not to cold email at all.
export const DEFAULT_EXCLUDED = ['Germany', 'Austria', 'Italy'];
export const MAX_PROSPECTS_PER_RUN = 50;
const MAX_DAILY_CAP = 50;

// Where an event moves a lead. Later stages are never moved back by an earlier event.
const EVENT_STATUS = {
  sent: 'in_sequence', reply: 'replied', positive_reply: 'positive', bounce: 'bounced',
  unsubscribe: 'unsubscribed', complaint: 'unsubscribed', meeting_booked: 'meeting_booked',
  meeting_held: 'meeting_held', opportunity: 'opportunity', won: 'won', lost: 'lost',
};
const STAGE = ['to_approve', 'approved', 'in_sequence', 'replied', 'positive', 'meeting_booked', 'meeting_held', 'opportunity', 'won'];
const FINAL = ['won', 'lost', 'bounced', 'unsubscribed', 'rejected'];

const parse = (s, fallback) => {
  if (s == null) return fallback;
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
};
const str = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const listOf = (v, max = 30, itemMax = 120) => {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[\n,]/);
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, itemMax)))].slice(0, max);
};
export const normEmail = (e) => {
  const s = String(e ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};
export const normDomain = (d) => {
  let s = String(d ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('@')) s = s.split('@').pop();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
};
const hostOf = (url) => normDomain(url);

// ------------------------------------------------------------ settings

// The events key is stored only as a hash; it is shown once, by rotateEventsKey.
function serializeSettings(row) {
  const s = row || {};
  return {
    client_id: s.client_id ?? null,
    sender_name: s.sender_name || '',
    sender_title: s.sender_title || '',
    sending_domains: parse(s.sending_domains, []),
    mailbox_provider: s.mailbox_provider || '',
    mailboxes_count: s.mailboxes_count ?? null,
    daily_cap_per_mailbox: s.daily_cap_per_mailbox ?? 25,
    sending_tool: s.sending_tool || 'manual',
    target_countries: parse(s.target_countries, []),
    excluded_countries: row ? parse(s.excluded_countries, DEFAULT_EXCLUDED) : DEFAULT_EXCLUDED,
    offer: s.offer || '',
    booking_method: s.booking_method || '',
    booking_url: s.booking_url || '',
    reply_owner_name: s.reply_owner_name || '',
    reply_owner_email: s.reply_owner_email || '',
    postal_address: s.postal_address || '',
    opt_out_text: s.opt_out_text || '',
    data_sources: parse(s.data_sources, []),
    lead_source_notes: s.lead_source_notes || '',
    weekly_new_prospects: s.weekly_new_prospects ?? 30,
    has_events_key: !!s.events_key,
    updated_by: s.updated_by || null,
    updated_at: s.updated_at || null,
  };
}

export function getOutboundSettings(clientId) {
  return serializeSettings(db.prepare('SELECT * FROM outbound_settings WHERE client_id = ?').get(clientId));
}

/** Validate and save. Returns { status, settings } or { status, error }. */
export function saveOutboundSettings(clientId, input = {}, by = 'staff') {
  const client = db.prepare('SELECT id, website_url FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { status: 404, error: 'Client not found' };
  const cur = getOutboundSettings(clientId);
  const v = { ...cur };
  const set = (k, val) => { if (input[k] !== undefined) v[k] = val(input[k]); };

  set('sender_name', (x) => str(x, 120) || '');
  set('sender_title', (x) => str(x, 120) || '');
  set('sending_domains', (x) => listOf(x, 10).map(normDomain).filter(Boolean));
  set('mailbox_provider', (x) => (MAILBOX_PROVIDERS.includes(x) ? x : ''));
  set('mailboxes_count', (x) => (x === '' || x == null ? null : Math.max(0, Math.min(100, parseInt(x, 10) || 0))));
  set('daily_cap_per_mailbox', (x) => Math.max(1, Math.min(MAX_DAILY_CAP, parseInt(x, 10) || 25)));
  set('sending_tool', (x) => (SENDING_TOOLS.includes(x) ? x : 'manual'));
  set('target_countries', (x) => listOf(x, 30, 60));
  set('excluded_countries', (x) => listOf(x, 60, 60));
  set('offer', (x) => str(x, 1000) || '');
  set('booking_method', (x) => (BOOKING_METHODS.includes(x) ? x : ''));
  set('booking_url', (x) => str(x, 500) || '');
  set('reply_owner_name', (x) => str(x, 120) || '');
  set('reply_owner_email', (x) => normEmail(x) || (str(x, 200) ? '__invalid__' : ''));
  set('postal_address', (x) => str(x, 400) || '');
  set('opt_out_text', (x) => str(x, 300) || '');
  set('data_sources', (x) => listOf(x, 10).filter((d) => DATA_SOURCES.includes(d)));
  set('lead_source_notes', (x) => str(x, 2000) || '');
  set('weekly_new_prospects', (x) => Math.max(1, Math.min(MAX_PROSPECTS_PER_RUN, parseInt(x, 10) || 30)));

  if (v.reply_owner_email === '__invalid__') return { status: 400, error: 'The reply owner email is not a valid address' };
  if (v.booking_method === 'booking_link' && v.booking_url && !/^https?:\/\//.test(v.booking_url)) {
    return { status: 400, error: 'The booking link must start with http:// or https://' };
  }
  const main = hostOf(client.website_url);
  if (main && v.sending_domains.some((d) => d === main || d.endsWith(`.${main}`))) {
    return { status: 400, error: `Don't send cold email from ${main}: use separate sending domains so the main domain's mail keeps landing in inboxes` };
  }

  db.prepare(`
    INSERT INTO outbound_settings (client_id, sender_name, sender_title, sending_domains, mailbox_provider, mailboxes_count,
      daily_cap_per_mailbox, sending_tool, target_countries, excluded_countries, offer, booking_method, booking_url,
      reply_owner_name, reply_owner_email, postal_address, opt_out_text, data_sources, lead_source_notes,
      weekly_new_prospects, updated_by, updated_at)
    VALUES (@client_id, @sender_name, @sender_title, @sending_domains, @mailbox_provider, @mailboxes_count,
      @daily_cap_per_mailbox, @sending_tool, @target_countries, @excluded_countries, @offer, @booking_method, @booking_url,
      @reply_owner_name, @reply_owner_email, @postal_address, @opt_out_text, @data_sources, @lead_source_notes,
      @weekly_new_prospects, @updated_by, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET sender_name = excluded.sender_name, sender_title = excluded.sender_title,
      sending_domains = excluded.sending_domains, mailbox_provider = excluded.mailbox_provider,
      mailboxes_count = excluded.mailboxes_count, daily_cap_per_mailbox = excluded.daily_cap_per_mailbox,
      sending_tool = excluded.sending_tool, target_countries = excluded.target_countries,
      excluded_countries = excluded.excluded_countries, offer = excluded.offer, booking_method = excluded.booking_method,
      booking_url = excluded.booking_url, reply_owner_name = excluded.reply_owner_name,
      reply_owner_email = excluded.reply_owner_email, postal_address = excluded.postal_address,
      opt_out_text = excluded.opt_out_text, data_sources = excluded.data_sources,
      lead_source_notes = excluded.lead_source_notes, weekly_new_prospects = excluded.weekly_new_prospects,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run({
    client_id: clientId,
    sender_name: v.sender_name || null, sender_title: v.sender_title || null,
    sending_domains: JSON.stringify(v.sending_domains), mailbox_provider: v.mailbox_provider || null,
    mailboxes_count: v.mailboxes_count, daily_cap_per_mailbox: v.daily_cap_per_mailbox,
    sending_tool: v.sending_tool, target_countries: JSON.stringify(v.target_countries),
    excluded_countries: JSON.stringify(v.excluded_countries), offer: v.offer || null,
    booking_method: v.booking_method || null, booking_url: v.booking_url || null,
    reply_owner_name: v.reply_owner_name || null, reply_owner_email: v.reply_owner_email || null,
    postal_address: v.postal_address || null, opt_out_text: v.opt_out_text || null,
    data_sources: JSON.stringify(v.data_sources), lead_source_notes: v.lead_source_notes || null,
    weekly_new_prospects: v.weekly_new_prospects, updated_by: String(by || 'staff').slice(0, 80),
  });
  return { status: 200, settings: getOutboundSettings(clientId) };
}

/** A new events key, shown once; the old one stops working. */
export function rotateEventsKey(clientId) {
  const client = db.prepare('SELECT id FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { status: 404, error: 'Client not found' };
  const key = `obk_${crypto.randomBytes(24).toString('hex')}`;
  const hash = hashKey(key);
  const exists = db.prepare('SELECT 1 FROM outbound_settings WHERE client_id = ?').get(clientId);
  if (exists) db.prepare("UPDATE outbound_settings SET events_key = ?, updated_at = datetime('now') WHERE client_id = ?").run(hash, clientId);
  else db.prepare('INSERT INTO outbound_settings (client_id, events_key) VALUES (?, ?)').run(clientId, hash);
  return { status: 200, events_key: key };
}

const hashKey = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');

/** The client a presented events key belongs to, or null. Compared as hashes in constant time. */
export function clientForEventsKey(key) {
  if (!key || !/^obk_[a-f0-9]{48}$/.test(key)) return null;
  const h = Buffer.from(hashKey(key));
  const rows = db.prepare('SELECT client_id, events_key FROM outbound_settings WHERE events_key IS NOT NULL').all();
  for (const r of rows) {
    const b = Buffer.from(r.events_key);
    if (b.length === h.length && crypto.timingSafeEqual(b, h)) return r.client_id;
  }
  return null;
}

// ------------------------------------------------------------ do-not-contact

export function listSuppression(clientId) {
  return db.prepare('SELECT id, value, kind, reason, source, created_at FROM outbound_suppression WHERE client_id = ? ORDER BY id DESC').all(clientId);
}

/**
 * Add emails or domains (one per line, or an array). Returns how many were
 * added and which lines weren't an email or a domain.
 */
export function addSuppression(clientId, entries, { reason = 'do_not_contact', source = 'staff' } = {}) {
  if (!SUPPRESSION_REASONS.includes(reason)) return { status: 400, error: `reason must be one of ${SUPPRESSION_REASONS.join(', ')}` };
  const lines = listOf(entries, 5000, 254);
  const insert = db.prepare('INSERT OR IGNORE INTO outbound_suppression (client_id, value, kind, reason, source) VALUES (?, ?, ?, ?, ?)');
  let added = 0;
  const rejected = [];
  db.transaction(() => {
    for (const line of lines) {
      const email = line.includes('@') && !line.startsWith('@') ? normEmail(line) : null;
      const domain = email ? null : normDomain(line);
      if (!email && !domain) { rejected.push(line); continue; }
      added += insert.run(clientId, email || domain, email ? 'email' : 'domain', reason, String(source).slice(0, 80)).changes;
    }
  })();
  return { status: 200, added, rejected: rejected.slice(0, 50) };
}

export function removeSuppression(clientId, id) {
  const r = db.prepare('DELETE FROM outbound_suppression WHERE client_id = ? AND id = ?').run(clientId, id);
  return r.changes ? { status: 200 } : { status: 404, error: 'Not found' };
}

/** Whether an email (or its domain) is on the client's do-not-contact list. */
export function isSuppressed(clientId, email, domain) {
  const e = normEmail(email);
  const d = normDomain(domain || e);
  const values = [e, d].filter(Boolean);
  if (!values.length) return false;
  return !!db.prepare(`SELECT 1 FROM outbound_suppression WHERE client_id = ? AND value IN (${values.map(() => '?').join(',')})`).get(clientId, ...values);
}

// ------------------------------------------------------------ leads

export function serializeLead(r) {
  if (!r) return null;
  return { ...r, source_urls: parse(r.source_urls, []), sequence: parse(r.sequence, []) };
}

export function listLeads(clientId, { status } = {}) {
  const where = ['client_id = ?'];
  const params = [clientId];
  if (status) {
    const list = String(status).split(',').filter((s) => LEAD_STATUSES.includes(s));
    if (list.length) { where.push(`status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  return db.prepare(`SELECT * FROM outbound_leads WHERE ${where.join(' AND ')} ORDER BY CASE score WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END, id DESC LIMIT 500`)
    .all(...params).map(serializeLead);
}

/** Counts by status, plus the funnel numbers the monitor shows. */
export function leadStats(clientId) {
  const by = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM outbound_leads WHERE client_id = ? GROUP BY status').all(clientId)) by[r.status] = r.n;
  const contacted = ['in_sequence', 'replied', 'positive', 'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost', 'bounced', 'unsubscribed']
    .reduce((n, s) => n + by[s], 0);
  const replied = ['replied', 'positive', 'meeting_booked', 'meeting_held', 'opportunity', 'won', 'lost'].reduce((n, s) => n + by[s], 0);
  const meetings = ['meeting_booked', 'meeting_held', 'opportunity', 'won'].reduce((n, s) => n + by[s], 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    by_status: by, contacted, replied, meetings,
    reply_rate: pct(replied, contacted), bounce_rate: pct(by.bounced, contacted), meeting_rate: pct(meetings, contacted),
  };
}

const cleanSequence = (seq) => (Array.isArray(seq) ? seq : []).slice(0, 6).map((s, i) => ({
  step: i + 1,
  day: Math.max(0, Math.min(60, parseInt(s?.day, 10) || (i === 0 ? 0 : i * 4))),
  subject: str(s?.subject, 150) || '',
  body: str(s?.body, 3000) || '',
})).filter((s) => s.body);

/**
 * Leads from a worker run. Each needs a company and an email; anything on the
 * do-not-contact list, already a lead, or in an excluded country is dropped
 * with the reason, never stored.
 */
export function addLeadsFromRun(clientId, runId, leads = []) {
  const settings = getOutboundSettings(clientId);
  const excluded = new Set(settings.excluded_countries.map((c) => c.toLowerCase()));
  const knownDomains = new Set(db.prepare('SELECT domain FROM outbound_leads WHERE client_id = ? AND domain IS NOT NULL').all(clientId).map((r) => r.domain));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO outbound_leads (client_id, company, domain, country, industry, size_band, contact_name, contact_title,
      contact_email, email_status, linkedin_url, signal, why_prospect, source_urls, score, tier, confidence, sequence, run_id)
    VALUES (@client_id, @company, @domain, @country, @industry, @size_band, @contact_name, @contact_title,
      @contact_email, @email_status, @linkedin_url, @signal, @why_prospect, @source_urls, @score, @tier, @confidence, @sequence, @run_id)
  `);
  const skipped = [];
  let added = 0;
  db.transaction(() => {
    for (const l of (Array.isArray(leads) ? leads : []).slice(0, MAX_PROSPECTS_PER_RUN)) {
      const company = str(l?.company, 200);
      const email = normEmail(l?.contact_email);
      const domain = normDomain(l?.domain) || normDomain(email);
      const label = company || email || '(no company)';
      if (!company || !email) { skipped.push({ lead: label, reason: 'no company or no valid email' }); continue; }
      if (l?.country && excluded.has(String(l.country).trim().toLowerCase())) { skipped.push({ lead: label, reason: `excluded country (${l.country})` }); continue; }
      if (isSuppressed(clientId, email, domain)) { skipped.push({ lead: label, reason: 'on the do-not-contact list' }); continue; }
      if (domain && knownDomains.has(domain)) { skipped.push({ lead: label, reason: 'company already a lead' }); continue; }
      const sequence = cleanSequence(l?.sequence);
      if (!sequence.length) { skipped.push({ lead: label, reason: 'no email drafted' }); continue; }
      const r = insert.run({
        client_id: clientId, company, domain, country: str(l?.country, 60), industry: str(l?.industry, 120),
        size_band: str(l?.size_band, 40), contact_name: str(l?.contact_name, 120), contact_title: str(l?.contact_title, 120),
        contact_email: email, email_status: ['valid', 'risky', 'invalid'].includes(l?.email_status) ? l.email_status : 'unverified',
        linkedin_url: /^https:\/\/([a-z]+\.)?linkedin\.com\//.test(l?.linkedin_url || '') ? String(l.linkedin_url).slice(0, 300) : null,
        signal: str(l?.signal, 500), why_prospect: str(l?.why_prospect, 500),
        source_urls: JSON.stringify(listOf(l?.source_urls, 8, 500).filter((u) => /^https?:\/\//.test(u))),
        score: ['hot', 'warm', 'cold'].includes(l?.score) ? l.score : null,
        tier: [1, 2, 3].includes(Number(l?.tier)) ? Number(l.tier) : null,
        confidence: ['high', 'medium', 'low'].includes(l?.confidence) ? l.confidence : null,
        sequence: JSON.stringify(sequence), run_id: runId,
      });
      if (r.changes) { added++; if (domain) knownDomains.add(domain); } else skipped.push({ lead: label, reason: 'email already a lead' });
    }
  })();
  return { added, skipped };
}

export function getLead(clientId, id) {
  return serializeLead(db.prepare('SELECT * FROM outbound_leads WHERE client_id = ? AND id = ?').get(clientId, id));
}

/** Staff edit before approving: the sequence, contact fields, notes. */
export function updateLead(clientId, id, input = {}) {
  const lead = getLead(clientId, id);
  if (!lead) return { status: 404, error: 'Lead not found' };
  const fields = {};
  if (input.sequence !== undefined) {
    const seq = cleanSequence(input.sequence);
    if (!seq.length) return { status: 400, error: 'A lead needs at least one email' };
    fields.sequence = JSON.stringify(seq);
  }
  for (const [k, max] of [['contact_name', 120], ['contact_title', 120], ['reply_note', 2000], ['company', 200]]) {
    if (input[k] !== undefined) fields[k] = str(input[k], max);
  }
  if (input.contact_email !== undefined) {
    const e = normEmail(input.contact_email);
    if (!e) return { status: 400, error: 'Not a valid email' };
    fields.contact_email = e;
  }
  if (!Object.keys(fields).length) return { status: 400, error: 'Nothing to update' };
  fields.updated_at = new Date().toISOString();
  db.prepare(`UPDATE outbound_leads SET ${Object.keys(fields).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
  return { status: 200, lead: getLead(clientId, id) };
}

/** to_approve → approved or rejected. Approving re-checks the do-not-contact list. */
export function decideLead(clientId, id, decision, by) {
  const lead = getLead(clientId, id);
  if (!lead) return { status: 404, error: 'Lead not found' };
  if (lead.status !== 'to_approve') return { status: 409, error: `This lead is ${lead.status.replace(/_/g, ' ')}` };
  if (decision === 'approve') {
    if (isSuppressed(clientId, lead.contact_email, lead.domain)) return { status: 409, error: 'This contact is now on the do-not-contact list' };
    if (lead.email_status === 'invalid') return { status: 409, error: 'The email failed verification' };
    db.prepare("UPDATE outbound_leads SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(String(by || 'staff').slice(0, 80), id);
  } else if (decision === 'reject') {
    db.prepare("UPDATE outbound_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id);
  } else {
    return { status: 400, error: "decision must be 'approve' or 'reject'" };
  }
  return { status: 200, lead: getLead(clientId, id) };
}

/**
 * Record what happened to a lead and move it on. A later stage is never
 * undone by an earlier event (a late "sent" doesn't undo a booking); bounces,
 * unsubscribes and complaints also go on the do-not-contact list.
 */
export function recordEvent(clientId, { lead_id, email, type, detail, occurred_at, source = 'staff' } = {}) {
  if (!EVENT_TYPES.includes(type)) return { status: 400, error: `type must be one of ${EVENT_TYPES.join(', ')}` };
  const e = normEmail(email);
  const lead = lead_id
    ? db.prepare('SELECT * FROM outbound_leads WHERE client_id = ? AND id = ?').get(clientId, lead_id)
    : (e ? db.prepare('SELECT * FROM outbound_leads WHERE client_id = ? AND contact_email = ?').get(clientId, e) : null);
  if (lead_id && !lead) return { status: 404, error: 'Lead not found' };
  const when = /^\d{4}-\d{2}-\d{2}/.test(occurred_at || '') ? new Date(occurred_at) : new Date();
  const at = Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString();
  const src = ['sending_tool', 'booking', 'staff', 'worker'].includes(source) ? source : 'staff';

  db.transaction(() => {
    db.prepare('INSERT INTO outbound_events (client_id, lead_id, email, type, detail, source, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(clientId, lead?.id ?? null, e || lead?.contact_email || null, type, str(detail, 2000), src, at);
    if (['bounce', 'unsubscribe', 'complaint'].includes(type) && (e || lead?.contact_email)) {
      const reason = type === 'bounce' ? 'bounced' : type === 'complaint' ? 'complaint' : 'unsubscribed';
      db.prepare('INSERT OR IGNORE INTO outbound_suppression (client_id, value, kind, reason, source) VALUES (?, ?, \'email\', ?, ?)')
        .run(clientId, e || lead.contact_email, reason, src);
    }
    if (!lead) return;
    const to = EVENT_STATUS[type];
    let next = lead.status;
    if (to && lead.status !== 'rejected') {
      if (to === 'won') next = 'won';
      else if (['bounced', 'unsubscribed', 'lost'].includes(to)) { if (lead.status !== 'won') next = to; }
      else if (!FINAL.includes(lead.status) && STAGE.indexOf(to) > STAGE.indexOf(lead.status)) next = to;
    }
    db.prepare(`UPDATE outbound_leads SET status = ?, last_event_at = ?, sent_at = CASE WHEN ? = 'sent' AND sent_at IS NULL THEN ? ELSE sent_at END,
      reply_note = CASE WHEN ? IN ('reply', 'positive_reply') AND ? IS NOT NULL THEN ? ELSE reply_note END, updated_at = datetime('now') WHERE id = ?`)
      .run(next, at, type, at, type, str(detail, 2000), str(detail, 2000), lead.id);
  })();
  return { status: 200, lead: lead ? getLead(clientId, lead.id) : null, matched: !!lead };
}

export function listEvents(clientId, limit = 50) {
  return db.prepare(`
    SELECT e.*, l.company, l.contact_name FROM outbound_events e LEFT JOIN outbound_leads l ON l.id = e.lead_id
    WHERE e.client_id = ? ORDER BY e.id DESC LIMIT ?
  `).all(clientId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  // A cell starting with = + - @ runs as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Approved leads as CSV for the sending tool: one row per lead, each step's
 * subject and body as columns (step_1_subject, step_1_body, ...), the footer
 * (postal address and opt-out) added to every body. Instantly and Smartlead
 * both import custom columns as variables.
 */
export function exportApprovedCsv(clientId, { markInSequence = false, by = 'staff' } = {}) {
  const settings = getOutboundSettings(clientId);
  const leads = db.prepare("SELECT * FROM outbound_leads WHERE client_id = ? AND status = 'approved' ORDER BY id").all(clientId).map(serializeLead)
    .filter((l) => !isSuppressed(clientId, l.contact_email, l.domain));
  const steps = Math.max(1, ...leads.map((l) => l.sequence.length));
  const footer = [settings.sender_name && `${settings.sender_name}${settings.sender_title ? `, ${settings.sender_title}` : ''}`,
    settings.postal_address, settings.opt_out_text || 'Not relevant? Reply "no" and I won\'t email again.'].filter(Boolean).join('\n');
  const head = ['email', 'first_name', 'last_name', 'company_name', 'website', 'title', 'country'];
  for (let i = 1; i <= steps; i++) head.push(`step_${i}_day`, `step_${i}_subject`, `step_${i}_body`);
  const rows = [head.join(',')];
  for (const l of leads) {
    const [first, ...rest] = String(l.contact_name || '').split(/\s+/);
    const cells = [l.contact_email, first || '', rest.join(' '), l.company, l.domain ? `https://${l.domain}` : '', l.contact_title || '', l.country || ''];
    for (let i = 0; i < steps; i++) {
      const s = l.sequence[i];
      cells.push(s ? s.day : '', s ? s.subject : '', s ? `${s.body}\n\n${footer}` : '');
    }
    rows.push(cells.map(csvCell).join(','));
  }
  if (markInSequence && leads.length) {
    for (const l of leads) recordEvent(clientId, { lead_id: l.id, type: 'sent', detail: `exported for sending by ${by}`, source: 'staff' });
  }
  return { csv: `${rows.join('\n')}\n`, count: leads.length };
}
