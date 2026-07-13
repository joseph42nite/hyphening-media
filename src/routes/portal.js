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
import { syncContentToKanbanTask } from '../services/kanbanSync.js';
import { getConnectUrl, getClientConnectedAccounts, executeClientAction } from '../services/composioService.js';

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

    const leadStats = db.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN lead_status = 'Qualified' THEN 1 ELSE 0 END) as qualified_leads,
        SUM(CASE WHEN lead_status = 'Appointment Booked' THEN 1 ELSE 0 END) as appointments_booked
      FROM campaign_leads 
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
      SELECT platform, COUNT(*) as leads
      FROM campaign_leads
      WHERE client_id = ?
      GROUP BY platform
    `).all(clientId);

    const viewsTrend = db.prepare(`
      SELECT date, title, (COALESCE(views, 0) + COALESCE(youtube_views, 0)) AS views, COALESCE(engagement_rate_pct, 0.0) AS engagement_rate_pct
      FROM marketing_content_tracker
      WHERE client_id = ? AND is_tracked = 1 AND status IN ('Posted', 'Client Approved')
      ORDER BY date DESC
      LIMIT 8
    `).all(clientId);

    // Reverse array to render chronologically (oldest to newest) from left to right
    viewsTrend.reverse();

    // Get sister companies (all clients in the family hierarchy, excluding the client itself)
    const parentId = req.portalClient.parent_id || clientId;
    const familyClients = db.prepare(`
      SELECT id, name 
      FROM crm_clients 
      WHERE id = ? OR parent_id = ?
    `).all(parentId, parentId);

    const sisterCompanies = familyClients
      .filter(c => c.id !== clientId)
      .map(c => c.name);

    res.json({
      client_name: req.portalClient.name,
      client_type: req.portalClient.client_type,
      lead_alerts_enabled: req.portalClient.lead_alerts_enabled,
      content: contentStats,
      ads: leadStats,
      pending_approvals: pendingApprovals.count,
      platform_breakdown: platformBreakdown,
      ads_breakdown: adsBreakdown,
      sister_companies: sisterCompanies,
      views_trend: viewsTrend
    });
  } catch (err) {
    console.error('[PORTAL] Overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/bookings
 * Booked gigs for the client and their sister companies (with pricing hidden).
 */
router.get('/:token/bookings', portalAuth, (req, res) => {
  try {
    const clientId = req.portalClient.id;

    // Find the parent ID
    const parentId = req.portalClient.parent_id || clientId;

    // Find all clients in the family (parent + children)
    const familyClients = db.prepare(`
      SELECT id 
      FROM crm_clients 
      WHERE id = ? OR parent_id = ?
    `).all(parentId, parentId);

    const clientIds = familyClients.map(c => c.id);

    if (clientIds.length === 0) {
      return res.json({ bookings: [] });
    }

    // Build placeholders for IN clause
    const placeholders = clientIds.map(() => '?').join(',');

    // Retrieve gigs for all family clients. Strictly omit fee_inr and advance_paid.
    const bookings = db.prepare(`
      SELECT g.id, g.gig_date, g.status, g.swiggy_link, g.zomato_link,
        a.name as artist_name, a.artist_id as artist_code,
        v.name as venue_name,
        COALESCE(c.name, vc.name) as client_name
      FROM gig_status g
      LEFT JOIN artists a ON g.artist_id = a.id
      LEFT JOIN venues v ON g.venue_id = v.id
      LEFT JOIN crm_clients c ON g.client_id = c.id
      LEFT JOIN crm_clients vc ON v.client_id = vc.id
      WHERE g.client_id IN (${placeholders}) OR v.client_id IN (${placeholders})
      ORDER BY g.gig_date DESC
    `).all(...clientIds, ...clientIds);

    // Dynamic date-based link expiration
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const bookingsWithExpiredLinks = bookings.map(b => {
      const isPast = b.gig_date < today;
      return {
        ...b,
        swiggy_link: isPast ? null : b.swiggy_link,
        zomato_link: isPast ? null : b.zomato_link
      };
    });

    res.json({ bookings: bookingsWithExpiredLinks });
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
 * GET /api/portal/:token/leads
 * Get captured leads for client.
 */
router.get('/:token/leads', portalAuth, (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT id, name, email, phone, platform, source, campaign_name, lead_status, rejection_reason, call_duration_seconds, additional_data, created_at
      FROM campaign_leads
      WHERE client_id = ?
      ORDER BY created_at DESC
    `).all(req.portalClient.id);

    res.json({ leads });
  } catch (err) {
    console.error('[PORTAL] Get leads error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/leads/:leadId/status
 * Update qualification status and rejection reason for a lead.
 */
router.post('/:token/leads/:leadId/status', portalAuth, (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, rejection_reason } = req.body;

    const lead = db.prepare('SELECT id FROM campaign_leads WHERE id = ? AND client_id = ?').get(leadId, req.portalClient.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!['Pending', 'Qualified', 'Appointment Booked', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare(`
      UPDATE campaign_leads
      SET lead_status = ?, rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, status === 'Rejected' ? rejection_reason : null, leadId);

    res.json({ success: true, lead_status: status, rejection_reason });
  } catch (err) {
    console.error('[PORTAL] Update lead status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/lead-alerts
 * Toggle leads alerts setting (toggles lead_alerts_enabled).
 */
router.post('/:token/lead-alerts', portalAuth, (req, res) => {
  try {
    const { enabled } = req.body;
    const val = enabled ? 1 : 0;

    db.prepare('UPDATE crm_clients SET lead_alerts_enabled = ? WHERE id = ?')
      .run(val, req.portalClient.id);

    res.json({ success: true, lead_alerts_enabled: val === 1 });
  } catch (err) {
    console.error('[PORTAL] Toggle lead alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/leads/capture
 * Webhook-ready lead capture API. No PIN authentication required.
 */
router.post('/:token/leads/capture', async (req, res) => {
  try {
    const { token } = req.params;
    const { name, email, phone, platform, source, campaign_name, call_duration_seconds, additional_data } = req.body;

    const client = db.prepare(
      'SELECT id, name, lead_alerts_enabled FROM crm_clients WHERE portal_token = ? AND portal_enabled = 1 AND is_active = 1'
    ).get(token);

    if (!client) {
      return res.status(404).json({ error: 'Client not found or portal disabled' });
    }

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone are required fields' });
    }

    const cleanPlatform = ['YouTube', 'Meta', 'Google', 'Other'].includes(platform) ? platform : 'Other';
    const cleanSource = ['form', 'call'].includes(source) ? source : 'form';
    const additionalDataStr = additional_data ? JSON.stringify(additional_data) : null;

    const result = db.prepare(`
      INSERT INTO campaign_leads (
        client_id, name, email, phone, platform, source, campaign_name, call_duration_seconds, additional_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client.id,
      name,
      email || null,
      phone,
      cleanPlatform,
      cleanSource,
      campaign_name || null,
      call_duration_seconds || null,
      additionalDataStr
    );

    // Send telegram notification to admin/SMM if lead alerts are enabled for this client
    if (client.lead_alerts_enabled) {
      const alertMsg = `🔔 *New Lead Captured!*\n\n*Client:* ${client.name}\n*Lead Name:* ${name}\n*Phone:* ${phone}\n*Platform:* ${cleanPlatform}\n*Source:* ${cleanSource === 'call' ? '📞 Call' : '📝 Form'}\n*Campaign:* ${campaign_name || 'N/A'}`;
      notifyAdmin(alertMsg);
    }

    res.json({ success: true, lead_id: result.lastInsertRowid });
  } catch (err) {
    console.error('[PORTAL] Capture lead error:', err);
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
 * GET /api/portal/:token/scripts
 * Retrieve monthly scripts/reading materials for the client.
 */
router.get('/:token/scripts', portalAuth, (req, res) => {
  try {
    const scripts = db.prepare(`
      SELECT s.id, s.month, s.title, s.script_text, s.format, s.reference_video_link, s.reaction_video_link, s.updated_at,
             t.id AS content_id, t.status AS content_status, t.client_comments AS client_comments
      FROM marketing_scripts s
      LEFT JOIN marketing_content_script_relation r ON s.id = r.script_id
      LEFT JOIN marketing_content_tracker t ON r.content_id = t.id
      WHERE s.client_id = ?
      ORDER BY s.month DESC, s.created_at DESC
    `).all(req.portalClient.id);

    res.json({ scripts });
  } catch (err) {
    console.error('[PORTAL] Scripts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/portal/:token/seo-reports
 * Retrieve monthly SEO reports for the client.
 */
router.get('/:token/seo-reports', portalAuth, (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT *
      FROM marketing_monthly_report
      WHERE client_id = ?
      ORDER BY month DESC
    `).all(req.portalClient.id);

    res.json({ reports });
  } catch (err) {
    console.error('[PORTAL] SEO Reports error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: auto-link a standalone script to the content tracker upon client approval/rejection
const getOrCreateContentForScript = (db, scriptId, clientId) => {
  // Check if relation already exists
  const existing = db.prepare(`
    SELECT t.* FROM marketing_content_tracker t
    JOIN marketing_content_script_relation r ON t.id = r.content_id
    WHERE r.script_id = ? AND t.client_id = ?
  `).get(scriptId, clientId);

  if (existing) {
    return existing;
  }

  // Load script
  const script = db.prepare(
    'SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?'
  ).get(scriptId, clientId);

  if (!script) return null;

  // Create content tracker entry
  const scheduledDate = script.month ? `${script.month}-01` : null;
  const platform = script.format === 'long_format' ? 'youtube' : 'instagram';
  const postType = script.format === 'long_format' ? 'Youtube' : 'Reel';

  const result = db.prepare(`
    INSERT INTO marketing_content_tracker (
      client_id, platform, date, post_type, title, script, status, client_approved, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?)
  `).run(
    clientId,
    platform,
    scheduledDate,
    postType,
    script.title,
    script.script_text,
    'Pending Client Approval',
    new Date().toISOString(),
    new Date().toISOString()
  );

  const contentId = result.lastInsertRowid;

  // Insert relation
  db.prepare(`
    INSERT INTO marketing_content_script_relation (content_id, script_id)
    VALUES (?, ?)
  `).run(contentId, scriptId);

  return db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ?').get(contentId);
};

/**
 * POST /api/portal/:token/content-plan/script/:scriptId/approve
 * Client approves a script directly (without content calendar entry mandatory).
 */
router.post('/:token/content-plan/script/:scriptId/approve', portalAuth, (req, res) => {
  try {
    const content = getOrCreateContentForScript(db, req.params.scriptId, req.portalClient.id);
    if (!content) return res.status(404).json({ error: 'Script not found' });

    db.prepare(`
      UPDATE marketing_content_tracker 
      SET client_approved = 1, status = 'Client Approved', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), content.id);

    syncContentToKanbanTask(content.id, db);

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_approve',
      entityType: 'content',
      entityId: content.id,
      diff: { client: req.portalClient.name },
    });

    res.json({ message: 'Script approved', status: 'Client Approved' });
  } catch (err) {
    console.error('[PORTAL] Approve script error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/content-plan/script/:scriptId/reject
 * Client rejects a script directly (without content calendar entry mandatory).
 */
router.post('/:token/content-plan/script/:scriptId/reject', portalAuth, (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'A comment is required when requesting changes' });

    const content = getOrCreateContentForScript(db, req.params.scriptId, req.portalClient.id);
    if (!content) return res.status(404).json({ error: 'Script not found' });

    db.prepare(`
      UPDATE marketing_content_tracker 
      SET client_approved = 0, status = 'Client Rejected', client_comments = ?, updated_at = ?
      WHERE id = ?
    `).run(comment, new Date().toISOString(), content.id);

    syncContentToKanbanTask(content.id, db);

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_reject',
      entityType: 'content',
      entityId: content.id,
      diff: { client: req.portalClient.name, comment },
    });

    notifyAdmin(`⚠️ *Client Revision Request*\nClient *${req.portalClient.name}* requested changes on script *"${content.title}"*\n\n💬 *Feedback:* ${comment}`);

    res.json({ message: 'Changes requested', status: 'Client Rejected' });
  } catch (err) {
    console.error('[PORTAL] Reject script error:', err);
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

    syncContentToKanbanTask(req.params.contentId, db);

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

    syncContentToKanbanTask(req.params.contentId, db);

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

/**
 * GET /api/portal/:token/integrations/status
 * Fetch social platform connection status for client portal
 */
router.get('/:token/integrations/status', portalAuth, async (req, res) => {
  try {
    const accounts = await getClientConnectedAccounts(req.portalClient.id);
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

    res.json({ success: true, integrations: statusMap });
  } catch (err) {
    console.error('[PORTAL-INTEGRATIONS] Status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch integration status' });
  }
});

/**
 * POST /api/portal/:token/integrations/connect
 * Initiate Composio OAuth flow for a social platform
 */
router.post('/:token/integrations/connect', portalAuth, async (req, res) => {
  try {
    const { appName, redirectUrl } = req.body;
    if (!appName) {
      return res.status(400).json({ error: 'appName is required' });
    }

    const connectUrl = await getConnectUrl(req.portalClient.id, appName, redirectUrl);
    res.json({ success: true, connectUrl });
  } catch (err) {
    console.error('[PORTAL-INTEGRATIONS] Connect error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate connect URL' });
  }
});

/**
 * GET /api/portal/:token/comments
 * Fetch cached social comments for client inbox
 */
router.get('/:token/comments', portalAuth, (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT sc.*, ct.title AS post_title
      FROM social_comments sc
      LEFT JOIN marketing_content_tracker ct ON sc.content_id = ct.id
      WHERE sc.client_id = ?
      ORDER BY sc.created_at DESC
      LIMIT 50
    `).all(req.portalClient.id);

    res.json({ success: true, comments });
  } catch (err) {
    console.error('[PORTAL-COMMENTS] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

/**
 * POST /api/portal/:token/comments/reply
 * Reply to a social comment via Composio
 */
router.post('/:token/comments/reply', portalAuth, async (req, res) => {
  try {
    const { commentId, replyText, platform = 'instagram' } = req.body;
    if (!commentId || !replyText) {
      return res.status(400).json({ error: 'commentId and replyText are required' });
    }

    const p = platform.toLowerCase();
    const actionName = p.includes('youtube') ? 'YOUTUBE_REPLY_COMMENT' : 'INSTAGRAM_REPLY_COMMENT';
    const params = p.includes('youtube') 
      ? { comment_id: commentId, text: replyText }
      : { comment_id: commentId, message: replyText };

    let result = null;
    if (process.env.COMPOSIO_API_KEY) {
      result = await executeClientAction(req.portalClient.id, actionName, params);
    } else {
      console.log(`[PORTAL-COMMENTS] [MOCK] Dry-run reply to comment ${commentId}: "${replyText}"`);
      result = { success: true, mock: true };
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('[PORTAL-COMMENTS] Reply error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to reply to comment' });
  }
});

export default router;

