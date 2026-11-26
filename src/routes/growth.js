/**
 * The Client Brain, cold outbound and the shared monitor cards, mounted at
 * /api/clients: /:id/brain..., /:id/outbound/..., /:id/growth/...
 *
 * Reads: admins and social media managers. Changes, runs and lead decisions:
 * admins. The client edits its own Brain and outbound setup from the portal
 * (src/routes/portal.js); sending and booking tools post events to
 * /api/outbound/events (src/routes/outboundEvents.js).
 *
 * Logic: src/services/clientBrain.js, coldOutbound.js, growth.js.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal } from '../services/macConnector.js';
import { BRAIN_SECTIONS, getBrain, saveBrain, listBrainVersions, restoreBrainVersion, renderBrainMarkdown } from '../services/clientBrain.js';
import {
  getOutboundSettings, saveOutboundSettings, rotateEventsKey, listSuppression, addSuppression, removeSuppression,
  listLeads, leadStats, updateLead, decideLead, recordEvent, listEvents, exportApprovedCsv,
  MAILBOX_PROVIDERS, SENDING_TOOLS, BOOKING_METHODS, DATA_SOURCES, SUPPRESSION_REASONS, EVENT_TYPES, DEFAULT_EXCLUDED,
} from '../services/coldOutbound.js';
import {
  cardsFor, queueGrowthRun, cancelGrowthRun, getGrowthRun, applyGrowthRun, listRecommendations, setRecommendationStatus, MONITORS,
} from '../services/growth.js';
import db from '../../database.js';

const router = Router();
router.use(authenticate);

const READ = ['admin', 'ops_social_media_manager'];
const who = (req) => req.user?.email || req.user?.name || 'admin';
const id = (req) => parseInt(req.params.id, 10);
const send = (res, r, pick) => (r.status === 200 ? res.json({ success: true, ...(pick ? pick(r) : r) }) : res.status(r.status).json({ error: r.error, ...(r.missing ? { missing: r.missing } : {}) }));
const audit = (req, action, entityType, diff) => logAction({ actorId: req.user.id, actorEmail: req.user.email, action, entityType, entityId: id(req), diff, ip: req.ip });
const exists = (clientId) => !!db.prepare('SELECT 1 FROM crm_clients WHERE id = ?').get(clientId);
const guard = (fn) => (req, res) => {
  try {
    if (!exists(id(req))) return res.status(404).json({ error: 'Client not found' });
    return fn(req, res);
  } catch (err) {
    console.error(`[GROWTH] ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ------------------------------------------------------------ Brain

router.get('/:id/brain', authorize(...READ), guard((req, res) => {
  res.json({ brain: getBrain(id(req)), sections: BRAIN_SECTIONS, versions: listBrainVersions(id(req), 10) });
}));

router.put('/:id/brain', authorize('admin'), guard((req, res) => {
  const { sections, claims, learnings } = req.body || {};
  const r = saveBrain(id(req), { sections, claims, learnings }, { by: who(req), note: req.body?.note });
  if (r.status === 200 && !r.unchanged) audit(req, 'client_brain_save', 'client_brain', { version: r.brain.version });
  send(res, r, (x) => ({ brain: x.brain, unchanged: !!x.unchanged }));
}));

router.post('/:id/brain/restore/:version', authorize('admin'), guard((req, res) => {
  const r = restoreBrainVersion(id(req), parseInt(req.params.version, 10), who(req));
  if (r.status === 200) audit(req, 'client_brain_restore', 'client_brain', { from_version: req.params.version, version: r.brain.version });
  send(res, r, (x) => ({ brain: x.brain }));
}));

/** The doc a marketing-skills run reads, as plain text. */
router.get('/:id/brain/markdown', authorize(...READ), guard((req, res) => {
  res.type('text/markdown').send(renderBrainMarkdown(id(req)));
}));

// ------------------------------------------------------------ outbound setup

router.get('/:id/outbound/settings', authorize(...READ), guard((req, res) => {
  const c = db.prepare('SELECT outbound_enabled, client_group, website_url FROM crm_clients WHERE id = ?').get(id(req));
  res.json({
    settings: getOutboundSettings(id(req)), outbound_enabled: !!c.outbound_enabled, client_group: c.client_group, website_url: c.website_url,
    options: { mailbox_providers: MAILBOX_PROVIDERS, sending_tools: SENDING_TOOLS, booking_methods: BOOKING_METHODS, data_sources: DATA_SOURCES, suppression_reasons: SUPPRESSION_REASONS, default_excluded: DEFAULT_EXCLUDED },
  });
}));

router.put('/:id/outbound/settings', authorize('admin'), guard((req, res) => {
  const r = saveOutboundSettings(id(req), req.body || {}, who(req));
  if (r.status === 200) audit(req, 'outbound_settings_save', 'outbound_settings', { keys: Object.keys(req.body || {}) });
  send(res, r, (x) => ({ settings: x.settings }));
}));

/** A new key for the sending and booking tools. Shown once; the old one stops working. */
router.post('/:id/outbound/events-key', authorize('admin'), guard((req, res) => {
  const r = rotateEventsKey(id(req));
  if (r.status === 200) audit(req, 'outbound_events_key_rotate', 'outbound_settings', {});
  send(res, r, (x) => ({ events_key: x.events_key }));
}));

