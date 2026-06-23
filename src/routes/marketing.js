/**
 * Marketing Ops Center — Marketing Content Routes
 * Content planning, tracking, review queue, and auto-computed metrics.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

router.use(authenticate);

/**
 * Compute derived metrics for a content row.
 */
function computeContentMetrics(row) {
  const { views, likes, comments, shares, saves, avg_watch_time_pct } = row;

  let engagement_rate_pct = null;
  let save_rate_pct = null;
  let skip_rate_pct = null;
  let content_score = null;

  if (views && views > 0) {
    engagement_rate_pct = ((likes + comments + shares + saves) / views) * 100;
    save_rate_pct = (saves / views) * 100;
  }

  if (avg_watch_time_pct !== null && avg_watch_time_pct !== undefined) {
    skip_rate_pct = 100 - avg_watch_time_pct;
  }

  if (engagement_rate_pct !== null && save_rate_pct !== null && avg_watch_time_pct !== null) {
    const rawScore = (engagement_rate_pct * 0.3) + (save_rate_pct * 2.5) + (avg_watch_time_pct * 0.45);
    content_score = Math.round(rawScore * 10) / 10;
  }

  return {
    engagement_rate_pct: engagement_rate_pct !== null ? Math.round(engagement_rate_pct * 100) / 100 : null,
    save_rate_pct: save_rate_pct !== null ? Math.round(save_rate_pct * 100) / 100 : null,
    skip_rate_pct: skip_rate_pct !== null ? Math.round(skip_rate_pct * 100) / 100 : null,
    content_score,
  };
}

/**
 * Compute derived metrics for an ad campaign row.
 */
function computeAdMetrics(row) {
  const { impressions, clicks, total_ad_spend_inr, leads, revenue_generated } = row;

  return {
    ctr_pct: impressions > 0 ? Math.round((clicks / impressions) * 100 * 100) / 100 : null,
    cpc_inr: clicks > 0 ? Math.round(total_ad_spend_inr / clicks) : null,
    cpl_inr: leads > 0 ? Math.round(total_ad_spend_inr / leads) : null,
    roas: total_ad_spend_inr > 0 ? Math.round((revenue_generated / total_ad_spend_inr) * 100) / 100 : null,
  };
}

// =========================================
// CONTENT TRACKER
// =========================================

/**
 * GET /api/clients/:id/marketing/content
 * List tracked content for a client.
 */
