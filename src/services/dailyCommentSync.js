import db from '../../database.js';
import { fetchPostComments } from './commentSync.js';

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

    if (!process.env.COMPOSIO_API_KEY) return;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO social_comments (
        content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const post of recentPosts) {
      try {
        for (const comment of await fetchPostComments(post.client_id, post)) {
          // Tagged with the platform the comment came from, not the row's
          // primary platform — a cross-posted row collects both.
          insert.run(
            post.id,
            post.client_id,
            comment.platform,
            comment.id,
            comment.author,
            comment.text,
            comment.publishedAt || new Date().toISOString()
          );
        }
      } catch (err) {
        console.error(`[COMMENT-SYNC] Failed to fetch comments for post #${post.id}:`, err.message);
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
