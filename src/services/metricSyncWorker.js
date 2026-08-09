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
 * Fetch the full Instagram media list for a client (cached per sync run)
 */
const mediaListCache = new Map();
async function getClientMediaList(clientId) {
  if (mediaListCache.has(clientId)) return mediaListCache.get(clientId);
  try {
    const userMedia = await executeClientAction(clientId, 'INSTAGRAM_GET_IG_USER_MEDIA', {
      ig_user_id: 'me',
      fields: 'id,caption,media_type,permalink,shortcode,like_count,comments_count,timestamp'
    });
    const list = Array.isArray(userMedia?.data?.data) ? userMedia.data.data : [];
    mediaListCache.set(clientId, list);
    return list;
  } catch (e) {
    console.warn(`[METRIC-SYNC] Could not fetch IG media list for client #${clientId}:`, e.message);
    mediaListCache.set(clientId, []);
    return [];
  }
}

/**
 * Match a content tracker row to an Instagram media item.
 * Strategy: 1) Match by shortcode/link  2) Match by date proximity (±2 days)
 */
function findMatchingMedia(item, mediaList) {
  const shortcode = extractInstagramShortcode(item.link);

  // 1. Match by shortcode
  if (shortcode) {
    const match = mediaList.find(m =>
      m.shortcode === shortcode || (m.permalink && m.permalink.includes(shortcode))
    );
    if (match) return match;
  }

  // 2. Match by link containing shortcode
  if (item.link) {
    const match = mediaList.find(m => m.shortcode && item.link.includes(m.shortcode));
    if (match) return match;
  }

  // 3. Match by date proximity (±2 days) + post_type alignment
  if (item.date) {
    const itemDate = new Date(item.date);
    const postType = (item.post_type || '').toLowerCase();

    // Filter by media type alignment
    const candidates = mediaList.filter(m => {
      if (!m.timestamp) return false;
      const mediaDate = new Date(m.timestamp);
      const diffDays = Math.abs((mediaDate - itemDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 2) return false;

      // Align post_type with media_type
      const mediaType = (m.media_type || '').toUpperCase();
      if (postType === 'reel' && mediaType !== 'VIDEO') return false;
      if (postType === 'carousel' && mediaType !== 'CAROUSEL_ALBUM') return false;
      if (postType === 'static' && mediaType !== 'IMAGE') return false;

      return true;
    });

    // Pick the closest by date
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const diffA = Math.abs(new Date(a.timestamp) - itemDate);
        const diffB = Math.abs(new Date(b.timestamp) - itemDate);
        return diffA - diffB;
      });
      return candidates[0];
    }
  }

  return null;
}

/**
 * Extract a YouTube video ID from a watch/shorts/youtu.be URL
 */
function extractYouTubeVideoId(link) {
  if (!link) return null;
  const match = link.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|watch\?v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

/**
 * YouTube Data API returns statistics as strings ("766"), so coerce carefully —
 * a legitimate "0" must not fall through to the stored value.
 */
function toCount(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Fetch the connected channel's uploads for a client (cached per sync run)
 */
const ytVideoListCache = new Map();
async function getClientYouTubeVideos(clientId) {
  if (ytVideoListCache.has(clientId)) return ytVideoListCache.get(clientId);
  try {
    const res = await executeClientAction(clientId, 'YOUTUBE_LIST_CHANNEL_VIDEOS', {
      mine: true,
      maxResults: 50
    });
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];
    const list = items
      .map(i => ({
        videoId: i.snippet?.resourceId?.videoId || null,
        title: i.snippet?.title || '',
        description: i.snippet?.description || '',
        publishedAt: i.snippet?.publishedAt || null
      }))
      .filter(v => v.videoId);
    ytVideoListCache.set(clientId, list);
    return list;
  } catch (e) {
    console.warn(`[METRIC-SYNC] Could not fetch YouTube video list for client #${clientId}:`, e.message);
    ytVideoListCache.set(clientId, []);
    return [];
  }
}

function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Match a content tracker row to a channel upload.
 * Strategy: 1) Match by title  2) Match by publish date proximity (±2 days)
 */
function findMatchingYouTubeVideo(item, videos) {
  const title = normalizeTitle(item.title);
  if (title) {
    const match = videos.find(v => normalizeTitle(v.title) === title);
    if (match) return match;
  }

  if (item.date) {
    const itemDate = new Date(item.date);
    const candidates = videos.filter(v => {
      if (!v.publishedAt) return false;
      const diffDays = Math.abs((new Date(v.publishedAt) - itemDate) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const diffA = Math.abs(new Date(a.publishedAt) - itemDate);
        const diffB = Math.abs(new Date(b.publishedAt) - itemDate);
        return diffA - diffB;
      });
      return candidates[0];
    }
  }

  return null;
}

