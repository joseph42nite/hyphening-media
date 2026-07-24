import db from '../../database.js';
import { executeClientAction } from './composioService.js';

/**
 * Daily Comment Ingestion Cron Worker (Runs once at 2:00 AM UTC)
 * Pulls recent comments into local SQLite cache to avoid API polling overhead.
 */
export async function runDailyCommentSync() {
  try {
    console.log('[COMMENT-SYNC] Running daily comment ingestion job...');

    // Fetch posted items with media IDs or links
    const recentPosts = db.prepare(`
      SELECT t.*, c.composio_entity_id
      FROM marketing_content_tracker t
      JOIN crm_clients c ON t.client_id = c.id
      WHERE t.status = 'Posted'
        AND (t.link IS NOT NULL OR t.platform_post_id IS NOT NULL OR t.instagram_media_id IS NOT NULL OR t.youtube_video_id IS NOT NULL)
    `).all();

    if (!recentPosts || recentPosts.length === 0) return;

    for (const post of recentPosts) {
      let postId = post.instagram_media_id || post.platform_post_id || post.youtube_video_id;
      if (!postId && post.link) {
        const igMatch = post.link.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
        if (igMatch) postId = igMatch[1];
        const ytMatch = post.link.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]+)/);
        if (!postId && ytMatch) postId = ytMatch[1];
      }

      if (!postId) continue;

      const platform = (post.platform || 'instagram').toLowerCase();

      if (process.env.COMPOSIO_API_KEY) {
        try {
          const action = platform.includes('youtube') ? 'YOUTUBE_GET_COMMENTS' : 'INSTAGRAM_GET_IG_MEDIA_COMMENTS';
          const paramKey = platform.includes('youtube') ? 'video_id' : 'ig_media_id';

          const res = await executeClientAction(post.client_id, action, { [paramKey]: postId });
          const comments = res?.comments || res?.data?.data || res?.data || [];

          for (const comm of comments) {
            const commenterName = comm.username || comm.from?.username || comm.from?.name || comm.user?.username || comm.user?.name || comm.owner?.username || comm.authorDisplayName || comm.snippet?.topLevelComment?.snippet?.authorDisplayName || 'Instagram User';
            db.prepare(`
              INSERT OR IGNORE INTO social_comments (
                content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              post.id,
              post.client_id,
              post.platform,
              comm.id || comm.comment_id,
              commenterName,
              comm.text || comm.textDisplay || '',
              comm.timestamp || new Date().toISOString()
            );
          }
        } catch (err) {
          console.error(`[COMMENT-SYNC] Failed to fetch comments for post #${post.id}:`, err.message);
        }
      }
    }

    console.log('[COMMENT-SYNC] ✓ Daily comment ingestion complete.');
  } catch (err) {
    console.error('[COMMENT-SYNC] Error running daily comment sync:', err.message);
  }
}

export default {
  runDailyCommentSync
};
