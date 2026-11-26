/**
 * POST /api/outbound/events: what happened to a cold email, from outside.
 *
 * Callers are a client's sending tool (Instantly, Smartlead, or a script on
 * their mailboxes) and the client's own booking tool (F16s's internal one,
 * a booking-link webhook, or anything else). Each client has its own key
 * (Outbound tab → Events key), sent as the x-outbound-key header; the key
 * decides the client, so one client's tool can never move another's leads.
 *
 * Body: one event or { events: [...] } (up to 100):
 *   { email, type, detail?, occurred_at? }
 *   type: sent | reply | positive_reply | bounce | unsubscribe | complaint |
 *         meeting_booked | meeting_held | opportunity | won | lost | note
 * Common sending-tool field names are accepted too (lead_email, event_type,
 * timestamp) so a tool's own webhook can point straight here.
 */

import { Router } from 'express';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { clientForEventsKey, recordEvent, EVENT_TYPES } from '../services/coldOutbound.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();
router.use(webhookLimiter);

// What the sending tools call their events, mapped to ours.
const ALIASES = {
  email_sent: 'sent', sent: 'sent', reply_received: 'reply', email_replied: 'reply', replied: 'reply', reply: 'reply',
  lead_interested: 'positive_reply', interested: 'positive_reply', positive_reply: 'positive_reply',
  email_bounced: 'bounce', bounced: 'bounce', bounce: 'bounce',
  lead_unsubscribed: 'unsubscribe', unsubscribed: 'unsubscribe', unsubscribe: 'unsubscribe',
  spam_complaint: 'complaint', complaint: 'complaint',
  meeting_booked: 'meeting_booked', lead_meeting_booked: 'meeting_booked', booked: 'meeting_booked',
  meeting_held: 'meeting_held', meeting_completed: 'meeting_held',
};

export function normalizeEvent(e = {}) {
  const raw = String(e.type || e.event_type || e.event || '').trim().toLowerCase();
  const type = ALIASES[raw] || (EVENT_TYPES.includes(raw) ? raw : null);
  return {
    type,
    raw_type: raw,
    email: e.email || e.lead_email || e.to_email || e.recipient || null,
    detail: e.detail || e.reply_text || e.text || e.message || e.notes || null,
    occurred_at: e.occurred_at || e.timestamp || e.time || null,
  };
}

router.post('/events', (req, res) => {
  const clientId = clientForEventsKey(req.get('x-outbound-key'));
  if (!clientId) return res.status(401).json({ error: 'Missing or unknown x-outbound-key' });
  const list = Array.isArray(req.body?.events) ? req.body.events : [req.body || {}];
  if (list.length > 100) return res.status(413).json({ error: 'At most 100 events per request' });

  const results = list.map((raw) => {
    const e = normalizeEvent(raw);
    if (!e.type) return { ok: false, error: `unknown type "${e.raw_type}"` };
    if (!e.email) return { ok: false, error: 'email is required' };
    const source = ['meeting_booked', 'meeting_held'].includes(e.type) ? 'booking' : 'sending_tool';
    const r = recordEvent(clientId, { email: e.email, type: e.type, detail: e.detail, occurred_at: e.occurred_at, source });
    return r.status === 200 ? { ok: true, type: e.type, matched_lead: r.matched } : { ok: false, error: r.error };
  });
  const accepted = results.filter((r) => r.ok).length;
  logAction({ action: 'outbound_events', entityType: 'outbound_event', entityId: clientId, diff: { accepted, rejected: results.length - accepted }, ip: req.ip });
  return res.status(accepted ? 200 : 400).json({ accepted, results });
});

export default router;