/**
 * Resolve a YouTube video ID for the item and pull live statistics into `metrics`.
 * Returns the resolved video ID, or null if the post could not be matched.
 *
 * Note: views/likes/comments come from the YouTube Data API. Watch time, average
 * view duration and CTR live in the YouTube Analytics API, which the Composio
 * youtube toolkit does not expose — those columns are left untouched.
 */
async function syncYouTubeMetrics(item, metrics) {
  let videoId = item.youtube_video_id
    || extractYouTubeVideoId(item.youtube_link)
    || extractYouTubeVideoId(item.link);
  const updateFields = {};

  // Fall back to matching against the channel feed when no link is stored
  if (!videoId) {
    const matched = findMatchingYouTubeVideo(item, await getClientYouTubeVideos(item.client_id));
    if (matched) {
      videoId = matched.videoId;
      if (!item.title && matched.title) updateFields.title = matched.title;
    }
  }

  if (!videoId) return null;

  if (videoId !== item.youtube_video_id) updateFields.youtube_video_id = videoId;
  if (!item.link) updateFields.link = `https://youtu.be/${videoId}`;

  const detailsRes = await executeClientAction(item.client_id, 'YOUTUBE_GET_VIDEO_DETAILS_BATCH', {
    id: [videoId],
    parts: ['snippet', 'statistics']
  });

  const video = detailsRes?.data?.items?.[0];
  if (!video) {
    throw new Error(`Video ${videoId} not returned by YouTube (deleted, private, or on another channel)`);
  }

  const stats = video.statistics || {};
  metrics.youtube_views = toCount(stats.viewCount, metrics.youtube_views);
  metrics.likes = toCount(stats.likeCount, metrics.likes);
  metrics.comments = toCount(stats.commentCount, metrics.comments);

  if (!item.caption && video.snippet?.description) {
    updateFields.caption = video.snippet.description;
  }

  if (Object.keys(updateFields).length > 0) {
    const setClauses = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE marketing_content_tracker SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updateFields), item.id);
  }

  return videoId;
}

