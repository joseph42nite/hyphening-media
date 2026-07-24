import express from 'express';
import db from '../../database.js';
import { getConnectUrl, getClientConnectedAccounts } from '../services/composioService.js';
import { syncSingleContentMetrics, runMetricSyncWorker } from '../services/metricSyncWorker.js';

const router = express.Router();

/**
 * POST /api/clients/:id/integrations/connect
 * Initiate OAuth flow for a client platform
 */
router.post('/clients/:id/integrations/connect', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { appName, redirectUrl } = req.body;

    if (!appName) {
      return res.status(400).json({ error: 'appName is required (e.g. instagram, youtube, linkedin, facebook, x)' });
    }

    const client = db.prepare('SELECT id, name FROM crm_clients WHERE id = ?').get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const connectUrl = await getConnectUrl(clientId, appName, redirectUrl);
    res.json({ success: true, connectUrl });
  } catch (err) {
    console.error('[INTEGRATIONS] Error getting connect URL:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate connection URL' });
  }
});

/**
 * GET /api/clients/:id/integrations/status
 * Get connection status for all social channels of a client
 */
router.get('/clients/:id/integrations/status', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const accounts = await getClientConnectedAccounts(clientId);

    const platforms = ['instagram', 'youtube', 'linkedin', 'facebook', 'x'];
    const statusMap = {};

    platforms.forEach(p => {
      const match = accounts.find(acc => acc.appName.toLowerCase().includes(p));
      statusMap[p] = {
        connected: !!match,
        status: match ? 'Connected' : 'Not Connected',
        accountName: match?.accountName || null
      };
    });

    res.json({ success: true, clientId, integrations: statusMap });
  } catch (err) {
    console.error('[INTEGRATIONS] Error getting status:', err.message);
    res.status(500).json({ error: 'Failed to retrieve integration status' });
  }
});

/**
 * POST /api/marketing/content/sync-all-metrics
 * On-demand batch refresh for all posted content metrics
 */
router.post('/marketing/content/sync-all-metrics', async (req, res) => {
  try {
    await runMetricSyncWorker();
    res.json({ success: true, message: 'All post metrics synced successfully' });
  } catch (err) {
    console.error('[INTEGRATIONS] Batch metric sync failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to sync metrics' });
  }
});

/**
 * POST /api/marketing/content/:id/refresh-metrics
 * On-demand manual refresh for content metrics
 */
router.post('/marketing/content/:id/refresh-metrics', async (req, res) => {
  try {
    const contentId = parseInt(req.params.id, 10);
    const updatedMetrics = await syncSingleContentMetrics(contentId);
    res.json({ success: true, metrics: updatedMetrics });
  } catch (err) {
    console.error('[INTEGRATIONS] Manual metric refresh failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to refresh metrics' });
  }
});

export default router;
