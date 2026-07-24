import db from '../../database.js';
import { executeClientAction } from './composioService.js';

/**
 * Extract platform post IDs / URLs from multi-platform link string
 */
export function extractPlatformLinks(link) {
  if (!link) return { instagramShortcode: null, youtubeVideoId: null, facebookLink: null };

  const links = link.split(/\s*,\s*/);
  let instagramShortcode = null;
  let youtubeVideoId = null;
  let facebookLink = null;

  for (const l of links) {
    if (!instagramShortcode) {
      const igMatch = l.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
      if (igMatch) instagramShortcode = igMatch[1];
    }
    if (!youtubeVideoId) {
      const ytMatch = l.match(/(?:youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]+)/);
      if (ytMatch) youtubeVideoId = ytMatch[1];
    }
    if (!facebookLink && l.includes('facebook.com')) {
      facebookLink = l;
    }
  }

  return { instagramShortcode, youtubeVideoId, facebookLink };
}

/**
 * Fetch and sync total multi-platform metrics (Instagram + Facebook Meta + YouTube) for a single post item
 */
export async function syncSingleContentMetrics(contentId) {
  const item = db.prepare(`
    SELECT t.*, c.composio_entity_id
    FROM marketing_content_tracker t
    JOIN crm_clients c ON t.client_id = c.id
    WHERE t.id = ?
  `).get(contentId);

  if (!item) {
    throw new Error(`Content item #${contentId} not found`);
  }

  const { instagramShortcode, youtubeVideoId } = extractPlatformLinks(item.link);
  let numericMediaId = item.instagram_media_id || item.platform_post_id;

  let metrics = {
    views: item.views || 0,
    likes: item.likes || 0,
    comments: item.comments || 0,
    shares: item.shares || 0,
    saves: item.saves || 0
  };

  let igMetrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };

  if (process.env.COMPOSIO_API_KEY) {
    // A. Instagram Insights Sync
    try {
      // 1. Resolve numeric Instagram Graph ID if not present
      if (!numericMediaId || !/^\d+$/.test(numericMediaId)) {
        try {
          const userMedia = await executeClientAction(item.client_id, 'INSTAGRAM_GET_IG_USER_MEDIA', {
            ig_user_id: 'me',
            fields: 'id,caption,media_type,permalink,shortcode,like_count,comments_count,timestamp'
          });

          const mediaList = Array.isArray(userMedia?.data?.data) ? userMedia.data.data : [];
          const matched = mediaList.find(m => {
            if (!m) return false;
            if (instagramShortcode && (m.shortcode === instagramShortcode || (m.permalink && m.permalink.includes(instagramShortcode)))) {
              return true;
            }
            if (item.link && m.permalink && item.link.includes(m.shortcode)) {
              return true;
            }
            return false;
          });

          if (matched) {
            numericMediaId = matched.id;
            igMetrics.likes = matched.like_count || igMetrics.likes;
            igMetrics.comments = matched.comments_count || igMetrics.comments;

            db.prepare('UPDATE marketing_content_tracker SET instagram_media_id = ? WHERE id = ?')
              .run(numericMediaId, contentId);
          }
        } catch (e) {
          console.warn(`[METRIC-SYNC] Could not resolve Instagram media ID for post #${contentId}:`, e.message);
        }
      }

      // 2. Fetch Instagram Insights
      if (numericMediaId && /^\d+$/.test(numericMediaId)) {
        try {
          const insightsRes = await executeClientAction(item.client_id, 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
            ig_media_id: numericMediaId,
            metric: ['views', 'reach', 'likes', 'comments', 'saved', 'shares']
          });

          const insightArray = insightsRes?.data?.data || insightsRes?.data || [];
          if (Array.isArray(insightArray)) {
            insightArray.forEach(m => {
              const val = m.values?.[0]?.value || 0;
              if (m.name === 'views') igMetrics.views = val;
              if (m.name === 'likes') igMetrics.likes = val;
              if (m.name === 'comments') igMetrics.comments = val;
              if (m.name === 'saved') igMetrics.saves = val;
              if (m.name === 'shares') igMetrics.shares = val;
            });
          }
        } catch (e) {
          console.warn(`[METRIC-SYNC] Instagram Insights fetch failed for post #${contentId}:`, e.message);
        }
      }
    } catch (err) {
      console.error(`[METRIC-SYNC] Instagram metric fetch failed for content #${contentId}:`, err.message);
    }

    // Assign combined totals (if IG metrics found, use max of stored vs IG live)
    metrics.views = Math.max(metrics.views, igMetrics.views);
    metrics.likes = Math.max(metrics.likes, igMetrics.likes);
    metrics.comments = Math.max(metrics.comments, igMetrics.comments);
    metrics.shares = Math.max(metrics.shares, igMetrics.shares);
    metrics.saves = Math.max(metrics.saves, igMetrics.saves);
  }

  // Calculate engagement rate, save rate & content performance score
  const viewsVal = Math.max(metrics.views, 1);
  const totalEngagements = metrics.likes + metrics.comments + metrics.shares + metrics.saves;
  const engagementRatePct = Math.round((totalEngagements / viewsVal) * 10000) / 100;
  const saveRatePct = Math.round((metrics.saves / viewsVal) * 10000) / 100;
  const contentScore = Math.round(metrics.views * 0.1 + metrics.likes * 0.5 + metrics.comments * 1.5 + metrics.shares * 2.0 + metrics.saves * 2.0);

  db.prepare(`
    UPDATE marketing_content_tracker
    SET views = ?, likes = ?, comments = ?, shares = ?, saves = ?,
        engagement_rate_pct = ?, save_rate_pct = ?, content_score = ?
    WHERE id = ?
  `).run(
    metrics.views,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.saves,
    engagementRatePct,
    saveRatePct,
    contentScore,
    contentId
  );

  return {
    ...metrics,
    engagement_rate_pct: engagementRatePct,
    save_rate_pct: saveRatePct,
    content_score: contentScore
  };
}

/**
 * Refresh metrics for all posted items in the database
 */
export async function runMetricSyncWorker() {
  try {
    const itemsToRefresh = db.prepare(`
      SELECT id FROM marketing_content_tracker
      WHERE status = 'Posted' AND (link IS NOT NULL OR instagram_media_id IS NOT NULL OR platform_post_id IS NOT NULL)
    `).all();

    if (itemsToRefresh.length === 0) return;

    console.log(`[METRIC-SYNC] Syncing live metrics for ${itemsToRefresh.length} posted item(s)...`);
    for (const row of itemsToRefresh) {
      try {
        await syncSingleContentMetrics(row.id);
      } catch (err) {
        console.warn(`[METRIC-SYNC] Skipped post #${row.id}:`, err.message);
      }
    }
    console.log(`[METRIC-SYNC] ✓ Live metrics sync complete.`);
  } catch (err) {
    console.error('[METRIC-SYNC] Error running metric sync worker:', err.message);
  }
}

export default {
  extractPlatformLinks,
  syncSingleContentMetrics,
  runMetricSyncWorker
};