/**
 * Fetch and sync metrics for a single post item
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
  const platform = (item.platform || 'instagram').toLowerCase();
  const isYouTube = platform.includes('youtube') || platform.includes('shorts');
  const isInstagram = platform.includes('instagram') || platform.includes('meta');
  let metrics = {
    views: item.views || 0,
    youtube_views: item.youtube_views || 0,
    likes: item.likes || 0,
    comments: item.comments || 0,
    shares: item.shares || 0,
    saves: item.saves || 0
  };
  let youtubeSynced = false;

  if (process.env.COMPOSIO_API_KEY && isYouTube) {
    try {
      youtubeSynced = !!(await syncYouTubeMetrics(item, metrics));
      if (!youtubeSynced) {
        console.warn(`[METRIC-SYNC] No YouTube video matched for post #${contentId} — add a link or title to match on.`);
      }
    } catch (err) {
      console.error(`[METRIC-SYNC] YouTube metric fetch failed for content #${contentId}:`, err.message);
    }
  }

  if (process.env.COMPOSIO_API_KEY && isInstagram) {
    try {
      // 1. Resolve numeric Graph API media ID if we don't have a valid one
      if (!numericMediaId || !/^\d+$/.test(numericMediaId)) {
        const mediaList = await getClientMediaList(item.client_id);
        const matched = findMatchingMedia(item, mediaList);

        if (matched) {
          numericMediaId = matched.id;
          metrics.likes = matched.like_count || metrics.likes;
          metrics.comments = matched.comments_count || metrics.comments;

          // Store resolved ID, link, and posting time back in database
          const updateFields = { instagram_media_id: numericMediaId };
          if (!item.link && matched.permalink) {
            updateFields.link = matched.permalink;
          }
          if (!item.time && matched.timestamp) {
            // Convert UTC timestamp to IST (UTC+5:30) and format as HH:MM
            const postDate = new Date(matched.timestamp);
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(postDate.getTime() + istOffset);
            const hours = String(istDate.getUTCHours()).padStart(2, '0');
            const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
            updateFields.time = `${hours}:${minutes}`;
          }
          if (!item.caption && matched.caption) {
            updateFields.caption = matched.caption;
          }
          const setClauses = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
          db.prepare(`UPDATE marketing_content_tracker SET ${setClauses} WHERE id = ?`)
            .run(...Object.values(updateFields), contentId);
        }
      }

      // 2. Fetch live insights via INSTAGRAM_GET_IG_MEDIA_INSIGHTS
      if (numericMediaId && /^\d+$/.test(numericMediaId)) {
        try {
          const insightsRes = await executeClientAction(item.client_id, 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
            ig_media_id: numericMediaId,
            metric: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']
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
              if (m.name === 'ig_reels_avg_watch_time' && val > 0) {
                // Convert ms to seconds (e.g. 10.67s)
                metrics.avg_watch_time_pct = Math.round((val / 1000) * 100) / 100;
              }
            });
          }
        } catch (e) {
          console.warn(`[METRIC-SYNC] Insights fetch failed for post #${contentId}:`, e.message);
          // Clear invalid media ID so it re-resolves on next sync
          db.prepare('UPDATE marketing_content_tracker SET instagram_media_id = NULL WHERE id = ?').run(contentId);
        }
      }
    } catch (err) {
      console.error(`[METRIC-SYNC] Live metric fetch failed for content #${contentId}:`, err.message);
    }
  }

  // YouTube view counts live in youtube_views; reports sum `views + youtube_views`,
  // so leaving a stale `views` on a YouTube row would double-count it.
  if (youtubeSynced) metrics.views = 0;

  // Calculate engagement rate, save rate & content score
  const effectiveViews = isYouTube ? metrics.youtube_views : metrics.views;
  const viewsVal = Math.max(effectiveViews, 1);
  const totalEngagements = metrics.likes + metrics.comments + metrics.shares + metrics.saves;
  const engagementRatePct = Math.round((totalEngagements / viewsVal) * 10000) / 100;
  const saveRatePct = Math.round((metrics.saves / viewsVal) * 10000) / 100;
  const contentScore = Math.round(effectiveViews * 0.1 + metrics.likes * 0.5 + metrics.comments * 1.5 + metrics.shares * 2.0 + metrics.saves * 2.0);

  const avgWatchTimePct = metrics.avg_watch_time_pct !== undefined ? metrics.avg_watch_time_pct : (item.avg_watch_time_pct || null);
  const skipRatePct = avgWatchTimePct !== null && avgWatchTimePct !== undefined ? Math.max(0, Math.round((100 - avgWatchTimePct) * 100) / 100) : (item.skip_rate_pct || null);
  const boostedVal = item.boosted ? item.boosted : 'No';

  db.prepare(`
    UPDATE marketing_content_tracker
    SET views = ?, youtube_views = ?, likes = ?, comments = ?, shares = ?, saves = ?,
        avg_watch_time_pct = ?, skip_rate_pct = ?, boosted = ?,
        engagement_rate_pct = ?, save_rate_pct = ?, content_score = ?
    WHERE id = ?
  `).run(
    metrics.views,
    metrics.youtube_views,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.saves,
    avgWatchTimePct,
    skipRatePct,
    boostedVal,
    engagementRatePct,
    saveRatePct,
    contentScore,
    contentId
  );

  return {
    ...metrics,
    avg_watch_time_pct: avgWatchTimePct,
    skip_rate_pct: skipRatePct,
    boosted: boostedVal,
    engagement_rate_pct: engagementRatePct,
    save_rate_pct: saveRatePct,
    content_score: contentScore
  };
}

/**
 * Refresh metrics for ALL posted items — including those without links.
 * Fetches each client's IG feed / YouTube uploads once and auto-matches by
 * shortcode, title or date.
 */
export async function runMetricSyncWorker() {
  try {
    // Clear caches at start of each run
    mediaListCache.clear();
    ytVideoListCache.clear();

    // Sync ALL posted items, not just those with links
    const itemsToRefresh = db.prepare(`
      SELECT id FROM marketing_content_tracker
      WHERE status = 'Posted'
    `).all();

    if (itemsToRefresh.length === 0) return;

    console.log(`[METRIC-SYNC] Syncing live metrics for ${itemsToRefresh.length} posted item(s) (Composio Free Tier Safe)...`);
    for (const row of itemsToRefresh) {
      try {
        await syncSingleContentMetrics(row.id);
        // 300ms rate-limit delay between API calls
        await new Promise(res => setTimeout(res, 300));
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
