/**
 * Marketing Ops Center — Marketing Content Routes
 * Content planning, tracking, review queue, and auto-computed metrics.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { syncContentToKanbanTask, formatDateStr } from '../services/kanbanSync.js';
import { computeContentMetrics, computeAdMetrics } from '../services/metrics.js';

const router = Router();

function autoExtractIds(link, platform, target) {
  if (!link) return;
  const plat = (platform || '').toLowerCase();

  try {
    if (plat.includes('youtube')) {
      const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|watch\?v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = link.match(ytRegex);
      if (match && match[1]) {
        target.youtube_video_id = match[1];
      }
    } else if (plat.includes('facebook')) {
      const fbRegex = /(?:posts|permalink\.php\?story_fbid=|videos|story_fbid=|fbid=|\/)([0-9]{8,20})/i;
      const match = link.match(fbRegex);
      if (match && match[1]) {
        target.facebook_post_id = match[1];
      }
    } else if (plat.includes('instagram')) {
      const igRegex = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9-_]+)/i;
      const match = link.match(igRegex);
      if (match && match[1]) {
        const shortcode = match[1];
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let id = 0n;
        let valid = true;
        for (let i = 0; i < shortcode.length; i++) {
          const idx = alphabet.indexOf(shortcode[i]);
          if (idx === -1) {
            valid = false;
            break;
          }
          id = id * 64n + BigInt(idx);
        }
        if (valid) {
          target.instagram_media_id = id.toString();
        }
      }
    }
  } catch (err) {
    console.error('[AUTO-EXTRACT] Error parsing link:', err.message);
  }
}

router.use(authenticate);

// =========================================
// CONTENT TRACKER
// =========================================

router.get('/:id/marketing/content', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    if (req.user.role === 'ops_video_editor') {
      const hasTask = db.prepare("SELECT 1 FROM kanban_tasks WHERE client_id = ? AND assigned_to = ? AND task_type = 'video' LIMIT 1").get(req.params.id, req.user.id);
      if (!hasTask) {
        return res.status(403).json({ error: 'Access denied: you have no video assignments for this client' });
      }
    }

    const { is_tracked, platform, status } = req.query;
    let query = `
      SELECT t.*, r.script_id, s.title AS script_title, s.script_text AS script_text,
             u.name AS assignee_name
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.client_id = ?
    `;
    const params = [req.params.id];

    if (req.user.role === 'ops_video_editor') {
      query += " AND t.post_type IN ('Reel', 'Youtube', 'Short')";
    }

    if (is_tracked !== undefined) {
      query += ' AND t.is_tracked = ?';
      params.push(parseInt(is_tracked));
    }
    if (platform) {
      query += ' AND t.platform = ?';
      params.push(platform);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    query += ' ORDER BY t.date DESC';
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
      follows, youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
      script_id,
      facebook_post_id, instagram_media_id, youtube_video_id,
      instagram_link, youtube_link, facebook_link, linkedin_link,
      assigned_to
    } = req.body;

    let finalTitle = title;
    let finalScriptText = script;
    let finalStatus = status || 'Draft';
    let finalClientComments = null;
    let finalClientApproved = 0;

    if (script_id) {
      const scriptObj = db.prepare('SELECT title, script_text, status, client_comments FROM marketing_scripts WHERE id = ?').get(script_id);
      if (scriptObj) {
        if (!finalTitle) finalTitle = scriptObj.title;
        if (!finalScriptText) finalScriptText = scriptObj.script_text;
        if (!status) finalStatus = scriptObj.status || 'Draft';
        finalClientComments = scriptObj.client_comments;
        finalClientApproved = ['Client Approved', 'Posted'].includes(finalStatus) ? 1 : 0;
      }
    }

    if (!finalTitle) {
      if (finalScriptText) {
        finalTitle = finalScriptText.slice(0, 30) + (finalScriptText.length > 30 ? '...' : '');
      } else if (caption) {
        finalTitle = caption.slice(0, 30) + (caption.length > 30 ? '...' : '');
      } else {
        finalTitle = `Content Plan - ${date || new Date().toISOString().split('T')[0]}`;
      }
    }

    let finalAssignedTo = assigned_to || null;
    if (!finalAssignedTo && ['reel', 'youtube', 'short'].includes((post_type || '').toLowerCase())) {
      const videoEditor = db.prepare("SELECT id FROM users WHERE role = 'ops_video_editor' AND is_active = 1 LIMIT 1").get();
      if (videoEditor) {
        finalAssignedTo = videoEditor.id;
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

    let finalFacebookPostId = facebook_post_id || null;
    let finalInstagramMediaId = instagram_media_id || null;
    let finalYoutubeVideoId = youtube_video_id || null;

    if (link) {
      const extracted = {};
      autoExtractIds(link, platform, extracted);
      if (extracted.facebook_post_id) finalFacebookPostId = extracted.facebook_post_id;
      if (extracted.instagram_media_id) finalInstagramMediaId = extracted.instagram_media_id;
      if (extracted.youtube_video_id) finalYoutubeVideoId = extracted.youtube_video_id;
    }
    if (instagram_link) {
      const ext = {};
      autoExtractIds(instagram_link, 'instagram', ext);
      if (ext.instagram_media_id) finalInstagramMediaId = ext.instagram_media_id;
    }
    if (youtube_link) {
      const ext = {};
      autoExtractIds(youtube_link, 'youtube', ext);
      if (ext.youtube_video_id) finalYoutubeVideoId = ext.youtube_video_id;
    }
    if (facebook_link) {
      const ext = {};
      autoExtractIds(facebook_link, 'facebook', ext);
      if (ext.facebook_post_id) finalFacebookPostId = ext.facebook_post_id;
    }

    const result = db.prepare(`
      INSERT INTO marketing_content_tracker (
        client_id, platform, date, post_type, title, script, link, time, caption, status, client_comments, client_approved, source,
        views, likes, comments, shares, saves, avg_watch_time_pct, boosted, follows,
        youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
        engagement_rate_pct, save_rate_pct, content_score,
        facebook_post_id, instagram_media_id, youtube_video_id, assigned_to,
        instagram_link, youtube_link, facebook_link, linkedin_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      platform || null,
      date || null,
      post_type || null,
      finalTitle,
      finalScriptText || null,
      link || null,
      time || null,
      caption || null,
      finalStatus,
      finalClientComments,
      finalClientApproved,
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
      computed.content_score,
      finalFacebookPostId,
      finalInstagramMediaId,
      finalYoutubeVideoId,
      finalAssignedTo,
      instagram_link || null,
      youtube_link || null,
      facebook_link || null,
      linkedin_link || null
    );

    if (script_id) {
      db.prepare(`
        INSERT INTO marketing_content_script_relation (content_id, script_id)
        VALUES (?, ?)
      `).run(result.lastInsertRowid, script_id);
    }

    syncContentToKanbanTask(result.lastInsertRowid, db);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'content',
      entityId: result.lastInsertRowid,
      diff: { title: finalTitle, client_id: clientId },
      ip: req.ip,
    });

    const createdRow = db.prepare(`
      SELECT t.*, r.script_id, s.title AS script_title, s.script_text AS script_text,
             u.name AS assignee_name
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(createdRow);
  } catch (err) {
    console.error('[MARKETING] Content create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/marketing/content/:contentId
 * Fetch details of a single content tracker item.
 */
