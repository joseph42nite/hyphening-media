/**
 * Marketing Ops Center — Client Portal Routes
 * Unique-URL dashboards for clients with content approval workflow.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../../database.js';
import { portalLimiter } from '../middleware/rateLimit.js';
import { logAction } from '../services/auditLogger.js';
import { notifyAdmin } from '../services/telegram.js';

const router = Router();

// Apply portal rate limiter
router.use(portalLimiter);

/**
 * Portal authentication middleware.
 * Validates token and optional PIN.
 */
function portalAuth(req, res, next) {
  const { token } = req.params;

  const client = db.prepare(
    'SELECT * FROM crm_clients WHERE portal_token = ? AND portal_enabled = 1 AND is_active = 1'
  ).get(token);

  if (!client) {
    return res.status(404).json({ error: 'Not found' });
  }

  // If PIN is set, check session or require PIN
  if (client.portal_pin) {
    const sessionPin = req.cookies?.[`portal_pin_${token}`];
    if (!sessionPin || sessionPin !== 'verified') {
      // Check if PIN is provided in body (for initial auth)
      const { pin } = req.body || {};
      if (!pin) {
        return res.status(401).json({ error: 'PIN required', requires_pin: true });
      }

      const valid = bcrypt.compareSync(pin, client.portal_pin);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }

      // Set session cookie for PIN verification
      res.cookie(`portal_pin_${token}`, 'verified', {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict',
      });
    }
  }

  // Update last accessed
  db.prepare('UPDATE crm_clients SET portal_last_accessed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), client.id);

  req.portalClient = client;
  next();
}

/**
 * POST /api/portal/:token/verify-pin
 * Verify PIN for portal access.
 */
router.post('/:token/verify-pin', (req, res) => {
  const { token } = req.params;
  const { pin } = req.body;

  const client = db.prepare(
    'SELECT id, name, portal_pin, portal_enabled FROM crm_clients WHERE portal_token = ? AND portal_enabled = 1'
  ).get(token);

  if (!client) return res.status(404).json({ error: 'Not found' });

  if (!client.portal_pin) {
    return res.json({ verified: true, client_name: client.name });
  }

  if (!pin) return res.status(400).json({ error: 'PIN is required' });

  const valid = bcrypt.compareSync(pin, client.portal_pin);
  if (!valid) return res.status(401).json({ error: 'Invalid PIN' });

  res.cookie(`portal_pin_${token}`, 'verified', {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict',
  });

  res.json({ verified: true, client_name: client.name });
});

/**
 * GET /api/portal/:token/overview
 * High-level KPIs for the client.
 */