router.get('/:id/outbound/suppression', authorize(...READ), guard((req, res) => res.json({ entries: listSuppression(id(req)) })));

router.post('/:id/outbound/suppression', authorize('admin'), guard((req, res) => {
  const r = addSuppression(id(req), req.body?.entries, { reason: req.body?.reason || 'do_not_contact', source: who(req) });
  if (r.status === 200 && r.added) audit(req, 'outbound_suppression_add', 'outbound_suppression', { added: r.added, reason: req.body?.reason });
  send(res, r);
}));

router.delete('/:id/outbound/suppression/:entryId', authorize('admin'), guard((req, res) => {
  const r = removeSuppression(id(req), parseInt(req.params.entryId, 10));
  if (r.status === 200) audit(req, 'outbound_suppression_remove', 'outbound_suppression', { entry: req.params.entryId });
  send(res, r);
}));

// ------------------------------------------------------------ leads

router.get('/:id/outbound/leads', authorize(...READ), guard((req, res) => {
  res.json({ leads: listLeads(id(req), { status: req.query.status }), stats: leadStats(id(req)) });
}));

router.patch('/:id/outbound/leads/:leadId', authorize('admin'), guard((req, res) => {
  send(res, updateLead(id(req), parseInt(req.params.leadId, 10), req.body || {}), (x) => ({ lead: x.lead }));
}));

router.post('/:id/outbound/leads/:leadId/decide', authorize('admin'), guard((req, res) => {
  const r = decideLead(id(req), parseInt(req.params.leadId, 10), req.body?.decision, who(req));
  if (r.status === 200) audit(req, `outbound_lead_${req.body?.decision}`, 'outbound_lead', { lead: req.params.leadId });
  send(res, r, (x) => ({ lead: x.lead }));
}));

/** Staff record what happened (a reply by phone, a meeting, won or lost). */
router.post('/:id/outbound/leads/:leadId/event', authorize('admin'), guard((req, res) => {
  const r = recordEvent(id(req), { lead_id: parseInt(req.params.leadId, 10), type: req.body?.type, detail: req.body?.detail, source: 'staff' });
  send(res, r, (x) => ({ lead: x.lead }));
}));

router.get('/:id/outbound/events', authorize(...READ), guard((req, res) => res.json({ events: listEvents(id(req), req.query.limit), types: EVENT_TYPES })));

/** Approved leads as CSV for the sending tool. ?mark=1 also marks them in sequence. */
router.get('/:id/outbound/export.csv', authorize('admin'), guard((req, res) => {
  const mark = req.query.mark === '1';
  const { csv, count } = exportApprovedCsv(id(req), { markInSequence: mark, by: who(req) });
  audit(req, 'outbound_export', 'outbound_lead', { count, marked: mark });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="outbound-client-${id(req)}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ------------------------------------------------------------ cards and runs

router.get('/:id/growth/cards', authorize(...READ), guard((req, res) => {
  const monitor = MONITORS.includes(req.query.monitor) ? req.query.monitor : null;
  res.json({ cards: cardsFor(id(req), monitor) });
}));

router.post('/:id/growth/run/:card', authorize('admin'), guard((req, res) => {
  const r = queueGrowthRun(id(req), req.params.card, who(req));
  if (r.status !== 200) return send(res, r);
  audit(req, 'growth_run_queue', 'growth_run', { card: req.params.card, run: r.run.id });
  // The deliverability card needs no AI but still runs on the Mac with the others.
  const online = pushRunSignal('growth');
  return res.json({ success: true, run: r.run, starts: online ? 'now' : 'when the Mac connects' });
}));

router.post('/:id/growth/runs/:runId/cancel', authorize('admin'), guard((req, res) => send(res, cancelGrowthRun(id(req), parseInt(req.params.runId, 10)))));

router.get('/:id/growth/runs/:runId', authorize(...READ), guard((req, res) => {
  const run = getGrowthRun(id(req), parseInt(req.params.runId, 10));
  return run ? res.json({ run }) : res.status(404).json({ error: 'Run not found' });
}));

/** Put a run's Brain proposal into the Brain: { keys } to choose sections (default: empty ones only). */
router.post('/:id/growth/runs/:runId/apply', authorize('admin'), guard((req, res) => {
  const r = applyGrowthRun(id(req), parseInt(req.params.runId, 10), { keys: req.body?.keys }, who(req));
  if (r.status === 200) audit(req, 'growth_run_apply', 'client_brain', { run: req.params.runId, ...r.applied });
  send(res, r, (x) => ({ brain: x.brain, applied: x.applied }));
}));

router.get('/:id/growth/recommendations', authorize(...READ), guard((req, res) => {
  res.json({ recommendations: listRecommendations(id(req), { monitor: req.query.monitor, status: req.query.status ?? 'open' }) });
}));

router.patch('/:id/growth/recommendations/:recId', authorize('admin'), guard((req, res) => {
  send(res, setRecommendationStatus(id(req), parseInt(req.params.recId, 10), req.body?.status));
}));

export default router;
