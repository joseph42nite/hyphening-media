/**
 * Reel Lab, mounted at /api/reel-lab: the Script Tracker's "From viral reel"
 * and "Improve hooks" buttons. Logic lives in src/services/reelLab.js; the
 * writing happens on the Mac (scripts/ig_worker.mjs). Nothing here posts to
 * Instagram.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal, connectorStatus } from '../services/macConnector.js';
import { queueReelLabRun, listReelLabRuns, getReelLabRow, serializeReelLabRun, saveReelLabRun } from '../services/reelLab.js';

const router = Router();
router.use(authenticate);

// Same people who can write scripts (routes/marketing.js script routes).
const STAFF = ['admin', 'ops_social_media_manager'];

/** GET /api/reel-lab?client_id= — the client's recent runs, and whether the Mac is online. */
router.get('/', authorize(...STAFF), (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id, 10);
    if (!clientId) return res.status(400).json({ error: 'client_id is required' });
    res.json({ runs: listReelLabRuns(clientId, req.query.limit), connector: connectorStatus() });
  } catch (err) {
    console.error('[REEL-LAB] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/reel-lab — queue a run and tell the Mac to start it now. */
router.post('/', authorize(...STAFF), (req, res) => {
  try {
    const { client_id, mode, script_id, month, topic, references, notes } = req.body || {};
    const r = queueReelLabRun({
      clientId: parseInt(client_id, 10), mode: mode || 'new', scriptId: script_id ? parseInt(script_id, 10) : null,
      month, topic, references, notes, requestedBy: req.user.email || String(req.user.id),
    });
    if (r.error) return res.status(r.status).json({ error: r.error });
    logAction({
      actorId: req.user.id, actorEmail: req.user.email, action: 'create', entityType: 'reel_lab_run', entityId: r.run.id,
      diff: { client_id: r.run.client_id, mode: r.run.mode, script_id: r.run.script_id, references: r.run.references.length }, ip: req.ip,
    });
    const delivered = pushRunSignal('ig');
    res.status(201).json({ run: r.run, connector_online: delivered });
  } catch (err) {
    console.error('[REEL-LAB] Queue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/reel-lab/:id — one run, polled while the worker writes. */
router.get('/:id', authorize(...STAFF), (req, res) => {
  try {
    const row = getReelLabRow(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Reel Lab run not found' });
    res.json({ run: serializeReelLabRun(row), connector: connectorStatus() });
  } catch (err) {
    console.error('[REEL-LAB] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/reel-lab/:id/save { hook_index, title, month } — Draft script, or the improved script updated. */
router.post('/:id/save', authorize(...STAFF), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { hook_index, title, month } = req.body || {};
    const r = saveReelLabRun(id, { hookIndex: hook_index, title, month }, req.user.email);
    if (r.error) return res.status(r.status).json({ error: r.error });
    logAction({
      actorId: req.user.id, actorEmail: req.user.email, action: r.mode === 'improve' ? 'update' : 'create', entityType: 'script',
      entityId: r.script_id, diff: { reel_lab_run_id: id, hook_index }, ip: req.ip,
    });
    res.json({ success: true, script_id: r.script_id, run: serializeReelLabRun(getReelLabRow(id)) });
    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('script_updated', { client_id: r.client_id, script_id: r.script_id });
    }).catch((e) => console.error('[SSE] Broadcast error:', e));
  } catch (err) {
    console.error('[REEL-LAB] Save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