router.get('/:token/overview', portalAuth, (req, res) => {
  try {
    const clientId = req.portalClient.id;

    const contentStats = db.prepare(`
      SELECT 
        COUNT(*) as total_posts,
        ROUND(AVG(engagement_rate_pct), 2) as avg_engagement_rate,
        ROUND(AVG(content_score), 1) as avg_content_score,
        SUM(views) as total_views,
        SUM(likes) as total_likes
      FROM marketing_content_tracker 
      WHERE client_id = ? AND is_tracked = 1
    `).get(clientId);

    const adStats = db.prepare(`
      SELECT 
        SUM(leads) as total_leads,
        ROUND(AVG(roas), 2) as avg_roas,
        SUM(total_ad_spend_inr) as total_spend,
        SUM(revenue_generated) as total_revenue
      FROM marketing_ad_campaigns 
      WHERE client_id = ?
    `).get(clientId);

    const pendingApprovals = db.prepare(`
      SELECT COUNT(*) as count 
      FROM marketing_content_tracker 
      WHERE client_id = ? AND status = 'Pending Client Approval'
    `).get(clientId);

    const platformBreakdown = db.prepare(`
      SELECT platform, COUNT(*) as count, SUM(views) as views
      FROM marketing_content_tracker
      WHERE client_id = ? AND is_tracked = 1
      GROUP BY platform
    `).all(clientId);

    const adsBreakdown = db.prepare(`
      SELECT platform, SUM(total_ad_spend_inr) as spend, SUM(leads) as leads
      FROM marketing_ad_campaigns
      WHERE client_id = ?
      GROUP BY platform
    `).all(clientId);

    res.json({
      client_name: req.portalClient.name,
      client_type: req.portalClient.client_type,
      content: contentStats,
      ads: adStats,
      pending_approvals: pendingApprovals.count,
      platform_breakdown: platformBreakdown,
      ads_breakdown: adsBreakdown
    });
  } catch (err) {
    console.error('[PORTAL] Overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/bookings
 * Booked gigs for the client (with pricing hidden).
 */
router.get('/:token/bookings', portalAuth, (req, res) => {
  try {
    const clientId = req.portalClient.id;

    // Retrieve gigs. Strictly omit fee_inr and advance_paid to secure pricing info.
    const bookings = db.prepare(`
      SELECT g.id, g.gig_date, g.status, 
        a.name as artist_name, a.artist_id as artist_code,
        v.name as venue_name
      FROM gig_status g
      LEFT JOIN artists a ON g.artist_id = a.id
      LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.client_id = ? OR v.client_id = ?
      ORDER BY g.gig_date DESC
    `).all(clientId, clientId);

    res.json({ bookings });
  } catch (err) {
    console.error('[PORTAL] Bookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/content
 * Past performance content (tracked only).
 */
router.get('/:token/content', portalAuth, (req, res) => {
  try {
    const content = db.prepare(`
      SELECT id, date, platform, post_type, title, status, views, likes, comments, shares, saves,
        engagement_rate_pct, content_score, boosted, link, time, caption, follows,
        youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr
      FROM marketing_content_tracker 
      WHERE client_id = ? AND is_tracked = 1 AND status IN ('Posted', 'Client Approved')
      ORDER BY date DESC
      LIMIT 50
    `).all(req.portalClient.id);

    res.json({ content });
  } catch (err) {
    console.error('[PORTAL] Content error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/ads
 * Ad campaign data.
 */
router.get('/:token/ads', portalAuth, (req, res) => {
  try {
    const ads = db.prepare(`
      SELECT platform, ad_campaign_name, leads, total_ad_spend_inr, impressions, clicks,
        ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas
      FROM marketing_ad_campaigns WHERE client_id = ?
      ORDER BY created_at DESC
    `).all(req.portalClient.id);

    res.json({ ads });
  } catch (err) {
    console.error('[PORTAL] Ads error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/content-plan
 * Upcoming content pending client approval.
 */
router.get('/:token/content-plan', portalAuth, (req, res) => {
  try {
    const plan = db.prepare(`
      SELECT id, date, platform, post_type, title, script, status, link, time, caption
      FROM marketing_content_tracker 
      WHERE client_id = ? AND status = 'Pending Client Approval'
      ORDER BY date ASC
    `).all(req.portalClient.id);

    res.json({ content_plan: plan });
  } catch (err) {
    console.error('[PORTAL] Content plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/content-plan/:contentId/approve
 * Client approves a content piece.
 */
router.post('/:token/content-plan/:contentId/approve', portalAuth, (req, res) => {
  try {
    const content = db.prepare(
      'SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ? AND status = ?'
    ).get(req.params.contentId, req.portalClient.id, 'Pending Client Approval');

    if (!content) return res.status(404).json({ error: 'Content not found or not pending approval' });

    db.prepare(`
      UPDATE marketing_content_tracker 
      SET client_approved = 1, status = 'Client Approved', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), req.params.contentId);

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_approve',
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      diff: { client: req.portalClient.name },
    });

    res.json({ message: 'Content approved', status: 'Client Approved' });
  } catch (err) {
    console.error('[PORTAL] Approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/content-plan/:contentId/reject
 * Client rejects a content piece (requires comment).
 */
router.post('/:token/content-plan/:contentId/reject', portalAuth, (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'A comment is required when requesting changes' });

    const content = db.prepare(
      'SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ? AND status = ?'
    ).get(req.params.contentId, req.portalClient.id, 'Pending Client Approval');

    if (!content) return res.status(404).json({ error: 'Content not found or not pending approval' });

    db.prepare(`
      UPDATE marketing_content_tracker 
      SET client_approved = 0, status = 'Client Rejected', client_comments = ?, updated_at = ?
      WHERE id = ?
    `).run(comment, new Date().toISOString(), req.params.contentId);

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_reject',
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      diff: { client: req.portalClient.name, comment },
    });

    // Send Telegram alert to Ops Manager
    notifyAdmin(`⚠️ *Client Revision Request*\nClient *${req.portalClient.name}* requested changes on *"${content.title}"*\n\n💬 *Feedback:* ${comment}`);

    res.json({ message: 'Changes requested', status: 'Client Rejected' });
  } catch (err) {
    console.error('[PORTAL] Reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/feedback
 * General client feedback/requests.
 */
router.post('/:token/feedback', portalAuth, (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Feedback message is required' });

    db.prepare('INSERT INTO client_requests (client_id, message) VALUES (?, ?)')
      .run(req.portalClient.id, message);

    // Send Telegram alert
    notifyAdmin(`💬 *New Client Feedback*\nClient: *${req.portalClient.name}*\n\n📝 *Message:* ${message}`);

    res.json({ message: 'Feedback submitted. Our team will review it shortly.' });
  } catch (err) {
    console.error('[PORTAL] Feedback error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
