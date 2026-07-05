import db from '../../database.js';
import { executeClientAction } from './composioService.js';

/**
 * Daily Comment Ingestion Cron Worker (Runs once at 2:00 AM UTC)
 * Pulls recent comments into local SQLite cache to avoid API polling overhead.
 */
export async function runDailyCommentSync() {
  try {
    console.log('[COMMENT-SYNC] Running daily comment ingestion job...');

    // Fetch recent posted items (last 30 days)
    const recentPosts = db.prepare(`
      SELECT t.*, c.composio_entity_id
      FROM marketing_content_tracker t
      JOIN crm_clients c ON t.client_id = c.id
      WHERE t.status = 'Posted'
        AND (t.platform_post_id IS NOT NULL OR t.instagram_media_id IS NOT NULL OR t.youtube_video_id IS NOT NULL)
        AND julianday('now') - julianday(t.date) <= 30
    `).all();

    if (!recentPosts || recentPosts.length === 0) return;

    for (const post of recentPosts) {
      const postId = post.platform_post_id || post.instagram_media_id || post.youtube_video_id;
      const platform = (post.platform || 'instagram').toLowerCase();

      if (process.env.COMPOSIO_API_KEY) {
        try {
          const action = platform.includes('youtube') ? 'YOUTUBE_GET_COMMENTS' : 'INSTAGRAM_GET_MEDIA_COMMENTS';
          const paramKey = platform.includes('youtube') ? 'video_id' : 'media_id';

          const res = await executeClientAction(post.client_id, action, { [paramKey]: postId });
          const comments = res?.comments || res?.data || [];

          for (const comm of comments) {
            db.prepare(`
              INSERT OR IGNORE INTO social_comments (
                content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              post.id,
              post.client_id,
              post.platform,
              comm.id || comm.comment_id,
              comm.username || comm.authorDisplayName || 'User',
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
