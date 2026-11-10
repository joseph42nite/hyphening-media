/**
 * Manual tasks tab (src/services/manualTasks.js). A task's :key is an SEO
 * finding id, or 'ads-<id>' for an ads finding, as in the Site changes routes.
 *
 *   GET  /api/manual-tasks?client_id=10   tasks grouped by area, plus the
 *        backlink gap status of each approved competitor
 *   POST /api/manual-tasks/:key/assign    { assigned_to: email | null }
 *   POST /api/manual-tasks/:key/done      { note? }
 *   POST /api/manual-tasks/:key/skip      { reason }
 *
 * "Fix tonight" on a site change uses the existing
 * POST /api/seo-night/recommendations/:id/fix-tonight.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { listManualTasks, assignManualTask, closeManualTask } from '../services/manualTasks.js';
import { gapStatusByCompetitor } from '../services/backlinkGap.js';
import db from '../../database.js';

const router = Router();
router.use(authenticate);

const STAFF = ['admin', 'ops_social_media_manager'];

router.get('/', authorize(...STAFF, 'api_readonly'), (req, res) => {
  const clientId = Number(req.query.client_id);
  if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ error: 'client_id is required' });
  try {
    const gap = gapStatusByCompetitor(clientId);
    const backlinkGap = db.prepare("SELECT domain, label FROM client_competitors WHERE client_id = ? AND status = 'approved' ORDER BY domain")
      .all(clientId).map((c) => ({ ...c, gap: gap[c.domain] || null }));
    res.json({ ...listManualTasks(clientId), backlink_gap: backlinkGap });
  } catch (err) {
    console.error('[MANUAL TASKS] list failed:', err.message);
    res.status(500).json({ error: 'Could not load manual tasks' });
  }
});

const log = (req, action, diff) => logAction({ actorId: req.user.id, actorEmail: req.user.email, action, entityType: 'manual_task', entityId: req.params.key, diff });

function send(res, result) {
  return result.status === 200 ? res.json({ ok: true }) : res.status(result.status).json({ error: result.error });
}

router.post('/:key/assign', authorize('admin'), (req, res) => {
  const result = assignManualTask(req.params.key, req.body?.assigned_to || null);
  if (result.status === 200) log(req, 'manual_task_assign', { to: req.body?.assigned_to || null });
  send(res, result);
});

router.post('/:key/done', authorize(...STAFF), (req, res) => {
  const result = closeManualTask(req.params.key, 'done', { note: req.body?.note, user: req.user });
  if (result.status === 200) log(req, 'manual_task_done');
  send(res, result);
});

router.post('/:key/skip', authorize(...STAFF), (req, res) => {
  const result = closeManualTask(req.params.key, 'skip', { note: req.body?.reason, user: req.user });
  if (result.status === 200) log(req, 'manual_task_skip', { reason: req.body?.reason });
  send(res, result);
});

export default router;
