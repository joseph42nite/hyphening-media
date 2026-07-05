import db from '../../database.js';
import { executeClientAction } from './composioService.js';
import { broadcastEvent } from '../../server.js';

/**
 * 2-Stage Metric Sync Worker & On-Demand Refresh Service
 * Stage 1: 7 days after post
 * Stage 2: 30 days after post
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

  const postId = item.platform_post_id || item.instagram_media_id || item.youtube_video_id;
  if (!postId) {
    throw new Error(`Content item #${contentId} does not have a live platform post ID`);
  }

  const platform = (item.platform || 'instagram').toLowerCase();
  let metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };

  if (process.env.COMPOSIO_API_KEY) {
    try {
      if (platform.includes('youtube')) {
        const res = await executeClientAction(item.client_id, 'YOUTUBE_GET_VIDEO_STATS', { video_id: postId });
        metrics = {
          views: parseInt(res?.viewCount || 0, 10),
          likes: parseInt(res?.likeCount || 0, 10),
          comments: parseInt(res?.commentCount || 0, 10),
          shares: 0,
          saves: 0
        };
      } else {
        const res = await executeClientAction(item.client_id, 'INSTAGRAM_GET_MEDIA_INSIGHTS', { media_id: postId });
        metrics = {
          views: parseInt(res?.plays || res?.views || 0, 10),
          likes: parseInt(res?.like_count || 0, 10),
          comments: parseInt(res?.comments_count || 0, 10),
          shares: parseInt(res?.shares || 0, 10),
          saves: parseInt(res?.saved || 0, 10)
        };
      }
    } catch (err) {
      console.error(`[METRIC-SYNC] Failed to fetch live metrics for content #${contentId}:`, err.message);
    }
  } else {
    // Dry-run simulation for dev
    console.log(`[METRIC-SYNC] [MOCK] Refreshing metrics for item #${contentId}`);
    metrics = {
      views: (item.views || 100) + Math.floor(Math.random() * 50),
      likes: (item.likes || 10) + Math.floor(Math.random() * 5),
      comments: (item.comments || 2) + Math.floor(Math.random() * 2),
      shares: item.shares || 0,
      saves: item.saves || 0
    };
  }

  db.prepare(`
    UPDATE marketing_content_tracker
    SET views = ?, likes = ?, comments = ?, shares = ?, saves = ?
    WHERE id = ?
  `).run(metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.saves, contentId);

  broadcastEvent('metrics_updated', {
    content_id: contentId,
    client_id: item.client_id,
    metrics
  });

  return metrics;
}

/**
 * 2-Stage Background Cron Sync for Posted Items
 */
export async function runMetricSyncWorker() {
  try {
    // Find items posted 7 days or 30 days ago that need metric refresh
    const itemsToRefresh = db.prepare(`
      SELECT id FROM marketing_content_tracker
      WHERE status = 'Posted'
        AND (platform_post_id IS NOT NULL OR instagram_media_id IS NOT NULL OR youtube_video_id IS NOT NULL)
        AND (
          julianday('now') - julianday(date) BETWEEN 7 AND 8
          OR julianday('now') - julianday(date) BETWEEN 30 AND 31
        )
    `).all();

    if (itemsToRefresh.length === 0) return;

    console.log(`[METRIC-SYNC] Refreshing 2-Stage metrics for ${itemsToRefresh.length} post(s)...`);
    for (const row of itemsToRefresh) {
      await syncSingleContentMetrics(row.id);
    }
  } catch (err) {
    console.error('[METRIC-SYNC] Error running metric sync worker:', err.message);
  }
}

export default {
  syncSingleContentMetrics,
  runMetricSyncWorker
};
