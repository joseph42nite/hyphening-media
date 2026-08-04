/**
 * Badge counts for the dashboard tabs.
 *
 * One endpoint for every tab, so a count and the view it points at cannot drift
 * apart — the SEO badge and the amber "due" cards read the same rule.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getTabNotifications } from '../services/tabNotifications.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/notifications/tabs
 * -> { tabs: { seo: 12, scripts: 3 } }
 *
 * Only non-zero counts are returned, so the client can render a badge for every
 * key it receives without filtering.
 */
router.get('/tabs', (req, res) => {
  try {
    res.json({ tabs: getTabNotifications() });
  } catch (err) {
    console.error('[NOTIFICATIONS] Tab counts error:', err);
    // An empty object degrades to "no badges" rather than breaking the shell.
    res.json({ tabs: {} });
  }
});

export default router;
