/**
 * Handlers that create or update dashboard records on an automation client's
 * behalf: tasks, content, ad campaigns, monthly reports, scripts, clients,
 * artists, venues, gigs, freelancers, chat, knowledge and blog posts.
 * Dispatched from src/routes/webhooks.js after the signature check.
 */

import db from '../../database.js';
import { logAction } from '../services/auditLogger.js';
import { syncContentToKanbanTask } from '../services/kanbanSync.js';
import { computeContentMetrics, computeAdMetrics } from '../services/metrics.js';
import { extractAllPlatformIds } from '../services/linkExtractor.js';

export function handleCreateTask(payload) {
  if (!payload?.title) return { success: false, summary: 'Title is required' };
  const result = db.prepare(`
    INSERT INTO kanban_tasks (title, description, status, priority, task_type, client_id, assigned_to, due_date)
    VALUES (?, ?, 'todo', ?, ?, ?, ?, ?)
  `).run(
    payload.title,
    payload.description || null,
    payload.priority || 'medium',
    payload.task_type || 'other',
    payload.client_id || null,
    payload.assigned_to || null,
    payload.due_date || null
  );

  logAction({ action: 'create', entityType: 'task', entityId: result.lastInsertRowid, diff: { title: payload.title, source: 'openclaw' } });
  return { success: true, summary: `Task #${result.lastInsertRowid} "${payload.title}" created.` };
}

