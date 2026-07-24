import db from '../../database.js';
import { executeClientAction } from './composioService.js';

/**
 * Extract Instagram shortcode from post link URL
 * e.g., https://www.instagram.com/reel/DaiJZ_Qzb6N/ => 'DaiJZ_Qzb6N'
 */
function extractInstagramShortcode(link) {
  if (!link) return null;
  const match = link.match(/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Fetch and sync metrics (Views, Likes, Comments, Shares, Saves, Engagement Rate, Content Score) for a single post item
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

  let numericMediaId = item.instagram_media_id || item.platform_post_id;
  let shortcode = extractInstagramShortcode(item.link);

  const platform = (item.platform || 'instagram').toLowerCase();
  let metrics = {
    views: item.views || 0,
    likes: item.likes || 0,
    comments: item.comments || 0,
    shares: item.shares || 0,
    saves: item.saves || 0
  };

  if (process.env.COMPOSIO_API_KEY && (platform.includes('instagram') || platform.includes('meta'))) {
    try {
      // 1. If we don't have numeric Graph API media ID, resolve it via INSTAGRAM_GET_IG_USER_MEDIA
      if (!numericMediaId || !/^\d+$/.test(numericMediaId)) {
        try {
          const userMedia = await executeClientAction(item.client_id, 'INSTAGRAM_GET_IG_USER_MEDIA', {
            ig_user_id: 'me',
            fields: 'id,caption,media_type,permalink,shortcode,like_count,comments_count,timestamp'
          });

          const mediaList = Array.isArray(userMedia?.data?.data) ? userMedia.data.data : [];
          const matched = mediaList.find(m => {
            if (!m) return false;
            if (shortcode && (m.shortcode === shortcode || (m.permalink && m.permalink.includes(shortcode)))) {
              return true;
            }
            if (item.link && m.permalink && item.link.includes(m.shortcode)) {
              return true;
            }
            return false;
          });

          if (matched) {
            numericMediaId = matched.id;
            metrics.likes = matched.like_count || metrics.likes;
            metrics.comments = matched.comments_count || metrics.comments;

            // Store resolved numeric ID in database for future syncs
            db.prepare('UPDATE marketing_content_tracker SET instagram_media_id = ? WHERE id = ?')
              .run(numericMediaId, contentId);
          }
        } catch (e) {
          console.warn(`[METRIC-SYNC] Could not resolve media ID for post #${contentId}:`, e.message);
        }
      }

      // 2. Fetch live insights (Views, Reach, Likes, Comments, Saved, Shares) via INSTAGRAM_GET_IG_MEDIA_INSIGHTS
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
              if (m.name === 'views') metrics.views = val;
              if (m.name === 'likes') metrics.likes = val;
              if (m.name === 'comments') metrics.comments = val;
              if (m.name === 'saved') metrics.saves = val;
              if (m.name === 'shares') metrics.shares = val;
            });
          }
        } catch (e) {
          console.warn(`[METRIC-SYNC] Insights fetch failed for post #${contentId}:`, e.message);
        }
      }
    } catch (err) {
      console.error(`[METRIC-SYNC] Live metric fetch failed for content #${contentId}:`, err.message);
    }
  }

  // Calculate engagement rate, save rate & content score
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
  syncSingleContentMetrics,
  runMetricSyncWorker
};
