/**
 * Marketing Ops Center — Public Website Lead Intake
 * No auth. Every website enquiry form posts here.
 *
 *   GET  /api/public/leads/token  → signed load-time token for the form
 *   POST /api/public/leads        → validate, bot-check, save, then email sales
 *
 * Order matters: the lead is written to the DB before any email is attempted,
 * so an SMTP outage never loses an enquiry. Bot-flagged submissions get the
 * same success response as real ones so a bot can't learn which check caught it.
 */

import { Router } from 'express';
import db from '../../database.js';
import { leadFormLimiter } from '../middleware/rateLimit.js';
import { sendLeadNotification, isMailConfigured } from '../services/mailer.js';
import {
  HONEYPOT_FIELD,
  issueFormToken,
  checkFormToken,
  validateLeadInput,
  detectSpamContent,
} from '../services/leadSpam.js';

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

    // 5. Email — after the save, and the visitor doesn't wait on SMTP.
    res.json({ ok: true });
    notify(lead);
  } catch (err) {
    console.error('[PUBLIC LEADS] Save error:', err);
    res.status(500).json({ error: 'Something went wrong. Please email deepanjan@hypheningmedia.com directly.' });
  }
});

async function notify(lead) {
  if (!isMailConfigured()) {
    db.prepare('UPDATE leads SET notify_error = ? WHERE id = ?').run('SMTP not configured', lead.id);
    console.warn(`[PUBLIC LEADS] Lead #${lead.id} saved; SMTP not configured, no email sent`);
    return;
  }
  try {
    await sendLeadNotification(lead);
    db.prepare("UPDATE leads SET notified_at = datetime('now'), notify_error = NULL WHERE id = ?").run(lead.id);
  } catch (err) {
    db.prepare('UPDATE leads SET notify_error = ? WHERE id = ?').run(String(err.message).slice(0, 500), lead.id);
    console.error(`[PUBLIC LEADS] Lead #${lead.id} saved but email failed:`, err.message);
  }
}

export default router;