export function handleUpdateTask(payload) {
  if (!payload?.task_id) return { success: false, summary: 'task_id is required' };
  const allowedFields = ['status', 'priority', 'description', 'assigned_to', 'title', 'due_date', 'task_type', 'client_id', 'drive_link'];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE kanban_tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), payload.task_id);

  logAction({ action: 'update', entityType: 'task', entityId: payload.task_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Task #${payload.task_id} updated. Fields: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}` };
}

export function handleCreateContent(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  let finalTitle = payload.title;
  if (!finalTitle) {
    if (payload.script) finalTitle = payload.script.slice(0, 30) + (payload.script.length > 30 ? '...' : '');
    else if (payload.caption) finalTitle = payload.caption.slice(0, 30) + (payload.caption.length > 30 ? '...' : '');
    else finalTitle = `Content Plan - ${payload.date || new Date().toISOString().split('T')[0]}`;
  }

  // Compute metrics
  const views = payload.views || 0, likes = payload.likes || 0, comments = payload.comments || 0;
  const shares = payload.shares || 0, saves = payload.saves || 0;
  const awt = payload.avg_watch_time_pct !== undefined ? payload.avg_watch_time_pct : null;

  const { engagement_rate_pct, save_rate_pct, content_score } = computeContentMetrics({
    views, likes, comments, shares, saves, avg_watch_time_pct: awt
  });

  const extractedIds = extractAllPlatformIds({
    facebook_post_id: payload.facebook_post_id,
    instagram_media_id: payload.instagram_media_id,
    youtube_video_id: payload.youtube_video_id,
    linkedin_post_id: payload.linkedin_post_id,
    link: payload.link,
    platform: payload.platform,
    instagram_link: payload.instagram_link,
    youtube_link: payload.youtube_link,
    facebook_link: payload.facebook_link,
    linkedin_link: payload.linkedin_link
  });

  const result = db.prepare(`
    INSERT INTO marketing_content_tracker (
      client_id, platform, date, post_type, title, script, link, time, caption, status, source,
      views, likes, comments, shares, saves, avg_watch_time_pct, boosted, follows,
      youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
      engagement_rate_pct, save_rate_pct, content_score,
      facebook_post_id, instagram_media_id, youtube_video_id, linkedin_post_id, assigned_to,
      instagram_link, youtube_link, facebook_link, linkedin_link
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id,
    payload.platform || null,
    payload.date || null,
    payload.post_type || null,
    finalTitle,
    payload.script || null,
    payload.link || null,
    payload.time || null,
    payload.caption || null,
    payload.status || 'Draft',
    views, likes, comments, shares, saves,
    awt,
    payload.boosted || 'No',
    payload.follows || 0,
    payload.youtube_views || 0,
    payload.youtube_watch_time || 0.0,
    payload.youtube_avg_view_duration || null,
    payload.youtube_ctr || 0.0,
    engagement_rate_pct, save_rate_pct, content_score,
    extractedIds.facebook_post_id,
    extractedIds.instagram_media_id,
    extractedIds.youtube_video_id,
    extractedIds.linkedin_post_id,
    payload.assigned_to || null,
    payload.instagram_link || null,
    payload.youtube_link || null,
    payload.facebook_link || null,
    payload.linkedin_link || null
  );

  // Link script if provided
  if (payload.script_id) {
    db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)')
      .run(result.lastInsertRowid, payload.script_id);
  }

  syncContentToKanbanTask(result.lastInsertRowid, db);

  logAction({ action: 'create', entityType: 'content', entityId: result.lastInsertRowid, diff: { title: finalTitle, source: 'openclaw' } });
  return { success: true, summary: `Content #${result.lastInsertRowid} "${finalTitle}" created for client ${payload.client_id}.` };
}

export function handleUpdateContent(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  let content = null;
  let identifierUsed = '';

  if (payload.content_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ?')
      .get(payload.content_id, payload.client_id);
    identifierUsed = `id #${payload.content_id}`;
  } else if (payload.facebook_post_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE facebook_post_id = ? AND client_id = ?')
      .get(payload.facebook_post_id, payload.client_id);
    identifierUsed = `facebook_post_id "${payload.facebook_post_id}"`;
  } else if (payload.instagram_media_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE instagram_media_id = ? AND client_id = ?')
      .get(payload.instagram_media_id, payload.client_id);
    identifierUsed = `instagram_media_id "${payload.instagram_media_id}"`;
  } else if (payload.youtube_video_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE youtube_video_id = ? AND client_id = ?')
      .get(payload.youtube_video_id, payload.client_id);
    identifierUsed = `youtube_video_id "${payload.youtube_video_id}"`;
  }

  if (!content) {
    return {
      success: false,
      summary: `Content row not found for client ${payload.client_id} using supplied identifiers.`
    };
  }

  const targetContentId = content.id;

  const allowedFields = [
    'platform', 'date', 'post_type', 'title', 'script', 'status',
    'views', 'likes', 'comments', 'shares', 'saves', 'avg_watch_time_pct',
    'boosted', 'link', 'time', 'caption', 'follows',
    'youtube_views', 'youtube_watch_time', 'youtube_avg_view_duration', 'youtube_ctr',
    'facebook_post_id', 'instagram_media_id', 'youtube_video_id', 'linkedin_post_id', 'assigned_to',
    'instagram_link', 'youtube_link', 'facebook_link', 'linkedin_link'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0 && payload.script_id === undefined) {
    return { success: false, summary: 'No valid fields to update' };
  }

  const mergedLinks = {
    facebook_post_id: updates.facebook_post_id !== undefined ? updates.facebook_post_id : content.facebook_post_id,
    instagram_media_id: updates.instagram_media_id !== undefined ? updates.instagram_media_id : content.instagram_media_id,
    youtube_video_id: updates.youtube_video_id !== undefined ? updates.youtube_video_id : content.youtube_video_id,
    linkedin_post_id: updates.linkedin_post_id !== undefined ? updates.linkedin_post_id : content.linkedin_post_id,
    link: updates.link !== undefined ? updates.link : content.link,
    platform: updates.platform !== undefined ? updates.platform : content.platform,
    instagram_link: updates.instagram_link !== undefined ? updates.instagram_link : content.instagram_link,
    youtube_link: updates.youtube_link !== undefined ? updates.youtube_link : content.youtube_link,
    facebook_link: updates.facebook_link !== undefined ? updates.facebook_link : content.facebook_link,
    linkedin_link: updates.linkedin_link !== undefined ? updates.linkedin_link : content.linkedin_link,
  };

  const linkKeys = ['link', 'platform', 'instagram_link', 'youtube_link', 'facebook_link', 'linkedin_link'];
  const anyLinkChanged = linkKeys.some(k => updates[k] !== undefined);

  if (anyLinkChanged) {
    const extractedIds = extractAllPlatformIds(mergedLinks);
    if (extractedIds.facebook_post_id) updates.facebook_post_id = extractedIds.facebook_post_id;
    if (extractedIds.instagram_media_id) updates.instagram_media_id = extractedIds.instagram_media_id;
    if (extractedIds.youtube_video_id) updates.youtube_video_id = extractedIds.youtube_video_id;
    if (extractedIds.linkedin_post_id) updates.linkedin_post_id = extractedIds.linkedin_post_id;
  }

  if (Object.keys(updates).length > 0) {
    // Recompute metrics
    const merged = { ...content, ...updates };
    const computed = computeContentMetrics(merged);
    Object.assign(updates, computed);

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE marketing_content_tracker SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updates), targetContentId);
  }

  // Handle script linking
  if (payload.script_id !== undefined) {
    db.prepare('DELETE FROM marketing_content_script_relation WHERE content_id = ?').run(targetContentId);
    if (payload.script_id) {
      db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)')
        .run(targetContentId, payload.script_id);
    }
  }

  syncContentToKanbanTask(targetContentId, db);

  logAction({ action: 'update', entityType: 'content', entityId: targetContentId, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Content #${targetContentId} (found via ${identifierUsed}) updated.` };
}

export function handleCreateAdCampaign(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  const computed = computeAdMetrics({
    impressions: payload.impressions || 0,
    clicks: payload.clicks || 0,
    total_ad_spend_inr: payload.total_ad_spend_inr || 0,
    leads: payload.leads || 0,
    revenue_generated: payload.revenue_generated || 0,
  });

  const result = db.prepare(`
    INSERT INTO marketing_ad_campaigns (client_id, platform, ad_campaign_name, leads, total_ad_spend_inr,
      impressions, clicks, ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id, payload.platform || null, payload.ad_campaign_name || null,
    payload.leads || 0, payload.total_ad_spend_inr || 0, payload.impressions || 0, payload.clicks || 0,
    computed.ctr_pct, computed.cpc_inr, computed.cpl_inr, payload.revenue_generated || 0, computed.roas
  );

  logAction({ action: 'create', entityType: 'ad_campaign', entityId: result.lastInsertRowid, diff: { ad_campaign_name: payload.ad_campaign_name, source: 'openclaw' } });
  return { success: true, summary: `Ad Campaign #${result.lastInsertRowid} "${payload.ad_campaign_name || 'Unnamed'}" created.` };
}

export function handleUpdateAdCampaign(payload) {
  if (!payload?.client_id || !payload?.ad_id) return { success: false, summary: 'client_id and ad_id are required' };

  const ad = db.prepare('SELECT * FROM marketing_ad_campaigns WHERE id = ? AND client_id = ?')
    .get(payload.ad_id, payload.client_id);
  if (!ad) return { success: false, summary: `Ad campaign #${payload.ad_id} not found` };

  const allowedFields = ['platform', 'ad_campaign_name', 'leads', 'total_ad_spend_inr', 'impressions', 'clicks', 'revenue_generated'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };

  // Recompute metrics
  const merged = { ...ad, ...updates };
  updates.ctr_pct = merged.impressions > 0 ? Math.round((merged.clicks / merged.impressions) * 100 * 100) / 100 : null;
  updates.cpc_inr = merged.clicks > 0 ? Math.round(merged.total_ad_spend_inr / merged.clicks) : null;
  updates.cpl_inr = merged.leads > 0 ? Math.round(merged.total_ad_spend_inr / merged.leads) : null;
  updates.roas = merged.total_ad_spend_inr > 0 ? Math.round((merged.revenue_generated / merged.total_ad_spend_inr) * 100) / 100 : null;
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE marketing_ad_campaigns SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.ad_id);

  logAction({ action: 'update', entityType: 'ad_campaign', entityId: payload.ad_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Ad Campaign #${payload.ad_id} updated.` };
}

export function handleUpsertMonthlyReport(payload) {
  if (!payload?.client_id || !payload?.month) return { success: false, summary: 'client_id and month are required' };

  // Get previous month for MoM computation
  const [year, mon] = payload.month.split('-').map(Number);
  const prevDate = new Date(year, mon - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const prevReport = db.prepare(
    'SELECT website_traffic, map_views FROM marketing_monthly_report WHERE client_id = ? AND month = ?'
  ).get(payload.client_id, prevMonth);

  let mom_growth_sessions = null, mom_growth_gmb_views = null;
  if (prevReport) {
    if (prevReport.website_traffic > 0 && payload.website_traffic) {
      mom_growth_sessions = Math.round(((payload.website_traffic - prevReport.website_traffic) / prevReport.website_traffic) * 10000) / 10000;
    }
    if (prevReport.map_views > 0 && payload.map_views) {
      mom_growth_gmb_views = Math.round(((payload.map_views - prevReport.map_views) / prevReport.map_views) * 10000) / 10000;
    }
  }

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
    payload.client_id, payload.month,
    payload.website_clicks || null, payload.website_traffic || null,
    payload.gmb_views || null, payload.map_views || null, payload.gmb_clicks || null,
    payload.on_page_score || null, payload.off_page || null, payload.blogs || null,
    payload.calls || null, payload.directions || null, payload.reviews || null,
    payload.avg_rating || null, payload.top_keywords || null, payload.da || null,
    mom_growth_sessions, mom_growth_gmb_views, payload.ai_overview_visible || 'No'
  );

  logAction({ action: 'upsert', entityType: 'monthly_report', diff: { month: payload.month, source: 'openclaw' } });
  return { success: true, summary: `Monthly report for ${payload.month} (client ${payload.client_id}) upserted.` };
}

export function handleCreateScript(payload) {
  if (!payload?.client_id || !payload?.title || !payload?.script_text || !payload?.month) {
    return { success: false, summary: 'client_id, title, script_text, and month are required' };
  }

  const result = db.prepare(`
    INSERT INTO marketing_scripts (client_id, month, title, script_text, reference_video_link, reaction_video_link, format)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id, payload.month, payload.title, payload.script_text,
    payload.reference_video_link || null, payload.reaction_video_link || null, payload.format || 'reel'
  );

  logAction({ action: 'create', entityType: 'script', entityId: result.lastInsertRowid, diff: { title: payload.title, source: 'openclaw' } });
  return { success: true, summary: `Script #${result.lastInsertRowid} "${payload.title}" created.` };
}

export function handleUpdateScript(payload) {
  if (!payload?.client_id || !payload?.script_id) return { success: false, summary: 'client_id and script_id are required' };

  const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
    .get(payload.script_id, payload.client_id);
  if (!script) return { success: false, summary: `Script #${payload.script_id} not found` };

  const allowedFields = ['title', 'script_text', 'month', 'reference_video_link', 'reaction_video_link', 'format'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE marketing_scripts SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.script_id);

  logAction({ action: 'update', entityType: 'script', entityId: payload.script_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Script #${payload.script_id} updated.` };
}

export function handleCreateClient(payload) {
  if (!payload?.name) return { success: false, summary: 'Client name is required' };

  const result = db.prepare(`
    INSERT INTO crm_clients (name, client_type, contact_person, contact_email, contact_phone,
      calendar_sync_link, drive_folder_link, instagram_business_account_id,
      youtube_channel_id, google_ads_customer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.client_type || 'marketing',
    payload.contact_person || null,
    payload.contact_email || null,
    payload.contact_phone || null,
    payload.calendar_sync_link || null,
    payload.drive_folder_link || null,
    payload.instagram_business_account_id || null,
    payload.youtube_channel_id || null,
    payload.google_ads_customer_id || null
  );

  logAction({ action: 'create', entityType: 'client', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Client #${result.lastInsertRowid} "${payload.name}" created.` };
}

export function handleUpdateClient(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(payload.client_id);
  if (!client) return { success: false, summary: `Client #${payload.client_id} not found` };

  const allowedFields = [
    'name', 'client_type', 'contact_person', 'contact_email', 'contact_phone',
    'calendar_sync_link', 'drive_folder_link', 'instagram_business_account_id',
    'youtube_channel_id', 'google_ads_customer_id', 'is_active', 'portal_enabled'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE crm_clients SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.client_id);

  logAction({ action: 'update', entityType: 'client', entityId: payload.client_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Client #${payload.client_id} updated.` };
}

export function handleCreateArtist(payload) {
  if (!payload?.name) return { success: false, summary: 'Artist name is required' };

  // Generate artist_id from name + phone
  const prefix = payload.name.substring(0, 3).toUpperCase();
  const suffix = payload.phone ? payload.phone.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
  const artistCode = `${prefix}${suffix}`;

  const result = db.prepare(`
    INSERT INTO artists (artist_id, name, category, city, phone, email, telegram_chat_id,
      instruments, insta_link, description, rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artistCode, payload.name,
    payload.category || null, payload.city || null,
    payload.phone || null, payload.email || null,
    payload.telegram_chat_id || null,
    payload.instruments || null, payload.insta_link || null,
    payload.description || null,
    payload.rating !== undefined && payload.rating !== '' ? parseInt(payload.rating) : null,
    payload.notes || null
  );

  logAction({ action: 'create', entityType: 'artist', entityId: result.lastInsertRowid, diff: { name: payload.name, artist_id: artistCode, source: 'openclaw' } });
  return { success: true, summary: `Artist #${result.lastInsertRowid} "${payload.name}" (${artistCode}) created.` };
}

export function handleUpdateArtist(payload) {
  if (!payload?.artist_id) return { success: false, summary: 'artist_id is required' };

  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(payload.artist_id);
  if (!artist) return { success: false, summary: `Artist #${payload.artist_id} not found` };

  const allowedFields = ['name', 'category', 'city', 'phone', 'email', 'telegram_chat_id', 'is_active',
    'instruments', 'insta_link', 'description', 'rating', 'notes'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE artists SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.artist_id);

  logAction({ action: 'update', entityType: 'artist', entityId: payload.artist_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Artist #${payload.artist_id} updated.` };
}

export function handleCreateVenue(payload) {
  if (!payload?.name) return { success: false, summary: 'Venue name is required' };

  const result = db.prepare(`
    INSERT INTO venues (name, address, city, map_link, poc_name, poc_phone, poc_email, social_links, gig_confirmed_message, client_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.address || null, payload.city || null, payload.map_link || null,
    payload.poc_name || null, payload.poc_phone || null, payload.poc_email || null,
    payload.social_links || null, payload.gig_confirmed_message || null,
    payload.client_id || null
  );

  logAction({ action: 'create', entityType: 'venue', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Venue #${result.lastInsertRowid} "${payload.name}" created.` };
}

export function handleUpdateVenue(payload) {
  if (!payload?.venue_id) return { success: false, summary: 'venue_id is required' };

  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(payload.venue_id);
  if (!venue) return { success: false, summary: `Venue #${payload.venue_id} not found` };

  const allowedFields = ['name', 'address', 'city', 'map_link', 'poc_name', 'poc_phone', 'poc_email', 'social_links', 'gig_confirmed_message', 'client_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE venues SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.venue_id);

  logAction({ action: 'update', entityType: 'venue', entityId: payload.venue_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Venue #${payload.venue_id} updated.` };
}

export function handleCreateGig(payload) {
  if (!payload?.artist_id || !payload?.gig_date) return { success: false, summary: 'artist_id and gig_date are required' };

  const result = db.prepare(`
    INSERT INTO gig_status (artist_id, venue_id, gig_date, fee_inr, advance_paid, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    payload.artist_id,
    payload.venue_id || null,
    payload.gig_date,
    payload.fee_inr || 0,
    payload.advance_paid || 0,
    payload.status || 'Pending'
  );

  // Recalculate artist rollups
  recalculateArtistRollups(payload.artist_id);

  logAction({ action: 'create', entityType: 'gig', entityId: result.lastInsertRowid, diff: { artist_id: payload.artist_id, gig_date: payload.gig_date, source: 'openclaw' } });
  return { success: true, summary: `Gig #${result.lastInsertRowid} on ${payload.gig_date} created.` };
}

export function handleUpdateGig(payload) {
  if (!payload?.gig_id) return { success: false, summary: 'gig_id is required' };

  const gig = db.prepare('SELECT * FROM gig_status WHERE id = ?').get(payload.gig_id);
  if (!gig) return { success: false, summary: `Gig #${payload.gig_id} not found` };

  const allowedFields = ['status', 'fee_inr', 'advance_paid', 'gig_date', 'venue_id', 'artist_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE gig_status SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.gig_id);

  // Recalculate rollups
  recalculateArtistRollups(gig.artist_id);
  if (updates.artist_id && updates.artist_id !== gig.artist_id) {
    recalculateArtistRollups(updates.artist_id);
  }

  logAction({ action: 'update', entityType: 'gig', entityId: payload.gig_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Gig #${payload.gig_id} updated.` };
}

export function handleCreateFreelancer(payload) {
  if (!payload?.name) return { success: false, summary: 'Freelancer name is required' };

  const result = db.prepare(`
    INSERT INTO freelancers (name, email, phone, company_name, specialization, rate_per_video)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    payload.name, payload.email || null, payload.phone || null,
    payload.company_name || null, payload.specialization || null, payload.rate_per_video || null
  );

  logAction({ action: 'create', entityType: 'freelancer', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Freelancer #${result.lastInsertRowid} "${payload.name}" created.` };
}

export function handleUpdateFreelancer(payload) {
  if (!payload?.freelancer_id) return { success: false, summary: 'freelancer_id is required' };

  const freelancer = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(payload.freelancer_id);
  if (!freelancer) return { success: false, summary: `Freelancer #${payload.freelancer_id} not found` };

  const allowedFields = ['name', 'email', 'phone', 'company_name', 'specialization', 'rate_per_video', 'is_active'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE freelancers SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.freelancer_id);

  logAction({ action: 'update', entityType: 'freelancer', entityId: payload.freelancer_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Freelancer #${payload.freelancer_id} updated.` };
}

export function handleSendChatMessage(payload) {
  if (!payload?.client_id || !payload?.message) return { success: false, summary: 'client_id and message are required' };

  const result = db.prepare(
    'INSERT INTO internal_chat_messages (client_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)'
  ).run(payload.client_id, 0, 'OpenClaw', payload.message);

  const newMessage = db.prepare('SELECT * FROM internal_chat_messages WHERE id = ?').get(result.lastInsertRowid);

  import('../../server.js').then(({ broadcastEvent }) => {
    broadcastEvent('chat_message', { client_id: parseInt(payload.client_id), message: newMessage });
  }).catch(err => console.error('[OPENCLAW] Broadcast chat message failed:', err));

  logAction({ action: 'create', entityType: 'chat_message', entityId: result.lastInsertRowid, diff: { client_id: payload.client_id, source: 'openclaw' } });
  return { success: true, summary: `Chat message sent for client ${payload.client_id}.` };
}

export function handleUpdateKnowledge(payload) {
  if (!payload?.key || !payload?.content) return { success: false, summary: 'key and content are required' };
  db.prepare(`
    INSERT INTO agent_operational_knowledge (key, knowledge_type, content)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      knowledge_type = excluded.knowledge_type,
      content = excluded.content,
      updated_at = datetime('now')
  `).run(payload.key, payload.knowledge_type || 'general', JSON.stringify(payload.content));

  logAction({ action: 'upsert', entityType: 'knowledge', diff: { key: payload.key, source: 'agent' } });
  return { success: true, summary: `Knowledge "${payload.key}" saved.` };
}

export function handleOptimizeQueue(payload) {
  if (payload?.task_order && Array.isArray(payload.task_order)) {
    for (const item of payload.task_order) {
      if (item.task_id && item.priority) {
        db.prepare('UPDATE kanban_tasks SET priority = ?, updated_at = ? WHERE id = ?')
          .run(item.priority, new Date().toISOString(), item.task_id);
      }
    }
    logAction({ action: 'optimize_queue', entityType: 'task', diff: { task_count: payload.task_order.length, source: 'openclaw' } });
    return { success: true, summary: `Queue optimized: ${payload.task_order.length} tasks reordered.` };
  }
  return { success: true, summary: 'Queue optimization requested (no task_order provided).' };
}

// ============================================================
// BLOG POST HANDLERS
// ============================================================

/**
 * Generate a URL-friendly slug from a title.
 */
export function generateBlogSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/**
 * Ensure slug uniqueness by appending a counter if needed.
 */
export function ensureUniqueBlogSlug(slug, excludeId = null) {
  let candidate = slug;
  let counter = 1;
  while (true) {
    const existing = excludeId
      ? db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(candidate);
    if (!existing) return candidate;
    candidate = `${slug}-${counter++}`;
  }
}

export function handleCreateBlogPost(payload) {
  if (!payload?.title || !payload?.content) {
    return { success: false, summary: 'title and content are required' };
  }

  const slug = ensureUniqueBlogSlug(generateBlogSlug(payload.title));
  const status = payload.status || 'published';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO blog_posts (
      title, slug, excerpt, content, cover_image_url, audio_url, author, category, tags,
      meta_title, meta_description, meta_keywords, internal_links, status, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.title,
    slug,
    payload.excerpt || null,
    payload.content,
    payload.cover_image_url || null,
    payload.audio_url || null,
    payload.author || 'Hyphening Media',
    payload.category || 'General',
    payload.tags || null,
    payload.meta_title || null,
    payload.meta_description || null,
    payload.meta_keywords || null,
    JSON.stringify(payload.internal_links || []),
    status,
    publishedAt
  );

  logAction({
    action: 'create',
    entityType: 'blog_post',
    entityId: result.lastInsertRowid,
    diff: { title: payload.title, slug, status, source: 'openclaw' }
  });

  return {
    success: true,
    summary: `Blog post #${result.lastInsertRowid} "${payload.title}" created (${status}). Slug: /blog/${slug}`
  };
}

export function handleUpdateBlogPost(payload) {
  // Find post by blog_id or slug
  let post = null;
  if (payload.blog_id) {
    post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(payload.blog_id);
  } else if (payload.slug) {
    post = db.prepare('SELECT * FROM blog_posts WHERE slug = ?').get(payload.slug);
  }

  if (!post) return { success: false, summary: 'Blog post not found. Provide blog_id or slug.' };

  const allowedFields = [
    'title', 'excerpt', 'content', 'cover_image_url', 'audio_url', 'author', 'category', 'tags',
    'meta_title', 'meta_description', 'meta_keywords', 'internal_links', 'status'
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = field === 'internal_links' ? JSON.stringify(payload[field]) : payload[field];
    }
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };

  // Regenerate slug if title changes
  if (updates.title && updates.title !== post.title) {
    updates.slug = ensureUniqueBlogSlug(generateBlogSlug(updates.title), post.id);
  }

  // Set published_at if transitioning to published
  if (updates.status === 'published' && post.status !== 'published') {
    updates.published_at = new Date().toISOString();
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE blog_posts SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), post.id);

  logAction({
    action: 'update',
    entityType: 'blog_post',
    entityId: post.id,
    diff: { ...updates, source: 'openclaw' }
  });

  return {
    success: true,
    summary: `Blog post #${post.id} "${updates.title || post.title}" updated. Fields: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}`
  };
}

// ============================================================
// HELPER: Recalculate artist rollups (duplicated from artists.js)
// ============================================================

export function recalculateArtistRollups(artistId) {
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status != 'Cancelled' THEN 1 ELSE 0 END) as total_gigs,
      SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_gigs,
      SUM(CASE WHEN status = 'Pending' OR status = 'Advance Paid' THEN 1 ELSE 0 END) as pending_gigs,
      ROUND(AVG(CASE WHEN status = 'Paid' THEN fee_inr END), 0) as average_fee_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN fee_inr ELSE 0 END), 0) as total_amount_paid_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' OR status = 'Cancelled' THEN 0 ELSE fee_inr - advance_paid END), 0) as total_amount_pending_inr,
      MAX(CASE WHEN status != 'Cancelled' THEN gig_date END) as latest_gig_date
    FROM gig_status 
    WHERE artist_id = ?
  `).get(artistId);

  let reliability_score = null;
  if (stats.total_gigs > 0) {
    reliability_score = Math.round((stats.paid_gigs / stats.total_gigs) * 100);
  }

  let payment_status = 'No Records';
  if (stats.total_gigs > 0) {
    payment_status = stats.pending_gigs > 0 ? '⚠ Pending' : '✅ All Paid';
  }

  let last_perf_date = 'No gigs yet';
  if (stats.latest_gig_date) {
    const d = new Date(stats.latest_gig_date + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    last_perf_date = `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  db.prepare(`
    UPDATE artists SET 
      total_performances = ?, average_fee_inr = ?, total_amount_paid_inr = ?,
      total_amount_pending_inr = ?, payment_status = ?, reliability_score = ?, perf_with_m = ?,
      last_perf_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stats.total_gigs, stats.average_fee_inr || 0, stats.total_amount_paid_inr,
    stats.total_amount_pending_inr, payment_status, reliability_score, stats.paid_gigs || 0,
    stats.last_perf_date, new Date().toISOString(), artistId
  );
}
