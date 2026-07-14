/**
 * Link Extractor Service
 * Utility functions to extract platform-specific post/video/media IDs from URL inputs.
 */

export function extractPlatformId(link, platform) {
  if (!link) return {};
  const plat = (platform || '').toLowerCase();

  try {
    if (plat.includes('youtube')) {
      const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|watch\?v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = link.match(ytRegex);
      if (match && match[1]) {
        return { youtube_video_id: match[1] };
      }
    } else if (plat.includes('facebook')) {
      const fbRegex = /(?:(?:posts|videos|reel|watch|story)\/|permalink\.php\?story_fbid=|story_fbid=|fbid=|[?&]v=)([0-9]{8,20})/i;
      const match = link.match(fbRegex);
      if (match && match[1]) {
        return { facebook_post_id: match[1] };
      }
    } else if (plat.includes('instagram')) {
      const igRegex = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9-_]+)/i;
      const match = link.match(igRegex);
      if (match && match[1]) {
        const shortcode = match[1];
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let id = 0n;
        let valid = true;
        for (let i = 0; i < shortcode.length; i++) {
          const idx = alphabet.indexOf(shortcode[i]);
          if (idx === -1) {
            valid = false;
            break;
          }
          id = id * 64n + BigInt(idx);
        }
        if (valid) {
          return { instagram_media_id: id.toString() };
        }
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
