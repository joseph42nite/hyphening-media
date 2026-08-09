import db from '../../database.js';
import { executeClientAction } from './composioService.js';
import { extractYouTubeId } from './linkExtractor.js';

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
 * INSTAGRAM_GET_IG_MEDIA_INSIGHTS is strictly per-post — it cannot be batched —
 * so it dominates the Composio call budget. Posts older than this window keep
 * their stored insight figures and are refreshed from the account feed instead,
 * which costs one call per client no matter how many posts it covers.
 */
const INSIGHTS_WINDOW_DAYS = parseInt(process.env.METRIC_INSIGHTS_WINDOW_DAYS, 10) || 60;

function isWithinInsightsWindow(item) {
  if (!item.date) return true; // undated posts can't be aged out — keep them live
  const ageDays = (Date.now() - new Date(item.date).getTime()) / (1000 * 60 * 60 * 24);
  return !Number.isFinite(ageDays) || ageDays <= INSIGHTS_WINDOW_DAYS;
}

/**
 * Parse an ISO 8601 duration (PT1H2M41S) into seconds.
 */
function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, min, s] = m;
  return (+(d || 0)) * 86400 + (+(h || 0)) * 3600 + (+(min || 0)) * 60 + Math.round(+(s || 0));
}

/**
 * YouTube treats a video as a Short when it is 60s or under (3 minutes for
 * uploads after Oct 2024, but the 60s line matches how this channel posts and
 * keeps the label stable for older videos).
 */
const SHORTS_MAX_SECONDS = 60;

/**
 * Views per day since publication. Raw view count mostly measures how long a
 * video has been up; this is what makes a 3-day-old video comparable to one
 * from last year.
 */
function viewsPerDay(views, publishedAt) {
  if (!publishedAt || !views) return null;
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays <= 0) return null;
  return Math.round((views / Math.max(ageDays, 1)) * 10) / 10;
}

function ratePct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 10000) / 100;
}

/**
 * Extract a YouTube video ID from a watch/shorts/youtu.be URL. Shared with the
 * create/update path so a link resolves to the same video in both places.
 */
const extractYouTubeVideoId = extractYouTubeId;

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
 * True when the row points at a YouTube video, whatever its `platform` says.
 */
function hasYouTubeVideo(item) {
  return !!(item.youtube_video_id
    || extractYouTubeVideoId(item.youtube_link)
    || extractYouTubeVideoId(item.link));
}

/**
 * Resolve an item's video ID without spending an API call: stored ID first, then
 * the link columns, then the (already cached) channel upload feed.
 */
async function resolveYouTubeVideoId(item) {
  const stored = item.youtube_video_id
    || extractYouTubeVideoId(item.youtube_link)
    || extractYouTubeVideoId(item.link);
  if (stored) return { videoId: stored, matched: null };

  const matched = findMatchingYouTubeVideo(item, await getClientYouTubeVideos(item.client_id));
  return { videoId: matched?.videoId || null, matched };
}

/**
 * Look up video statistics, fetching in batches of 50 and memoising per client.
 *
 * YOUTUBE_GET_VIDEO_DETAILS_BATCH costs one Composio call whether it carries a
 * single ID or fifty, so a whole channel's back catalogue collapses into one or
 * two calls per run instead of one call per post.
 */
