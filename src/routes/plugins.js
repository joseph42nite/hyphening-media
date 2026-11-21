/**
 * The plugin versions panel in the SEO and Ads Monitors, mounted at
 * /api/plugins. Logic lives in src/services/plugins.js.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal } from '../services/macConnector.js';
import { listPlugins, requestPluginUpdate, cancelPluginUpdate, inNightHold, NIGHT_HOLD_IST } from '../services/plugins.js';

const router = Router();
router.use(authenticate);

/** GET /api/plugins?monitor=seo|ads — installed vs latest, Q's review, the last update. */
router.get('/', authorize('admin', 'api_readonly'), (req, res) => {
  try {
    const monitor = ['seo', 'ads'].includes(req.query.monitor) ? req.query.monitor : undefined;
    res.json(listPlugins({ monitor }));
  } catch (err) {
    console.error('[PLUGINS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/plugins/:plugin/update — Update & test. Starts now, or once the night runs are over. */
router.post('/:plugin/update', authorize('admin'), (req, res) => {
  const r = requestPluginUpdate(req.params.plugin, req.user);
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'plugin_update_requested', entityType: 'plugin_update', entityId: r.job.id, diff: { plugin: r.job.plugin, from: r.job.from_version, to: r.job.target_version } });
  const held = inNightHold();
  if (!held) pushRunSignal('plugins');
  res.json({ job: r.job, starts: held ? `after ${NIGHT_HOLD_IST.end} IST` : 'now' });
});

/** POST /api/plugins/updates/:id/cancel — only while it is still queued. */
router.post('/updates/:id/cancel', authorize('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = cancelPluginUpdate(id);
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'plugin_update_cancelled', entityType: 'plugin_update', entityId: id });
  res.json({ success: true });
});

export default router;
