/**
 * Badge counts for the dashboard tabs.
 *
 * One endpoint for every tab, so a count and the view it points at cannot drift
 * apart — the SEO badge and the amber "due" cards read the same rule.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getTabNotifications, markTabSeen, BADGED_TABS } from '../services/tabNotifications.js';

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
    res.json({ tabs: getTabNotifications(req.user?.id) });
  } catch (err) {
    console.error('[NOTIFICATIONS] Tab counts error:', err);
    // An empty object degrades to "no badges" rather than breaking the shell.
    res.json({ tabs: {} });
  }
});

/**
 * POST /api/notifications/tabs/:tab/seen
 *
 * "I have looked at this tab." Counts restart from whatever becomes actionable
 * after this moment, per user — one person clearing their badge does not clear
 * anyone else's.
 */
router.post('/tabs/:tab/seen', (req, res) => {
  const { tab } = req.params;
  if (!BADGED_TABS.includes(tab)) {
    return res.status(400).json({ error: 'Unknown tab' });
  }
  try {
    markTabSeen(req.user.id, tab);
    res.json({ success: true, tabs: getTabNotifications(req.user.id) });
  } catch (err) {
    console.error('[NOTIFICATIONS] Mark tab seen error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