router.get('/:id/marketing/content/:contentId', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    if (req.user.role === 'ops_video_editor') {
      const hasTask = db.prepare("SELECT 1 FROM kanban_tasks WHERE client_id = ? AND assigned_to = ? AND task_type = 'video' LIMIT 1").get(req.params.id, req.user.id);
      if (!hasTask) {
        return res.status(403).json({ error: 'Access denied: you have no video assignments for this client' });
      }
    }

    const row = db.prepare(`
      SELECT t.*, r.script_id, s.title AS script_title, s.script_text AS script_text,
             u.name AS assignee_name
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.client_id = ? AND t.id = ?
    `).get(req.params.id, req.params.contentId);

    if (!row) {
      return res.status(404).json({ error: 'Content item not found' });
    }

    res.json(row);
  } catch (err) {
    console.error('[MARKETING] Content get single error:', err);
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
      'youtube_views', 'youtube_watch_time', 'youtube_avg_view_duration', 'youtube_ctr',
      'facebook_post_id', 'instagram_media_id', 'youtube_video_id', 'assigned_to',
      'instagram_link', 'youtube_link', 'facebook_link', 'linkedin_link'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'metric_override' ? JSON.stringify(req.body[field]) : req.body[field];
      }
    }

    if (Object.keys(updates).length === 0 && req.body.script_id === undefined) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    if (updates.link !== undefined) {
      const targetPlatform = updates.platform || content.platform || '';
      const extracted = {};
      autoExtractIds(updates.link, targetPlatform, extracted);
      if (extracted.facebook_post_id) updates.facebook_post_id = extracted.facebook_post_id;
      if (extracted.instagram_media_id) updates.instagram_media_id = extracted.instagram_media_id;
      if (extracted.youtube_video_id) updates.youtube_video_id = extracted.youtube_video_id;
    }
    if (updates.instagram_link !== undefined) {
      const extracted = {};
      autoExtractIds(updates.instagram_link, 'instagram', extracted);
      if (extracted.instagram_media_id) updates.instagram_media_id = extracted.instagram_media_id;
    }
    if (updates.youtube_link !== undefined) {
      const extracted = {};
      autoExtractIds(updates.youtube_link, 'youtube', extracted);
      if (extracted.youtube_video_id) updates.youtube_video_id = extracted.youtube_video_id;
    }
    if (updates.facebook_link !== undefined) {
      const extracted = {};
      autoExtractIds(updates.facebook_link, 'facebook', extracted);
      if (extracted.facebook_post_id) updates.facebook_post_id = extracted.facebook_post_id;
    }

    if (updates.post_type !== undefined && ['reel', 'youtube', 'short'].includes((updates.post_type || '').toLowerCase())) {
      if (updates.assigned_to === undefined && !content.assigned_to) {
        const videoEditor = db.prepare("SELECT id FROM users WHERE role = 'ops_video_editor' AND is_active = 1 LIMIT 1").get();
        if (videoEditor) {
          updates.assigned_to = videoEditor.id;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
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
    }

    const { script_id } = req.body;
    if (script_id !== undefined) {
      db.prepare('DELETE FROM marketing_content_script_relation WHERE content_id = ?').run(req.params.contentId);
      if (script_id && script_id !== null && script_id !== '') {
        db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)')
          .run(req.params.contentId, script_id);
        
        const scriptObj = db.prepare('SELECT title, script_text, status, client_comments FROM marketing_scripts WHERE id = ?').get(script_id);
        if (scriptObj) {
          const clientApproved = ['Client Approved', 'Posted'].includes(scriptObj.status) ? 1 : 0;
          db.prepare(`
            UPDATE marketing_content_tracker 
            SET title = ?, script = ?, status = ?, client_comments = ?, client_approved = ?, updated_at = ?
            WHERE id = ?
          `).run(
            scriptObj.title, 
            scriptObj.script_text, 
            scriptObj.status || 'Draft', 
            scriptObj.client_comments || null, 
            clientApproved, 
            new Date().toISOString(),
            req.params.contentId
          );
        }
      }
    }

    syncContentToKanbanTask(req.params.contentId, db);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'content',
      entityId: parseInt(req.params.contentId),
      ip: req.ip,
    });

    const updatedRow = db.prepare(`
      SELECT t.*, r.script_id, s.title AS script_title, s.script_text AS script_text,
             u.name AS assignee_name
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `).get(req.params.contentId);

    res.json(updatedRow);
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

    syncContentToKanbanTask(req.params.contentId, db);

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
      if (content.kanban_task_id) {
        db.prepare('DELETE FROM kanban_tasks WHERE id = ?').run(content.kanban_task_id);
      }
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

