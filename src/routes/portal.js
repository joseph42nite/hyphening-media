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
import { fetchPostComments, replyToComment } from '../services/commentSync.js';
import { countableLeadSql } from '../services/leadFilters.js';

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
 * High-level KPIs for the client, with optional ?month=YYYY-MM filtering.
 */
router.get('/:token/overview', portalAuth, (req, res) => {
  try {
    const clientId = req.portalClient.id;
    const { month } = req.query;

    const currentMonth = new Date().toISOString().slice(0, 7);

    // Fetch all available months for the client portal sorted latest month first
    let rawMonths = db.prepare(`
      SELECT DISTINCT SUBSTR(created_at, 1, 7) as month
      FROM campaign_leads
      WHERE client_id = ? AND created_at IS NOT NULL
      UNION
      SELECT DISTINCT COALESCE(NULLIF(month, ''), SUBSTR(created_at, 1, 7)) as month
      FROM marketing_ad_campaigns
      WHERE client_id = ? AND created_at IS NOT NULL
      UNION
      SELECT DISTINCT SUBSTR(COALESCE(NULLIF(date, ''), created_at), 1, 7) as month
      FROM marketing_content_tracker
      WHERE client_id = ? AND (date IS NOT NULL OR created_at IS NOT NULL)
      ORDER BY month DESC
    `).all(clientId, clientId, clientId).map(r => r.month).filter(m => m && m.length === 7);

    if (!rawMonths.includes(currentMonth)) {
      rawMonths.unshift(currentMonth);
    }
    const availableMonths = Array.from(new Set(rawMonths)).sort().reverse();

    // Default to 'all' (all months aggregated) unless a specific month is selected.
    const targetMonth = month ? month : 'all';
    const monthFilter = targetMonth !== 'all' ? targetMonth : null;

    // Leads flagged as tests are excluded from every figure the portal reports.
    let leadWhere = `WHERE client_id = ? AND ${countableLeadSql()}`;
    const leadParams = [clientId];
    if (monthFilter) {
      leadWhere += " AND SUBSTR(created_at, 1, 7) = ?";
      leadParams.push(monthFilter);
    }

    let contentWhere = "WHERE client_id = ? AND is_tracked = 1";
    const contentParams = [clientId];
    if (monthFilter) {
      contentWhere += " AND SUBSTR(COALESCE(NULLIF(date, ''), created_at), 1, 7) = ?";
      contentParams.push(monthFilter);
    }

    const contentStats = db.prepare(`
      SELECT 
        COUNT(*) as total_posts,
        ROUND(AVG(engagement_rate_pct), 2) as avg_engagement_rate,
        ROUND(AVG(content_score), 1) as avg_content_score,
        ROUND(AVG(avg_watch_time_pct), 1) as avg_watch_time,
        ROUND(AVG(skip_rate_pct), 1) as avg_skip_rate,
        SUM(views) as total_views,
        SUM(likes) as total_likes,
        SUM(comments) as total_comments,
        SUM(shares) as total_shares,
        SUM(saves) as total_saves
      FROM marketing_content_tracker 
      ${contentWhere}
    `).get(...contentParams);

    const leadStats = db.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN 
          LOWER(TRIM(COALESCE(qualification_status, ''))) = 'qualified' 
          OR LOWER(TRIM(COALESCE(lead_status, ''))) IN ('qualified', 'appointment booked', 'hot', 'converted') 
          OR LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed')
        THEN 1 ELSE 0 END) as qualified_leads,
        SUM(CASE WHEN 
          LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed') 
          OR LOWER(TRIM(COALESCE(lead_status, ''))) = 'appointment booked'
        THEN 1 ELSE 0 END) as appointments_booked
      FROM campaign_leads 
      ${leadWhere}
    `).get(...leadParams);

    const pendingApprovals = db.prepare(`
      SELECT COUNT(*) as count 
      FROM marketing_content_tracker 
      WHERE client_id = ? AND status = 'Pending Client Approval'
    `).get(clientId);

    const platformBreakdown = db.prepare(`
      SELECT platform, COUNT(*) as count, SUM(views) as views
      FROM marketing_content_tracker
      ${contentWhere}
      GROUP BY platform
    `).all(...contentParams);

    const adsBreakdown = db.prepare(`
      SELECT 
        COALESCE(NULLIF(TRIM(platform), ''), 'Other') as platform,
        COALESCE(NULLIF(TRIM(campaign_name), ''), 'Manual Entry') as campaign_name,
        COUNT(*) as leads,
        SUM(CASE WHEN 
          LOWER(TRIM(COALESCE(qualification_status, ''))) = 'qualified' 
          OR LOWER(TRIM(COALESCE(lead_status, ''))) IN ('qualified', 'appointment booked', 'hot', 'converted') 
          OR LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed')
        THEN 1 ELSE 0 END) as qualified_leads,
        SUM(CASE WHEN 
          LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed') 
          OR LOWER(TRIM(COALESCE(lead_status, ''))) = 'appointment booked'
        THEN 1 ELSE 0 END) as confirmed_bookings
      FROM campaign_leads
      ${leadWhere}
      GROUP BY platform, campaign_name
      ORDER BY leads DESC
    `).all(...leadParams);

    let trendWhere = "WHERE client_id = ? AND is_tracked = 1 AND status IN ('Posted', 'Client Approved')";
    const trendParams = [clientId];
    if (monthFilter) {
      trendWhere += " AND SUBSTR(COALESCE(NULLIF(date, ''), created_at), 1, 7) = ?";
      trendParams.push(monthFilter);
    }

    const viewsTrend = db.prepare(`
      SELECT date, title, (COALESCE(views, 0) + COALESCE(youtube_views, 0)) AS views, COALESCE(engagement_rate_pct, 0.0) AS engagement_rate_pct
      FROM marketing_content_tracker
      ${trendWhere}
      ORDER BY date DESC
      LIMIT 8
    `).all(...trendParams);

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
      available_months: availableMonths,
      selected_month: targetMonth,
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
        avg_watch_time_pct, skip_rate_pct,
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
      SELECT 
        l.id, l.name, l.email, l.phone, l.platform, l.source, l.campaign_name, l.treatment_type,
        l.lead_status, l.rejection_reason,
        l.call_duration_seconds, l.additional_data, l.created_at,
        l.qualification_status, l.call_outcome, l.appointment_status, l.appointment_date,
        l.follow_up_date,
        -- Without this the checkbox reads undefined on every load, so ticking it
        -- appears to do nothing the moment the list is re-read.
        l.is_test,
        (SELECT COUNT(*) FROM lead_contact_clicks c
          WHERE c.lead_id = l.id AND c.channel = 'call') AS call_clicks,
        (SELECT COUNT(*) FROM lead_contact_clicks c
          WHERE c.lead_id = l.id AND c.channel = 'whatsapp') AS whatsapp_clicks
      FROM campaign_leads l
      WHERE l.client_id = ?
      ORDER BY l.created_at DESC
    `).all(req.portalClient.id);

    // Bucketed by month so the leads tab can filter them with its own month
    // selector without a second request.
    const landingClicks = db.prepare(`
      SELECT
        SUBSTR(created_at, 1, 7) AS month,
        SUM(CASE WHEN channel = 'call' THEN 1 ELSE 0 END) AS call_clicks,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_clicks
      FROM landing_contact_clicks
      WHERE client_id = ?
      GROUP BY month
    `).all(req.portalClient.id);

    res.json({ leads, landing_clicks: landingClicks });
  } catch (err) {
    console.error('[PORTAL] Get leads error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/leads
 * Add a new lead manually from the Client Portal.
 */
router.post('/:token/leads', portalAuth, (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      platform, 
      source, 
      campaign_name, 
      treatment_type,
      created_at,
      qualification_status, 
      call_outcome, 
      appointment_status, 
      appointment_date, 
      rejection_reason 
    } = req.body;

    if (!name || !name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error: 'Name and Phone are required fields' });
    }

    const cleanPlatform = ['YouTube', 'Meta', 'Google', 'Other'].includes(platform) ? platform : 'Other';
    const cleanSource = ['form', 'call'].includes(source) ? source : 'form';
    const cleanQual = ['Pending', 'Qualified', 'Disqualified'].includes(qualification_status) ? qualification_status : 'Pending';
    const cleanCall = ['Pending', 'Picked Up', 'No Answer', 'Other'].includes(call_outcome) ? call_outcome : 'Pending';
    const cleanAppt = ['Follow Up', 'Booked', 'Not Booked'].includes(appointment_status) ? appointment_status : 'Follow Up';
    const cleanTreatment = treatment_type && treatment_type.trim() ? treatment_type.trim() : null;

    let calculatedLeadStatus = 'Pending';
    if (cleanQual === 'Disqualified') {
      calculatedLeadStatus = 'Rejected';
    } else if (cleanAppt === 'Booked') {
      calculatedLeadStatus = 'Appointment Booked';
    } else if (cleanQual === 'Qualified') {
      calculatedLeadStatus = 'Qualified';
    }

    const now = new Date().toISOString();
    const leadCreatedAt = created_at && created_at.trim() 
      ? (created_at.trim().includes(':') ? created_at.trim() : `${created_at.trim()} 12:00:00`)
      : now.replace('T', ' ').slice(0, 19);

    const result = db.prepare(`
      INSERT INTO campaign_leads (
        client_id, name, email, phone, platform, source, campaign_name, treatment_type,
        qualification_status, call_outcome, appointment_status, appointment_date,
        rejection_reason, lead_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.portalClient.id,
      name.trim(),
      email && email.trim() ? email.trim() : null,
      phone.trim(),
      cleanPlatform,
      cleanSource,
      campaign_name && campaign_name.trim() ? campaign_name.trim() : 'Manual Entry',
      cleanTreatment,
      cleanQual,
      cleanCall,
      cleanAppt,
      cleanAppt === 'Booked' ? (appointment_date || null) : null,
      (cleanQual === 'Disqualified' || cleanAppt === 'Not Booked') ? (rejection_reason || null) : null,
      calculatedLeadStatus,
      leadCreatedAt,
      now
    );

    if (req.portalClient.lead_alerts_enabled) {
      const alertMsg = `🔔 *New Lead Manually Added!*\n\n*Client:* ${req.portalClient.name}\n*Lead Name:* ${name.trim()}\n*Phone:* ${phone.trim()}\n*Platform:* ${cleanPlatform}\n*Source:* Manual Entry${cleanTreatment ? `\n*Treatment:* ${cleanTreatment}` : ''}\n*Date:* ${leadCreatedAt.slice(0, 10)}`;
      notifyAdmin(alertMsg);
    }

    const newLead = db.prepare('SELECT * FROM campaign_leads WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, lead: newLead });
  } catch (err) {
    console.error('[PORTAL] Manual lead creation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/leads/:leadId/status
 * Update progressive qualification, call, and appointment status for a lead.
 */
router.post('/:token/leads/:leadId/status', portalAuth, (req, res) => {
  try {
    const { leadId } = req.params;
    const { 
      qualification_status, 
      call_outcome, 
      appointment_status, 
      appointment_date, 
      rejection_reason,
      treatment_type,
      created_at,
      is_test,
      follow_up_date
    } = req.body;

    const lead = db.prepare('SELECT * FROM campaign_leads WHERE id = ? AND client_id = ?').get(leadId, req.portalClient.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Merge or fallback to existing values
    const newQual = qualification_status !== undefined ? qualification_status : lead.qualification_status;
    const newCall = call_outcome !== undefined ? call_outcome : lead.call_outcome;
    const newApptStatus = appointment_status !== undefined ? appointment_status : lead.appointment_status;
    const newApptDate = appointment_date !== undefined ? appointment_date : lead.appointment_date;
    const newRejection = rejection_reason !== undefined ? rejection_reason : lead.rejection_reason;
    const newTreatment = treatment_type !== undefined ? (treatment_type && treatment_type.trim() ? treatment_type.trim() : null) : lead.treatment_type;
    const newCreatedAt = created_at !== undefined ? (created_at && created_at.trim().includes(':') ? created_at.trim() : `${created_at.trim()} 12:00:00`) : lead.created_at;
    // Orthogonal to call_outcome: a test lead can still record what happened on
    // the call without that putting it back into the totals.
    const newIsTest = is_test !== undefined ? (is_test ? 1 : 0) : (lead.is_test ? 1 : 0);
    const rawFollowUp = follow_up_date !== undefined ? follow_up_date : lead.follow_up_date;
    const newFollowUp = rawFollowUp && String(rawFollowUp).trim() ? String(rawFollowUp).trim().slice(0, 10) : null;

    // Validate inputs
    if (newQual && !['Pending', 'Qualified', 'Disqualified'].includes(newQual)) {
      return res.status(400).json({ error: 'Invalid qualification status' });
    }
    if (newCall && !['Pending', 'Picked Up', 'No Answer', 'Other'].includes(newCall)) {
      return res.status(400).json({ error: 'Invalid call outcome' });
    }
    if (newApptStatus && !['Follow Up', 'Booked', 'Not Booked'].includes(newApptStatus)) {
      return res.status(400).json({ error: 'Invalid appointment status' });
    }
    if (newFollowUp && !/^\d{4}-\d{2}-\d{2}$/.test(newFollowUp)) {
      return res.status(400).json({ error: 'follow_up_date must be YYYY-MM-DD' });
    }

    // Compute lead_status for backward compatibility with dashboard metrics
    let calculatedLeadStatus = 'Pending';
    if (newQual === 'Disqualified') {
      calculatedLeadStatus = 'Rejected';
    } else if (newApptStatus === 'Booked') {
      calculatedLeadStatus = 'Appointment Booked';
    } else if (newQual === 'Qualified') {
      calculatedLeadStatus = 'Qualified';
    }

    db.prepare(`
      UPDATE campaign_leads
      SET 
        qualification_status = ?, 
        call_outcome = ?, 
        appointment_status = ?, 
        appointment_date = ?, 
        rejection_reason = ?,
        treatment_type = ?,
        created_at = ?,
        lead_status = ?,
        is_test = ?,
        follow_up_date = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      newQual, 
      newCall, 
      newApptStatus, 
      newApptStatus === 'Booked' ? newApptDate : null, 
      (newQual === 'Disqualified' || newApptStatus === 'Not Booked') ? newRejection : null, 
      newTreatment,
      newCreatedAt,
      calculatedLeadStatus,
      newIsTest,
      // A follow-up date only means anything while the lead is still awaiting
      // one; booking or closing it clears the reminder, as appointment_date
      // already does in the other direction.
      newApptStatus === 'Follow Up' ? newFollowUp : null,
      leadId
    );

    res.json({ 
      success: true, 
      qualification_status: newQual,
      call_outcome: newCall,
      appointment_status: newApptStatus,
      appointment_date: newApptStatus === 'Booked' ? newApptDate : null,
      rejection_reason: (newQual === 'Disqualified' || newApptStatus === 'Not Booked') ? newRejection : null,
      treatment_type: newTreatment,
      created_at: newCreatedAt,
      lead_status: calculatedLeadStatus,
      is_test: newIsTest,
      follow_up_date: newApptStatus === 'Follow Up' ? newFollowUp : null
    });
  } catch (err) {
    console.error('[PORTAL] Update lead status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/portal/:token/leads/:leadId/contact-click
 * Record that the client opened this lead's phone dialler or WhatsApp thread
 * from the portal. Fired by the buttons on the leads table; the returned counts
 * are summed per month into the cards above it.
 */
router.post('/:token/leads/:leadId/contact-click', portalAuth, (req, res) => {
  try {
    const { leadId } = req.params;
    const { channel } = req.body;

    if (!['call', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be call or whatsapp' });
    }

    // Scoped to the caller's own leads so a portal token cannot log clicks
    // against another client's rows.
    const lead = db.prepare('SELECT id FROM campaign_leads WHERE id = ? AND client_id = ?')
      .get(leadId, req.portalClient.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    db.prepare('INSERT INTO lead_contact_clicks (client_id, lead_id, channel) VALUES (?, ?, ?)')
      .run(req.portalClient.id, lead.id, channel);

    const leadCounts = db.prepare(`
      SELECT
        SUM(CASE WHEN channel = 'call' THEN 1 ELSE 0 END) AS call_clicks,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_clicks
      FROM lead_contact_clicks
      WHERE lead_id = ?
    `).get(lead.id);

    res.json({
      success: true,
      lead_id: lead.id,
      call_clicks: leadCounts.call_clicks || 0,
      whatsapp_clicks: leadCounts.whatsapp_clicks || 0,
    });
  } catch (err) {
    console.error('[PORTAL] Lead contact click error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/portal/:token/leads/:leadId
 * Remove a lead outright.
 *
 * Marking a lead as a test only stops it counting — the row stays on the table,
 * so a portal filling up with triggered test entries had no way to be cleared.
 *
 * Nothing references a lead: no foreign key points at campaign_leads, and every
 * total is computed from it live rather than cached, so a deleted row leaves
 * neither orphans nor stale figures. It also leaves no undo, which is why the
 * whole row is written to the audit log before it goes, and why the caller is
 * expected to confirm first.
 */
router.delete('/:token/leads/:leadId', portalAuth, (req, res) => {
  try {
    const { leadId } = req.params;

    // Scoped to the calling client's own leads, so a portal token cannot reach
    // another client's rows by guessing an id.
    const lead = db.prepare('SELECT * FROM campaign_leads WHERE id = ? AND client_id = ?')
      .get(leadId, req.portalClient.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    db.prepare('DELETE FROM campaign_leads WHERE id = ? AND client_id = ?')
      .run(leadId, req.portalClient.id);

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_delete_lead',
      entityType: 'campaign_lead',
      entityId: parseInt(leadId),
      diff: { client: req.portalClient.name, deleted: lead },
    });

    res.json({ success: true, id: parseInt(leadId) });
  } catch (err) {
    console.error('[PORTAL] Delete lead error:', err);
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
 * POST /api/portal/:token/contact-click
 * A visitor tapped Call or WhatsApp on the client's landing page.
 *
 * Unauthenticated for the same reason the capture webhook below is: it is
 * called from a public page that holds nothing but the portal token.
 *
 * Use this rather than leads/capture for button taps. A tap is an anonymous
 * visitor showing interest — there is no name, and filing one as a lead put
 * placeholder rows in the leads log that nobody could follow up.
 */
router.post('/:token/contact-click', (req, res) => {
  try {
    const { token } = req.params;
    const { channel, campaign_name, page_url } = req.body || {};

    if (!['call', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be call or whatsapp' });
    }

    const client = db.prepare(
      'SELECT id FROM crm_clients WHERE portal_token = ? AND portal_enabled = 1 AND is_active = 1'
    ).get(token);

    if (!client) {
      return res.status(404).json({ error: 'Client not found or portal disabled' });
    }

    db.prepare(`
      INSERT INTO landing_contact_clicks (client_id, channel, campaign_name, page_url)
      VALUES (?, ?, ?, ?)
    `).run(client.id, channel, campaign_name || null, page_url || null);

    res.json({ success: true });
  } catch (err) {
    console.error('[PORTAL] Landing contact click error:', err);
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
    const { name, email, phone, platform, source, campaign_name, treatment_type, service, treatment, call_duration_seconds, additional_data } = req.body;

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
    const cleanTreatment = treatment_type || service || treatment || (additional_data?.treatment) || (additional_data?.service) || null;
    const additionalDataStr = additional_data ? JSON.stringify(additional_data) : null;

    const result = db.prepare(`
      INSERT INTO campaign_leads (
        client_id, name, email, phone, platform, source, campaign_name, treatment_type, call_duration_seconds, additional_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client.id,
      name,
      email || null,
      phone,
      cleanPlatform,
      cleanSource,
      campaign_name || null,
      cleanTreatment,
      call_duration_seconds || null,
      additionalDataStr
    );

    // Send telegram notification to admin/SMM if lead alerts are enabled for this client
    if (client.lead_alerts_enabled) {
      const alertMsg = `🔔 *New Lead Captured!*\n\n*Client:* ${client.name}\n*Lead Name:* ${name}\n*Phone:* ${phone}\n*Platform:* ${cleanPlatform}\n*Source:* ${cleanSource === 'call' ? '📞 Call' : '📝 Form'}\n*Campaign:* ${campaign_name || 'N/A'}${cleanTreatment ? `\n*Treatment:* ${cleanTreatment}` : ''}`;
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
             t.id AS content_id, COALESCE(t.status, s.status) AS content_status, COALESCE(t.client_comments, s.client_comments) AS client_comments
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



/**
 * POST /api/portal/:token/content-plan/script/:scriptId/approve
 * Client approves a script directly (without content calendar entry mandatory).
 */
router.post('/:token/content-plan/script/:scriptId/approve', portalAuth, (req, res) => {
  try {
    const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
      .get(req.params.scriptId, req.portalClient.id);
    if (!script) return res.status(404).json({ error: 'Script not found' });

    const now = new Date().toISOString();

    // 1. Update script itself
    db.prepare(`
      UPDATE marketing_scripts
      SET status = 'Client Approved', client_comments = NULL, has_unseen_changes = 1, last_changed_by = 'client', updated_at = ?
      WHERE id = ?
    `).run(now, req.params.scriptId);

    // 2. Find linked content tracker entry
    const relation = db.prepare(`
      SELECT t.* FROM marketing_content_tracker t
      JOIN marketing_content_script_relation r ON t.id = r.content_id
      WHERE r.script_id = ? AND t.client_id = ?
    `).get(req.params.scriptId, req.portalClient.id);

    if (relation) {
      db.prepare(`
        UPDATE marketing_content_tracker 
        SET client_approved = 1, status = 'Client Approved', client_comments = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, relation.id);

      syncContentToKanbanTask(relation.id, db);
    }

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_approve',
      entityType: 'script',
      entityId: parseInt(req.params.scriptId),
      diff: { client: req.portalClient.name, is_standalone_script: !relation },
    });

    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('content_approved', { client_id: req.portalClient.id, script_id: req.params.scriptId });
    }).catch(e => console.error('[SSE] Broadcast error:', e));

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

    const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
      .get(req.params.scriptId, req.portalClient.id);
    if (!script) return res.status(404).json({ error: 'Script not found' });

    const now = new Date().toISOString();

    // 1. Update script itself
    db.prepare(`
      UPDATE marketing_scripts
      SET status = 'Client Rejected', client_comments = ?, has_unseen_changes = 1, last_changed_by = 'client', updated_at = ?
      WHERE id = ?
    `).run(comment, now, req.params.scriptId);

    // 2. Find linked content tracker entry
    const relation = db.prepare(`
      SELECT t.* FROM marketing_content_tracker t
      JOIN marketing_content_script_relation r ON t.id = r.content_id
      WHERE r.script_id = ? AND t.client_id = ?
    `).get(req.params.scriptId, req.portalClient.id);

    if (relation) {
      db.prepare(`
        UPDATE marketing_content_tracker 
        SET client_approved = 0, status = 'Client Rejected', client_comments = ?, updated_at = ?
        WHERE id = ?
      `).run(comment, now, relation.id);

      syncContentToKanbanTask(relation.id, db);
    }

    logAction({
      actorId: null,
      actorEmail: req.portalClient.contact_email,
      action: 'client_reject',
      entityType: 'script',
      entityId: parseInt(req.params.scriptId),
      diff: { client: req.portalClient.name, comment, is_standalone_script: !relation },
    });

    notifyAdmin(`⚠️ *Client Revision Request*\nClient *${req.portalClient.name}* requested changes on script *"${script.title}"*\n\n💬 *Feedback:* ${comment}`);

    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('client_feedback', { client_id: req.portalClient.id, message: `Revision requested on script "${script.title}": ${comment}` });
      broadcastEvent('task_updated', { title: script.title, status: 'todo' });
    }).catch(e => console.error('[SSE] Broadcast error:', e));

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

    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('content_approved', { client_id: req.portalClient.id, content_id: req.params.contentId });
    }).catch(e => console.error('[SSE] Broadcast error:', e));

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

    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('client_feedback', { client_id: req.portalClient.id, message: `Revision requested on "${content.title}": ${comment}` });
      broadcastEvent('task_updated', { title: content.title, status: 'todo' });
    }).catch(e => console.error('[SSE] Broadcast error:', e));

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

    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('client_feedback', { client_id: req.portalClient.id, message });
    }).catch(e => console.error('[SSE] Broadcast error:', e));

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
    // Only toolkits Composio actually provides. facebook_ads and google_ads
    // resolve to nothing, so offering them produced a Connect button that could
    // never succeed.
    const platforms = ['instagram', 'youtube', 'linkedin', 'facebook', 'x'];
    const statusMap = {};

    platforms.forEach(p => {
      const match = accounts.find(acc => {
        const name = (acc.appName || acc.toolkit?.slug || '').toLowerCase();
        const isActive = (acc.status || '').toUpperCase() === 'ACTIVE';
        return isActive && name.includes(p);
      });
      const accountHandle = match 
        ? (match.alias || match.data?.username || `@${req.portalClient.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`)
        : null;

      statusMap[p] = {
        connected: !!match,
        status: match ? 'Connected' : 'Not Connected',
        accountName: accountHandle
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
 * POST /api/portal/:token/comments/sync
 * Trigger a manual comment sync for this client's posted content
 */
router.post('/:token/comments/sync', portalAuth, async (req, res) => {
  try {
    const recentPosts = db.prepare(`
      SELECT t.*
      FROM marketing_content_tracker t
      WHERE t.client_id = ?
        AND t.status = 'Posted'
        AND (t.link IS NOT NULL OR t.platform_post_id IS NOT NULL OR t.instagram_media_id IS NOT NULL OR t.youtube_video_id IS NOT NULL)
    `).all(req.portalClient.id);

    const insertComment = db.prepare(`
      INSERT OR IGNORE INTO social_comments (
        content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let synced = 0;
    for (const post of recentPosts) {
      try {
        for (const comment of await fetchPostComments(req.portalClient.id, post)) {
          insertComment.run(
            post.id,
            req.portalClient.id,
            comment.platform,
            comment.id,
            comment.author,
            comment.text,
            comment.publishedAt || new Date().toISOString()
          );
          synced++;
        }
      } catch (err) {
        console.error(`[PORTAL-COMMENTS] Sync failed for post #${post.id}:`, err.message);
      }
    }

    res.json({ success: true, synced, postsChecked: recentPosts.length });
  } catch (err) {
    console.error('[PORTAL-COMMENTS] Manual sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync comments' });
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

    let result = null;
    if (process.env.COMPOSIO_API_KEY) {
      result = await replyToComment(req.portalClient.id, platform, commentId, replyText);
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

