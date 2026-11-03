/**
 * Backlink outreach, mounted at /api/outreach: the SEO Monitor's Outreach
 * section. 007 approves, rejects and assigns; the assigned staff member marks
 * an email sent and records the outcome. Nothing here sends email.
 * Logic lives in src/services/outreach.js.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal } from '../services/macConnector.js';
import {
  outreachReport, approveProspect, rejectProspect, markSent, markOutcome, queueOutreachRuns, setSetting, outreachCc,
} from '../services/outreach.js';

const router = Router();
router.use(authenticate);

const STAFF = ['admin', 'super_admin', 'ops_social_media_manager', 'ops_video_editor', 'cinematographer'];
const reply = (res, r, body = {}) => (r.status === 200 ? res.json({ success: true, ...body, ...(r.prospect ? { prospect: r.prospect } : {}) }) : res.status(r.status).json({ error: r.error }));

/** GET /api/outreach — admins see everything; staff see what is assigned to them. */
router.get('/', authorize(...STAFF), (req, res) => {
  try {
    res.json(outreachReport(req.user));
  } catch (err) {
    console.error('[OUTREACH] Report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/outreach/run — { client_id? } find prospects now, without waiting for the weekly run. */
router.post('/run', authorize('admin'), (req, res) => {
  const { queued, skipped } = queueOutreachRuns({ by: req.user.email, clientId: parseInt(req.body?.client_id, 10) || null });
  if (!queued.length) return res.status(409).json({ error: skipped.map((s) => `${s.client_name}: ${s.reason}`).join('; ') || 'No client has SEO on' });
  const online = pushRunSignal('outreach');
  res.json({ queued, connector_online: online });
});

/** PUT /api/outreach/cc — { emails: "a@x.com, b@x.com" } internal staff CC'd on every outreach email. */
router.put('/cc', authorize('admin'), (req, res) => {
  setSetting('outreach_cc', String(req.body?.emails || '').slice(0, 1000), req.user.email);
  res.json({ cc: outreachCc() });
});

router.post('/:id/approve', authorize('admin'), (req, res) => {
  const r = approveProspect(parseInt(req.params.id, 10), req.body || {}, req.user);
  if (r.status === 200) logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'outreach_approved', entityType: 'outreach_prospect', entityId: r.prospect.id });
  reply(res, r);
});

router.post('/:id/reject', authorize('admin'), (req, res) => reply(res, rejectProspect(parseInt(req.params.id, 10))));

router.post('/:id/sent', authorize(...STAFF), (req, res) => reply(res, markSent(parseInt(req.params.id, 10), req.user)));

/** POST /api/outreach/:id/outcome — { outcome: replied|won|lost, live_url?, note? } */
router.post('/:id/outcome', authorize(...STAFF), (req, res) => reply(res, markOutcome(parseInt(req.params.id, 10), req.body || {}, req.user)));

export default router;
