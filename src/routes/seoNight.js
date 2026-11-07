/**
 * Night SEO's admin side, mounted at /api/seo-night: the SEO Monitor's
 * "Last night" section, Deploy / Discard per client, and Fix tonight / Ignore
 * per recommendation. Logic lives in src/services/seoNight.js.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal, connectorStatus } from '../services/macConnector.js';
import { nightReport, requestDeploy, discardBatch, approveFixTonight, ignoreRecommendation } from '../services/seoNight.js';

const router = Router();
router.use(authenticate);

/** GET /api/seo-night/report — per SEO-on client: last night's runs, fixes, needs-007 and failures. */
router.get('/report', authorize('admin', 'api_readonly'), (req, res) => {
  try {
    res.json({ ...nightReport(), connector: connectorStatus() });
  } catch (err) {
    console.error('[SEO NIGHT] Report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/seo-night/batches/:id/deploy — the approval: push and deploy that night's fixes. */
router.post('/batches/:id/deploy', authorize('admin'), (req, res) => {
  const r = requestDeploy(parseInt(req.params.id, 10), req.user);
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  const delivered = pushRunSignal('deploy');
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'seo_fixes_deploy_requested', entityType: 'seo_fix_batch', entityId: r.batch.id, diff: { client_id: r.batch.client_id } });
  res.json({ batch: r.batch, connector_online: delivered });
});

/** POST /api/seo-night/batches/:id/discard */
router.post('/batches/:id/discard', authorize('admin'), (req, res) => {
  const r = discardBatch(parseInt(req.params.id, 10), req.user);
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'seo_fixes_discarded', entityType: 'seo_fix_batch', entityId: parseInt(req.params.id, 10) });
  res.json({ success: true });
});

/** POST /api/seo-night/recommendations/:id/fix-tonight */
router.post('/recommendations/:id/fix-tonight', authorize('admin'), (req, res) => {
  const r = approveFixTonight(parseInt(req.params.id, 10), req.user);
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'seo_fix_approved', entityType: 'seo_recommendation', entityId: parseInt(req.params.id, 10) });
  res.json({ success: true });
});

/** POST /api/seo-night/recommendations/:id/ignore */
router.post('/recommendations/:id/ignore', authorize('admin'), (req, res) => {
  const r = ignoreRecommendation(parseInt(req.params.id, 10));
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  res.json({ success: true });
});

export default router;