router.get('/:id/marketing/content', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { is_tracked, platform, status } = req.query;
    let query = 'SELECT * FROM marketing_content_tracker WHERE client_id = ?';
    const params = [req.params.id];

    if (is_tracked !== undefined) {
      query += ' AND is_tracked = ?';
      params.push(parseInt(is_tracked));
    }
    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY date DESC';
    res.json({ content: db.prepare(query).all(...params) });
  } catch (err) {
    console.error('[MARKETING] Content list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/content
 * Create draft content plan.
 */
router.post('/:id/marketing/content', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const clientId = req.params.id;
    const {
      platform, date, post_type, title, script, link, time, caption, status,
      views, likes, comments, shares, saves, avg_watch_time_pct, boosted,
      follows, youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr
    } = req.body;

    let finalTitle = title;
    if (!finalTitle) {
      if (script) {
        finalTitle = script.slice(0, 30) + (script.length > 30 ? '...' : '');
      } else if (caption) {
        finalTitle = caption.slice(0, 30) + (caption.length > 30 ? '...' : '');
      } else {
        finalTitle = `Content Plan - ${date || new Date().toISOString().split('T')[0]}`;
      }
    }

    const rowForMetrics = {
      views: views || 0,
      likes: likes || 0,
      comments: comments || 0,
      shares: shares || 0,
      saves: saves || 0,
      avg_watch_time_pct: avg_watch_time_pct !== undefined ? avg_watch_time_pct : null
    };
    const computed = computeContentMetrics(rowForMetrics);

    const result = db.prepare(`
      INSERT INTO marketing_content_tracker (
        client_id, platform, date, post_type, title, script, link, time, caption, status, source,
        views, likes, comments, shares, saves, avg_watch_time_pct, boosted, follows,
        youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
        engagement_rate_pct, save_rate_pct, content_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      platform || null,
      date || null,
      post_type || null,
      finalTitle,
      script || null,
      link || null,
      time || null,
      caption || null,
      status || 'Draft',
      views || 0,
      likes || 0,
      comments || 0,
      shares || 0,
      saves || 0,
      avg_watch_time_pct !== undefined ? avg_watch_time_pct : null,
      boosted || 'No',
      follows || 0,
      youtube_views || 0,
      youtube_watch_time || 0.0,
      youtube_avg_view_duration || null,
      youtube_ctr || 0.0,
      computed.engagement_rate_pct,
      computed.save_rate_pct,
      computed.content_score
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'content',
      entityId: result.lastInsertRowid,
      diff: { title: finalTitle, client_id: clientId },
      ip: req.ip,
    });

    res.status(201).json(db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error('[MARKETING] Content create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id/marketing/content/:contentId
 * Update content fields and recalculate derived metrics.
 */
router.patch('/:id/marketing/content/:contentId', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const content = db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ?')
      .get(req.params.contentId, req.params.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const allowedFields = [
      'platform', 'date', 'post_type', 'title', 'script', 'status',
      'views', 'likes', 'comments', 'shares', 'saves', 'avg_watch_time_pct',
      'boosted', 'metric_override',
      'link', 'time', 'caption', 'follows',
      'youtube_views', 'youtube_watch_time', 'youtube_avg_view_duration', 'youtube_ctr'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'metric_override' ? JSON.stringify(req.body[field]) : req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Merge with existing values for metric computation
    const merged = { ...content, ...updates };
    merged.views = merged.views || 0;
    merged.likes = merged.likes || 0;
    merged.comments = merged.comments || 0;
    merged.shares = merged.shares || 0;
    merged.saves = merged.saves || 0;

    const computed = computeContentMetrics(merged);
    Object.assign(updates, computed);
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE marketing_content_tracker SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updates), req.params.contentId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      ip: req.ip,
    });

    res.json(db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ?').get(req.params.contentId));
  } catch (err) {
    console.error('[MARKETING] Content update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/content/:contentId/submit-approval
 * Submit content for client approval.
 */
router.post('/:id/marketing/content/:contentId/submit-approval', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const content = db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ?')
      .get(req.params.contentId, req.params.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });

    if (content.status !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft content can be submitted for approval' });
    }

    db.prepare('UPDATE marketing_content_tracker SET status = ?, updated_at = ? WHERE id = ?')
      .run('Pending Client Approval', new Date().toISOString(), req.params.contentId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'submit_approval',
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      ip: req.ip,
    });

    res.json(db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ?').get(req.params.contentId));
  } catch (err) {
    console.error('[MARKETING] Submit approval error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/content/review/:contentId
 * Review auto-discovered media: track or discard.
 */
router.post('/:id/marketing/content/review/:contentId', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const content = db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ?')
      .get(req.params.contentId, req.params.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const { action } = req.body; // 'track' or 'discard'
    if (!['track', 'discard'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "track" or "discard"' });
    }

    if (action === 'track') {
      db.prepare('UPDATE marketing_content_tracker SET is_tracked = 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), req.params.contentId);
    } else {
      db.prepare('DELETE FROM marketing_content_tracker WHERE id = ?').run(req.params.contentId);
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: `review_${action}`,
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      ip: req.ip,
    });

    res.json({ message: `Content ${action === 'track' ? 'tracked' : 'discarded'}` });
  } catch (err) {
    console.error('[MARKETING] Review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// AD CAMPAIGNS
// =========================================

/**
 * GET /api/clients/:id/marketing/ads
 */
router.get('/:id/marketing/ads', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const ads = db.prepare('SELECT * FROM marketing_ad_campaigns WHERE client_id = ? ORDER BY created_at DESC')
      .all(req.params.id);
    res.json({ ads });
  } catch (err) {
    console.error('[MARKETING] Ads list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/ads
 */
router.post('/:id/marketing/ads', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { platform, ad_campaign_name, leads, total_ad_spend_inr, impressions, clicks, revenue_generated } = req.body;

    const computed = computeAdMetrics({
      impressions: impressions || 0,
      clicks: clicks || 0,
      total_ad_spend_inr: total_ad_spend_inr || 0,
      leads: leads || 0,
      revenue_generated: revenue_generated || 0,
    });

    const result = db.prepare(`
      INSERT INTO marketing_ad_campaigns (client_id, platform, ad_campaign_name, leads, total_ad_spend_inr, 
        impressions, clicks, ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, platform || null, ad_campaign_name || null,
      leads || 0, total_ad_spend_inr || 0, impressions || 0, clicks || 0,
      computed.ctr_pct, computed.cpc_inr, computed.cpl_inr,
      revenue_generated || 0, computed.roas
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'ad_campaign',
      entityId: result.lastInsertRowid,
      diff: { ad_campaign_name, platform },
      ip: req.ip,
    });

    res.status(201).json(db.prepare('SELECT * FROM marketing_ad_campaigns WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error('[MARKETING] Ad create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id/marketing/ads/:adId
 */
router.patch('/:id/marketing/ads/:adId', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const ad = db.prepare('SELECT * FROM marketing_ad_campaigns WHERE id = ? AND client_id = ?')
      .get(req.params.adId, req.params.id);
    if (!ad) return res.status(404).json({ error: 'Ad campaign not found' });

    const allowedFields = ['platform', 'ad_campaign_name', 'leads', 'total_ad_spend_inr', 'impressions', 'clicks', 'revenue_generated'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const merged = { ...ad, ...updates };
    const computed = computeAdMetrics(merged);
    Object.assign(updates, computed);
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE marketing_ad_campaigns SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updates), req.params.adId);

    res.json(db.prepare('SELECT * FROM marketing_ad_campaigns WHERE id = ?').get(req.params.adId));
  } catch (err) {
    console.error('[MARKETING] Ad update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// MONTHLY REPORTS
// =========================================

/**
 * GET /api/clients/:id/marketing/monthly
 */
router.get('/:id/marketing/monthly', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const reports = db.prepare('SELECT * FROM marketing_monthly_report WHERE client_id = ? ORDER BY month DESC')
      .all(req.params.id);
    res.json({ reports });
  } catch (err) {
    console.error('[MARKETING] Monthly list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/monthly
 * Create/update monthly report with auto-computed MoM growth.
 */
router.post('/:id/marketing/monthly', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { 
      month, website_clicks, website_traffic, gmb_views, map_views, gmb_clicks,
      on_page_score, off_page, blogs, calls, directions, reviews, avg_rating,
      top_keywords, da, ai_overview_visible 
    } = req.body;

    if (!month) return res.status(400).json({ error: 'Month (YYYY-MM) is required' });

    // Get previous month data for MoM computation
    const [year, mon] = month.split('-').map(Number);
    const prevDate = new Date(year, mon - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevReport = db.prepare(
      'SELECT website_traffic, map_views FROM marketing_monthly_report WHERE client_id = ? AND month = ?'
    ).get(req.params.id, prevMonth);

    let mom_growth_sessions = null;
    let mom_growth_gmb_views = null;

    if (prevReport) {
      if (prevReport.website_traffic && prevReport.website_traffic > 0 && website_traffic) {
        mom_growth_sessions = ((website_traffic - prevReport.website_traffic) / prevReport.website_traffic);
        mom_growth_sessions = Math.round(mom_growth_sessions * 10000) / 10000;
      }
      if (prevReport.map_views && prevReport.map_views > 0 && map_views) {
        mom_growth_gmb_views = ((map_views - prevReport.map_views) / prevReport.map_views);
        mom_growth_gmb_views = Math.round(mom_growth_gmb_views * 10000) / 10000;
      }
    }

    // Upsert
    db.prepare(`
      INSERT INTO marketing_monthly_report (
        client_id, month, website_clicks, website_traffic, gmb_views, map_views, gmb_clicks,
        on_page_score, off_page, blogs, calls, directions, reviews, avg_rating,
        top_keywords, da, mom_growth_sessions, mom_growth_gmb_views, ai_overview_visible
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id, month) DO UPDATE SET
        website_clicks = excluded.website_clicks,
        website_traffic = excluded.website_traffic,
        gmb_views = excluded.gmb_views,
        map_views = excluded.map_views,
        gmb_clicks = excluded.gmb_clicks,
        on_page_score = excluded.on_page_score,
        off_page = excluded.off_page,
        blogs = excluded.blogs,
        calls = excluded.calls,
        directions = excluded.directions,
        reviews = excluded.reviews,
        avg_rating = excluded.avg_rating,
        top_keywords = excluded.top_keywords,
        da = excluded.da,
        mom_growth_sessions = excluded.mom_growth_sessions,
        mom_growth_gmb_views = excluded.mom_growth_gmb_views,
        ai_overview_visible = excluded.ai_overview_visible,
        updated_at = datetime('now')
    `).run(
      req.params.id,
      month,
      website_clicks || null,
      website_traffic || null,
      gmb_views || null,
      map_views || null,
      gmb_clicks || null,
      on_page_score || null,
      off_page || null,
      blogs || null,
      calls || null,
      directions || null,
      reviews || null,
      avg_rating || null,
      top_keywords || null,
      da || null,
      mom_growth_sessions,
      mom_growth_gmb_views,
      ai_overview_visible || 'No'
    );

    const report = db.prepare('SELECT * FROM marketing_monthly_report WHERE client_id = ? AND month = ?')
      .get(req.params.id, month);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'upsert',
      entityType: 'monthly_report',
      entityId: report.id,
      diff: { 
        month, website_clicks, website_traffic, gmb_views, map_views, gmb_clicks,
        on_page_score, off_page, blogs, calls, directions, reviews, avg_rating,
        top_keywords, da, ai_overview_visible
      },
      ip: req.ip,
    });

    res.json(report);
  } catch (err) {
    console.error('[MARKETING] Monthly create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
