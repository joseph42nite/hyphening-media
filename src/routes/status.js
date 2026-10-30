/**
 * Marketing Ops Center — Client Status Snapshot
 * One read-only row per client with the control flags and Google property ids
 * that bots must check before acting. Whitelist columns only: nothing from
 * crm_clients is spread into the response, so tokens, pins and contact data
 * cannot leak.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/status/clients
 * Admins and the api_readonly account (also allow-listed in auth middleware).
 */
router.get('/clients', authorize('admin', 'api_readonly'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, client_type, is_active,
             blog_enabled, seo_enabled, ads_enabled,
             gsc_property, ga4_property_id
      FROM crm_clients
      ORDER BY id
    `).all();

    res.json({
      generated_at: new Date().toISOString(),
      clients: rows.map(r => ({
        id: r.id,
        name: r.name,
        client_type: r.client_type,
        is_active: !!r.is_active,
        blog_enabled: !!r.blog_enabled,
        seo_enabled: !!r.seo_enabled,
        ads_enabled: !!r.ads_enabled,
        gsc_property: r.gsc_property || null,
        ga4_property_id: r.ga4_property_id || null,
      })),
    });
  } catch (err) {
    console.error('[STATUS] Client status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
