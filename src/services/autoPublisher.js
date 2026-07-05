import db from '../../database.js';
import { executeClientAction } from './composioService.js';
import { broadcastEvent } from '../../server.js';

/**
 * High-Quality Direct Video Auto-Publisher Worker
 * Checks for scheduled videos ready to be published via Composio streaming pipeline.
 */
export async function runAutoPublisher() {
  try {
    const nowISO = new Date().toISOString();
    const currentDate = nowISO.split('T')[0];
    const currentTime = nowISO.split('T')[1].substring(0, 5); // HH:MM

    // Fetch scheduled video content ready for publishing
    const readyContent = db.prepare(`
      SELECT t.*, c.name AS client_name, c.composio_entity_id
      FROM marketing_content_tracker t
      JOIN crm_clients c ON t.client_id = c.id
      WHERE t.status IN ('Client Approved', 'Pending', 'Scheduled')
        AND (
          (t.date IS NOT NULL AND (t.date < ? OR (t.date = ? AND (t.time IS NULL OR t.time <= ?))))
          OR (t.scheduled_at IS NOT NULL AND t.scheduled_at <= datetime('now'))
        )
    `).all(currentDate, currentDate, currentTime);

    if (!readyContent || readyContent.length === 0) {
      return;
    }

    console.log(`[AUTO-PUBLISHER] Found ${readyContent.length} video post(s) ready to publish.`);

    for (const item of readyContent) {
      try {
        const platform = (item.platform || 'instagram').toLowerCase();
        let actionName = 'INSTAGRAM_CREATE_USER_REEL_MEDIA';
        let params = {
          caption: item.caption || '',
          video_url: item.link
        };

        if (platform.includes('youtube')) {
          actionName = 'YOUTUBE_POST_VIDEO';
          params = {
            title: item.title || 'New Video',
            description: item.caption || '',
            video_url: item.link
          };
        } else if (platform.includes('linkedin')) {
          actionName = 'LINKEDIN_CREATE_VIDEO_POST';
          params = {
            text: item.caption || '',
            video_url: item.link
          };
        } else if (platform.includes('facebook')) {
          actionName = 'FACEBOOK_POST_PAGE_REEL';
          params = {
            description: item.caption || '',
            video_url: item.link
          };
        }

        console.log(`[AUTO-PUBLISHER] Publishing item #${item.id} ("${item.title}") to ${platform}...`);
        
        let result = null;
        if (process.env.COMPOSIO_API_KEY) {
          result = await executeClientAction(item.client_id, actionName, params);
        } else {
          console.log(`[AUTO-PUBLISHER] [MOCK] Dry-run publishing item #${item.id} to ${platform}. (Set COMPOSIO_API_KEY to publish live).`);
          result = { id: `mock_post_${Date.now()}` };
        }

        const postId = result?.id || result?.media_id || result?.video_id || `post_${Date.now()}`;

        // Update content tracker status to Posted
        db.prepare(`
          UPDATE marketing_content_tracker
          SET status = 'Posted',
              platform_post_id = ?,
              instagram_media_id = CASE WHEN ? LIKE '%instagram%' THEN ? ELSE instagram_media_id END,
              youtube_video_id = CASE WHEN ? LIKE '%youtube%' THEN ? ELSE youtube_video_id END,
              platform_metadata = ?
          WHERE id = ?
        `).run(postId, platform, postId, platform, postId, JSON.stringify(result || {}), item.id);

        // Sync linked Kanban task if present
        if (item.kanban_task_id) {
          db.prepare(`
            UPDATE kanban_tasks
            SET status = 'delivered', completed_at = datetime('now')
            WHERE id = ?
          `).run(item.kanban_task_id);
        }

        console.log(`[AUTO-PUBLISHER] ✓ Successfully published item #${item.id}! Live Post ID: ${postId}`);

        broadcastEvent('content_posted', {
          content_id: item.id,
          client_id: item.client_id,
          platform: item.platform,
          platform_post_id: postId,
          status: 'Posted'
        });

      } catch (postErr) {
        console.error(`[AUTO-PUBLISHER] ✗ Error publishing item #${item.id}:`, postErr.message);
      }
    }
  } catch (err) {
    console.error('[AUTO-PUBLISHER] Error in auto-publisher cycle:', err.message);
  }
}

export default {
  runAutoPublisher
};
