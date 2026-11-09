/**
 * Marketing Ops Center — Public Website Lead Intake
 * No auth. Every website enquiry form posts here.
 *
 *   GET  /api/public/leads/token  → signed load-time token for the form
 *   POST /api/public/leads        → validate, bot-check, save
 *
 * Leads land in the dashboard's Leads tab; nothing is emailed (007's decision,
 * 2026-11-03). Bot-flagged submissions get the same success response as real
 * ones so a bot can't learn which check caught it.
 */

import { Router } from 'express';
import db from '../../database.js';
import { leadFormLimiter } from '../middleware/rateLimit.js';
import {
  HONEYPOT_FIELD,
  issueFormToken,
  checkFormToken,
  validateLeadInput,
  detectSpamContent,
  checkDomainAge,
} from '../services/leadSpam.js';
import { lookupDomainCreated } from '../services/domainAge.js';

const router = Router();
const SOURCES = new Set(['footer', 'kage']);

router.use(leadFormLimiter);

router.get('/token', (req, res) => {
  res.json({ token: issueFormToken() });
});

router.post('/', async (req, res) => {
  const body = req.body || {};

  // 1. Honeypot — a filled hidden field is a bot. Pretend success, store nothing.
  if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim()) {
    console.warn(`[PUBLIC LEADS] Honeypot hit from ${req.ip}`);
    return res.json({ ok: true });
  }

  // 2. Validation — real mistakes get a real error message.
  const { error, data } = validateLeadInput(body);
  if (error) return res.status(400).json({ error });

  const source = `website:${SOURCES.has(body.source) ? body.source : 'unknown'}`;

  try {
    // 3. Duplicate — same person, same message within 10 minutes (double clicks, retries).
    const dup = db.prepare(`
      SELECT id FROM leads
      WHERE LOWER(email) = ? AND COALESCE(notes, '') = ? AND created_at >= datetime('now', '-10 minutes')
      LIMIT 1
    `).get(data.email, data.message);
    if (dup) return res.json({ ok: true });

    // 4. Timing token + content heuristics. Flagged leads are kept as 'Spam'.
    const spamReason = checkFormToken(body.token) || detectSpamContent(data);

    const info = db.prepare(`
      INSERT INTO leads (
        client_name, company_name, email, notes, industry, status, source, spam_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      data.name,
      data.company || null,
      data.email,
      data.message || null,
      data.focus || null,
      spamReason ? 'Spam' : 'New',
      source,
      spamReason
    );
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);

    if (spamReason) {
      console.warn(`[PUBLIC LEADS] Lead #${lead.id} flagged as spam: ${spamReason}`);
      return res.json({ ok: true });
    }

    res.json({ ok: true });

    // 5. Email domain age, after replying so the visitor never waits on WHOIS.
    // A brand-new domain is the tell of brand-impersonation scams; the lead
    // stays New with the warning shown in the Leads tab.
    await flagNewDomain(lead.id, data.email);
  } catch (err) {
    console.error('[PUBLIC LEADS] Save error:', err);
    res.status(500).json({ error: 'Something went wrong. Please email deepanjan@hypheningmedia.com directly.' });
  }
});

export async function flagNewDomain(leadId, email, lookup = lookupDomainCreated) {
  try {
    const warning = checkDomainAge(await lookup(email));
    if (!warning) return null;
    db.prepare(`UPDATE leads SET spam_reason = ?, updated_at = datetime('now') WHERE id = ? AND spam_reason IS NULL`)
      .run(warning, leadId);
    console.warn(`[PUBLIC LEADS] Lead #${leadId} needs a check: ${warning}`);
    return warning;
  } catch (err) {
    console.error(`[PUBLIC LEADS] Domain age check failed for lead #${leadId}:`, err.message);
    return null;
  }
}

export default router;