const YT_BATCH_SIZE = 50;
const ytStatsCache = new Map();
const ytStatsErrors = new Map();
async function primeYouTubeStats(clientId, videoIds) {
  let cache = ytStatsCache.get(clientId);
  if (!cache) {
    cache = new Map();
    ytStatsCache.set(clientId, cache);
  }

  const missing = [...new Set(videoIds)].filter(id => id && !cache.has(id));
  for (let i = 0; i < missing.length; i += YT_BATCH_SIZE) {
    const chunk = missing.slice(i, i + YT_BATCH_SIZE);
    try {
      const res = await executeClientAction(clientId, 'YOUTUBE_GET_VIDEO_DETAILS_BATCH', {
        id: chunk,
        parts: ['snippet', 'statistics', 'contentDetails']
      });
      for (const video of (res?.data?.items || [])) {
        if (video?.id) cache.set(video.id, video);
      }
      // IDs YouTube did not return are deleted, private, or on another channel.
      // Cache the miss so later posts in the same run don't re-request them.
      for (const id of chunk) {
        if (!cache.has(id)) cache.set(id, null);
      }
    } catch (e) {
      console.warn(`[METRIC-SYNC] YouTube stats batch failed for client #${clientId}:`, e.message);
      ytStatsErrors.set(clientId, e.message);
      // A failed toolkit call — no connection, revoked auth — won't heal between
      // posts, so cache the miss rather than retrying it once per post.
      for (const id of chunk) {
        if (!cache.has(id)) cache.set(id, null);
      }
    }
  }

  return cache;
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
  const { videoId } = await resolveYouTubeVideoId(item);
  if (!videoId) return null;

  const updateFields = {};
  if (videoId !== item.youtube_video_id) updateFields.youtube_video_id = videoId;
  if (!item.link) updateFields.link = `https://youtu.be/${videoId}`;

  // Already primed by the worker for batch runs; falls back to a chunk of one
  // when called from the single-post refresh endpoint.
  const statsCache = await primeYouTubeStats(item.client_id, [videoId]);
  const video = statsCache.get(videoId);
  if (!video) {
    const batchError = ytStatsErrors.get(item.client_id);
    throw new Error(batchError
      ? `YouTube stats unavailable for ${videoId} — ${batchError} (is YouTube connected for this client?)`
      : `Video ${videoId} not returned by YouTube (deleted, private, or on another channel)`);
  }

  const stats = video.statistics || {};
  metrics.youtube_views = toCount(stats.viewCount, metrics.youtube_views);
  metrics.likes = toCount(stats.likeCount, metrics.likes);
  metrics.comments = toCount(stats.commentCount, metrics.comments);

  // Performance context: age and length, so a video can be judged against its
  // own format and how long it has had to accumulate views.
  const publishedAt = video.snippet?.publishedAt || null;
  const durationSeconds = parseIsoDuration(video.contentDetails?.duration);

  updateFields.youtube_published_at = publishedAt;
  updateFields.youtube_duration_seconds = durationSeconds;
  updateFields.youtube_format = durationSeconds === null
    ? null
    : (durationSeconds <= SHORTS_MAX_SECONDS ? 'Short' : 'Long');
  updateFields.youtube_views_per_day = viewsPerDay(metrics.youtube_views, publishedAt);
  updateFields.youtube_like_rate_pct = ratePct(metrics.likes, metrics.youtube_views);
  updateFields.youtube_comment_rate_pct = ratePct(metrics.comments, metrics.youtube_views);

  if (!item.title && video.snippet?.title) {
    updateFields.title = video.snippet.title;
  }
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
  // `platform` names the primary channel, but Shorts are routinely logged as
  // platform=instagram/post_type=Reel with the YouTube URL in `link` — the same
  // cut posted to both. Route on the links present, not on the label, or every
  // cross-posted Short goes unsynced.
  const isYouTubePrimary = platform.includes('youtube') || platform.includes('shorts');
  const isYouTube = isYouTubePrimary || hasYouTubeVideo(item);
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

      // 2. Older posts skip the per-post insights call and take whatever the
      //    account feed still carries — likes and comments come back for free
      //    there. Views/saves/shares keep their last synced values.
      const recentEnoughForInsights = isWithinInsightsWindow(item);
      if (!recentEnoughForInsights && numericMediaId) {
        const feedItem = (await getClientMediaList(item.client_id)).find(m => m.id === numericMediaId);
        if (feedItem) {
          metrics.likes = toCount(feedItem.like_count, metrics.likes);
          metrics.comments = toCount(feedItem.comments_count, metrics.comments);
        }
      }

      // 3. Fetch live insights via INSTAGRAM_GET_IG_MEDIA_INSIGHTS
      if (recentEnoughForInsights && numericMediaId && /^\d+$/.test(numericMediaId)) {
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
  // so leaving a stale `views` on a YouTube-only row would double-count it. A
  // cross-posted row keeps both: `views` is its Instagram figure, earned
  // separately, and zeroing it here would delete real data.
  if (youtubeSynced && isYouTubePrimary) metrics.views = 0;

  // Calculate engagement rate, save rate & content score against the channel the
  // post actually belongs to.
  const effectiveViews = isYouTubePrimary ? metrics.youtube_views : metrics.views;
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
 * Resolve every YouTube post's video ID up front so their statistics can be
 * pulled 50 at a time, rather than one Composio call per post inside the loop.
 */
async function prefetchYouTubeStats(items) {
  const byClient = new Map();
  for (const item of items) {
    const platform = (item.platform || '').toLowerCase();
    const isYt = platform.includes('youtube') || platform.includes('shorts') || hasYouTubeVideo(item);
    if (!isYt) continue;
    if (!byClient.has(item.client_id)) byClient.set(item.client_id, []);
    byClient.get(item.client_id).push(item);
  }

  for (const [clientId, clientItems] of byClient) {
    const videoIds = [];
    for (const item of clientItems) {
      const { videoId } = await resolveYouTubeVideoId(item);
      if (videoId) videoIds.push(videoId);
    }
    if (videoIds.length > 0) {
      await primeYouTubeStats(clientId, videoIds);
      console.log(`[METRIC-SYNC] Primed ${videoIds.length} YouTube video(s) for client #${clientId} in ${Math.ceil(videoIds.length / YT_BATCH_SIZE)} call(s).`);
    }
  }
}

/**
 * Refresh metrics for posted items — including those without links.
 * Fetches each client's IG feed / YouTube uploads once and auto-matches by
 * shortcode, title or date.
 *
 * @param {object} [options]
 * @param {number} [options.clientId] Restrict the run to a single client. The
 *   nightly cron omits it; the dashboard button passes the selected client so
 *   the request returns in seconds instead of walking every account.
 * @returns {Promise<object>} Summary for the caller to display.
 */
export async function runMetricSyncWorker({ clientId = null } = {}) {
  const summary = {
    total: 0, synced: 0, failed: 0, youtube: 0, instagram: 0,
    startedAt: new Date().toISOString(), finishedAt: null
  };

  try {
    // Clear caches at start of each run
    mediaListCache.clear();
    ytVideoListCache.clear();
    ytStatsCache.clear();
    ytStatsErrors.clear();

    // Sync ALL posted items, not just those with links
    const itemsToRefresh = db.prepare(`
      SELECT id, client_id, date, title, platform, link, youtube_link, youtube_video_id
      FROM marketing_content_tracker
      WHERE status = 'Posted' ${clientId ? 'AND client_id = ?' : ''}
    `).all(...(clientId ? [clientId] : []));

    summary.total = itemsToRefresh.length;
    if (itemsToRefresh.length === 0) {
      summary.finishedAt = new Date().toISOString();
      return summary;
    }

    const scope = clientId ? `client #${clientId}` : 'all clients';
    console.log(`[METRIC-SYNC] Syncing live metrics for ${itemsToRefresh.length} posted item(s), ${scope} (Composio Free Tier Safe)...`);
    if (process.env.COMPOSIO_API_KEY) {
      await prefetchYouTubeStats(itemsToRefresh);
    }

    for (const row of itemsToRefresh) {
      const platform = (row.platform || '').toLowerCase();
      const isYt = platform.includes('youtube') || platform.includes('shorts') || hasYouTubeVideo(row);
      try {
        await syncSingleContentMetrics(row.id);
        summary.synced++;
        if (isYt) summary.youtube++; else summary.instagram++;
        // Rate-limit only between posts that actually reach the API. Most posts
        // now read from the primed batch or sit outside the insights window, and
        // pausing on those just makes the dashboard button feel broken.
        if (isYt || isWithinInsightsWindow(row)) {
          await new Promise(res => setTimeout(res, 300));
        }
      } catch (err) {
        summary.failed++;
        console.warn(`[METRIC-SYNC] Skipped post #${row.id}:`, err.message);
      }
    }

    summary.finishedAt = new Date().toISOString();
    console.log(`[METRIC-SYNC] ✓ Live metrics sync complete — ${summary.synced} synced, ${summary.failed} failed.`);
    return summary;
  } catch (err) {
    console.error('[METRIC-SYNC] Error running metric sync worker:', err.message);
    summary.finishedAt = new Date().toISOString();
    summary.error = err.message;
    return summary;
  }
}

export default {
  syncSingleContentMetrics,
  runMetricSyncWorker
};
