/**
 * Manual or auto per fleet, mounted at /api/automation.
 *
 * One route for every fleet the scheduler checks (src/services/automationMode.js).
 * /api/ads/automation stays as it was for the ads worker and older callers.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { getMode, setMode, MODES } from '../services/automationMode.js';

export const SCOPES = ['ads', 'seo', 'blog'];

const router = Router();
router.use(authenticate);

router.param('scope', (req, res, next, scope) => {
  if (!SCOPES.includes(scope)) return res.status(404).json({ error: `Unknown fleet: ${scope}` });
  next();
});

/** GET /api/automation/:scope — 'manual' or 'auto'. */
router.get('/:scope', (req, res) => {
  res.json({ scope: req.params.scope, mode: getMode(req.params.scope) });
});

/** PUT /api/automation/:scope — { mode }. Admins only: auto runs and spends tokens unattended. */
router.put('/:scope', (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { scope } = req.params;
    const { mode } = req.body || {};
    if (!MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of: ${MODES.join(', ')}` });
    const previous = getMode(scope);
    const current = setMode(scope, mode);
    logAction({
      actorId: req.user.id, actorEmail: req.user.email,
      action: `${scope}_automation_mode_changed`, entityType: 'automation_mode',
      entityId: scope, diff: { from: previous, to: current },
    });
    res.json({ scope, mode: current });
  } catch (err) {
    console.error('[AUTOMATION] Mode change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