// =========================================
// SCRIPTS
// =========================================

// Helper to sync status & client comments to content tracker for scripts
const setScriptStatusAndComments = (db, clientId, scriptId, status, clientComments) => {
  const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?').get(scriptId, clientId);
  if (!script) return;

  const now = new Date().toISOString();

  // 1. Update the status and comments directly on the script itself
  db.prepare(`
    UPDATE marketing_scripts
    SET status = ?, client_comments = ?, updated_at = ?
    WHERE id = ?
  `).run(status, clientComments || null, now, scriptId);

  // 2. Find linked content tracker entry
  let relation = db.prepare(`
    SELECT t.* FROM marketing_content_tracker t
    JOIN marketing_content_script_relation r ON t.id = r.content_id
    WHERE r.script_id = ? AND t.client_id = ?
  `).get(scriptId, clientId);

  // 3. If there is a relation, sync the status and client approved state, and trigger Kanban task sync
  if (relation) {
    const clientApproved = ['Client Approved', 'Posted'].includes(status) ? 1 : 0;
    db.prepare(`
      UPDATE marketing_content_tracker
      SET status = ?, client_approved = ?, client_comments = ?, updated_at = ?
      WHERE id = ?
    `).run(status, clientApproved, clientComments || null, now, relation.id);

    syncContentToKanbanTask(relation.id, db);
  }
};

