/**
 * Link Extractor Service
 * Utility functions to extract platform-specific post/video/media IDs from URL inputs.
 */

/**
 * A `link` field often holds more than one URL — cross-posted content is logged
 * as "<youtube url> , <instagram url>" in the single column. Split before
 * matching so a pattern cannot run from one URL into the next.
 */
function urlCandidates(link) {
  return String(link).split(/[\s,]+/).filter(Boolean);
}

/**
 * Enumerate the real YouTube URL shapes rather than using a catch-all path
 * segment. The previous `[^\/]+\/.+\/` alternative was greedy enough to skip
 * over the video ID it was aiming at and return the Instagram shortcode from a
 * later URL in the same string — youtube.com/shorts/o-YJ-kHj968 alongside an
 * instagram.com/reel/DXwAwOiolWn link yielded "DXwAwOiolWn".
 */
const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:shorts\/|live\/|embed\/|v\/|watch\?(?:[^\s]*&)?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i;

export function extractYouTubeId(link) {
  if (!link) return null;
  for (const candidate of urlCandidates(link)) {
    const match = candidate.match(YOUTUBE_ID_RE);
    if (match && match[1]) return match[1];
  }
  return null;
}

export function extractPlatformId(link, platform) {
  if (!link) return {};
  const plat = (platform || '').toLowerCase();

  try {
    if (plat.includes('youtube')) {
      const videoId = extractYouTubeId(link);
      if (videoId) {
        return { youtube_video_id: videoId };
      }
    } else if (plat.includes('facebook')) {
      const fbRegex = /(?:(?:posts|videos|reel|watch|story)\/|permalink\.php\?story_fbid=|story_fbid=|fbid=|[?&]v=)([0-9]{8,20})/i;
      const match = link.match(fbRegex);
      if (match && match[1]) {
        return { facebook_post_id: match[1] };
      }
    } else if (plat.includes('instagram')) {
      const igRegex = /instagram\.com\/(?:p|reels?|tv)\/([A-Za-z0-9-_]+)/i;
      const match = link.match(igRegex);
      if (match && match[1]) {
        // Do NOT compute a fake numeric ID from shortcode math.
        // The real Graph API media ID must come from INSTAGRAM_GET_IG_USER_MEDIA.
        // Return empty — the metricSyncWorker will resolve the real ID.
        return {};
      }
    } else if (plat.includes('linkedin')) {
      const lnRegex = /activity[-:]([0-9]+)/i;
      const match = link.match(lnRegex);
      if (match && match[1]) {
        return { linkedin_post_id: match[1] };
      }
    }
  } catch (err) {
    console.error('[AUTO-EXTRACT] Error parsing link:', err.message);
  }
  return {};
}

export function extractAllPlatformIds(data) {
  const ids = {
    facebook_post_id: data.facebook_post_id || null,
    instagram_media_id: data.instagram_media_id || null,
    youtube_video_id: data.youtube_video_id || null,
    linkedin_post_id: data.linkedin_post_id || null,
  };

  if (data.link) {
    const ext = extractPlatformId(data.link, data.platform);
    if (ext.facebook_post_id) ids.facebook_post_id = ext.facebook_post_id;
    if (ext.instagram_media_id) ids.instagram_media_id = ext.instagram_media_id;
    if (ext.youtube_video_id) ids.youtube_video_id = ext.youtube_video_id;
    if (ext.linkedin_post_id) ids.linkedin_post_id = ext.linkedin_post_id;
  }
  if (data.instagram_link) {
    const ext = extractPlatformId(data.instagram_link, 'instagram');
    if (ext.instagram_media_id) ids.instagram_media_id = ext.instagram_media_id;
  }
  if (data.youtube_link) {
    const ext = extractPlatformId(data.youtube_link, 'youtube');
    if (ext.youtube_video_id) ids.youtube_video_id = ext.youtube_video_id;
  }
  if (data.facebook_link) {
    const ext = extractPlatformId(data.facebook_link, 'facebook');
    if (ext.facebook_post_id) ids.facebook_post_id = ext.facebook_post_id;
  }
  if (data.linkedin_link) {
    const ext = extractPlatformId(data.linkedin_link, 'linkedin');
    if (ext.linkedin_post_id) ids.linkedin_post_id = ext.linkedin_post_id;
  }

  return ids;
}