/**
 * GET /api/clients/:id/marketing/scripts
 * List scripts for a client, optionally filtered by month.
 */
router.get('/:id/marketing/scripts', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { month } = req.query;
    let query = `
      SELECT s.id, s.client_id, s.month, s.title, s.script_text, s.format, s.reference_video_link, s.reaction_video_link, s.created_at, s.updated_at,
             t.id AS content_id, COALESCE(t.status, s.status) AS content_status, COALESCE(t.client_comments, s.client_comments) AS client_comments
      FROM marketing_scripts s
      LEFT JOIN marketing_content_script_relation r ON s.id = r.script_id
      LEFT JOIN marketing_content_tracker t ON r.content_id = t.id
      WHERE s.client_id = ?
    `;
    const params = [req.params.id];

    if (month) {
      query += ' AND s.month = ?';
      params.push(month);
    }

    query += ' ORDER BY s.created_at DESC';
    const scripts = db.prepare(query).all(...params);
    res.json({ scripts });
  } catch (err) {
    console.error('[MARKETING] Scripts list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/marketing/scripts
 * Create a new script.
 */
router.post('/:id/marketing/scripts', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { title, script_text, month, reference_video_link, reaction_video_link, format, status, client_comments } = req.body;
    if (!title || !script_text || !month) {
      return res.status(400).json({ error: 'Title, script_text, and month are required' });
    }

    const result = db.prepare(`
      INSERT INTO marketing_scripts (client_id, month, title, script_text, reference_video_link, reaction_video_link, format, status, client_comments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, 
      month, 
      title, 
      script_text, 
      reference_video_link || null, 
      reaction_video_link || null, 
      format || 'reel',
      status || 'Pending Client Approval',
      client_comments || null
    );

    const newScriptId = result.lastInsertRowid;

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'script',
      entityId: newScriptId,
      diff: { title, month, status: status || 'Pending Client Approval' },
      ip: req.ip,
    });

    const script = db.prepare(`
      SELECT s.id, s.client_id, s.month, s.title, s.script_text, s.format, s.reference_video_link, s.reaction_video_link, s.created_at, s.updated_at,
             t.id AS content_id, COALESCE(t.status, s.status) AS content_status, COALESCE(t.client_comments, s.client_comments) AS client_comments
      FROM marketing_scripts s
      LEFT JOIN marketing_content_script_relation r ON s.id = r.script_id
      LEFT JOIN marketing_content_tracker t ON r.content_id = t.id
      WHERE s.id = ?
    `).get(newScriptId);

    res.status(201).json(script);
  } catch (err) {
    console.error('[MARKETING] Script create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id/marketing/scripts/:scriptId
 * Update an existing script.
 */
router.patch('/:id/marketing/scripts/:scriptId', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
      .get(req.params.scriptId, req.params.id);
    if (!script) return res.status(404).json({ error: 'Script not found' });

    const allowedFields = ['title', 'script_text', 'month', 'reference_video_link', 'reaction_video_link', 'format'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE marketing_scripts SET ${setClauses} WHERE id = ?`)
        .run(...Object.values(updates), req.params.scriptId);
    }

    const { status, client_comments } = req.body;
    if (status !== undefined) {
      setScriptStatusAndComments(db, req.params.id, req.params.scriptId, status, client_comments);
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'script',
      entityId: parseInt(req.params.scriptId),
      diff: { ...updates, status, client_comments },
      ip: req.ip,
    });

    const updatedScript = db.prepare(`
      SELECT s.id, s.client_id, s.month, s.title, s.script_text, s.format, s.reference_video_link, s.reaction_video_link, s.created_at, s.updated_at,
             t.id AS content_id, COALESCE(t.status, s.status) AS content_status, COALESCE(t.client_comments, s.client_comments) AS client_comments
      FROM marketing_scripts s
      LEFT JOIN marketing_content_script_relation r ON s.id = r.script_id
      LEFT JOIN marketing_content_tracker t ON r.content_id = t.id
      WHERE s.id = ?
    `).get(req.params.scriptId);

    res.json(updatedScript);
  } catch (err) {
    console.error('[MARKETING] Script update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/clients/:id/marketing/scripts/:scriptId
 * Delete a script.
 */
router.delete('/:id/marketing/scripts/:scriptId', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
      .get(req.params.scriptId, req.params.id);
    if (!script) return res.status(404).json({ error: 'Script not found' });

    db.prepare('DELETE FROM marketing_scripts WHERE id = ?').run(req.params.scriptId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'delete',
      entityType: 'script',
      entityId: parseInt(req.params.scriptId),
      diff: { title: script.title },
      ip: req.ip,
    });

    res.json({ message: 'Script deleted successfully' });
  } catch (err) {
    console.error('[MARKETING] Script delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/clients/:id/marketing/scripts/:scriptId/status
 * Manually change/override a script's approval status.
 */
router.put('/:id/marketing/scripts/:scriptId/status', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { status, rejection_reason } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const clientId = req.params.id;
    const scriptId = req.params.scriptId;

    // Check if script exists
    const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?').get(scriptId, clientId);
    if (!script) return res.status(404).json({ error: 'Script not found' });

    const now = new Date().toISOString();

    // 1. Update status on script itself
    db.prepare(`
      UPDATE marketing_scripts
      SET status = ?, client_comments = ?, updated_at = ?
      WHERE id = ?
    `).run(status, rejection_reason || null, now, scriptId);

    // Find linked content tracker entry
    let relation = db.prepare(`
      SELECT t.* FROM marketing_content_tracker t
      JOIN marketing_content_script_relation r ON t.id = r.content_id
      WHERE r.script_id = ? AND t.client_id = ?
    `).get(scriptId, clientId);

    if (relation) {
      const clientApproved = ['Client Approved', 'Posted'].includes(status) ? 1 : 0;
      
      db.prepare(`
        UPDATE marketing_content_tracker
        SET status = ?, client_approved = ?, client_comments = ?, updated_at = ?
        WHERE id = ?
      `).run(status, clientApproved, rejection_reason || null, now, relation.id);

      syncContentToKanbanTask(relation.id, db);
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_status',
      entityType: 'script',
      entityId: parseInt(scriptId),
      diff: { status, client_comments: rejection_reason, is_standalone_script: !relation },
      ip: req.ip,
    });

    res.json({ success: true, status, relation_id: relation.id });
  } catch (err) {
    console.error('[MARKETING] Script status update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
