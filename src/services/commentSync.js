/**
 * Social Comment Ingestion
 *
 * Fetching and replying to comments was written twice — once for the nightly
 * cron and once for the client portal's on-demand button — with the action
 * names, the parameter names and the response parsing copied between them. Both
 * copies named YouTube actions that do not exist, so this lives in one place
 * now.
 */

import { executeClientAction } from './composioService.js';
import { extractYouTubeId } from './linkExtractor.js';

/**
 * YouTube returns comment *threads*: a wrapper carrying the top-level comment
 * plus its replies. The reply action attaches to the top-level comment's id,
 * not the thread's, so that is what gets stored — replying to a thread id
 * fails.
 */
function normalizeYouTubeThread(thread) {
  const topLevel = thread?.snippet?.topLevelComment;
  const snippet = topLevel?.snippet || {};
  return {
    id: topLevel?.id || thread?.id || null,
    author: snippet.authorDisplayName || 'YouTube User',
    // textDisplay carries YouTube's HTML entities (&#39;); textOriginal is raw.
    text: snippet.textOriginal || snippet.textDisplay || '',
    publishedAt: snippet.publishedAt || null
  };
}

function normalizeInstagramComment(comment) {
  return {
    id: comment?.id || comment?.comment_id || null,
    author: comment?.username
      || comment?.from?.username || comment?.from?.name
      || comment?.user?.username || comment?.user?.name
      || comment?.owner?.username
      || 'Instagram User',
    text: comment?.text || '',
    publishedAt: comment?.timestamp || null
  };
}

/**
 * The video this row points at, whatever its `platform` column says — Shorts are
 * routinely logged as platform=instagram with the YouTube URL in `link`.
 */
export function resolveYouTubeVideoId(post) {
  return post?.youtube_video_id
    || extractYouTubeId(post?.youtube_link)
    || extractYouTubeId(post?.link)
    || null;
}

export function resolveInstagramMediaId(post) {
  const platform = (post?.platform || '').toLowerCase();
  const isInstagram = platform.includes('instagram') || platform.includes('meta');
  if (!isInstagram) return null;
  // The Graph API wants the numeric media id; a shortcode will not work here.
  const id = post?.instagram_media_id || post?.platform_post_id || null;
  return id && /^\d+$/.test(String(id)) ? String(id) : null;
}

/**
 * Fetch comments for every platform this row actually has an id for. A
 * cross-posted row earns comments on both channels, so both are collected and
 * tagged with the platform they came from.
 *
 * @returns {Promise<Array<{platform: string, id: string, author: string, text: string, publishedAt: string|null}>>}
 */
export async function fetchPostComments(clientId, post) {
  const collected = [];

  const videoId = resolveYouTubeVideoId(post);
  if (videoId) {
    const res = await executeClientAction(clientId, 'YOUTUBE_LIST_COMMENT_THREADS', {
      videoId,
      part: 'snippet,replies',
      maxResults: 100
    });
    for (const thread of (res?.data?.items || [])) {
      const c = normalizeYouTubeThread(thread);
      if (c.id) collected.push({ ...c, platform: 'youtube' });
    }
  }

  const mediaId = resolveInstagramMediaId(post);
  if (mediaId) {
    const res = await executeClientAction(clientId, 'INSTAGRAM_GET_IG_MEDIA_COMMENTS', {
      ig_media_id: mediaId
    });
    const raw = res?.data?.data || res?.data || [];
    for (const comment of (Array.isArray(raw) ? raw : [])) {
      const c = normalizeInstagramComment(comment);
      if (c.id) collected.push({ ...c, platform: 'instagram' });
    }
  }

  return collected;
}

/**
 * Post a reply to a comment. `commentId` must be the top-level comment id that
 * fetchPostComments stored, not a thread id.
 */
export async function replyToComment(clientId, platform, commentId, replyText) {
  const isYouTube = (platform || '').toLowerCase().includes('youtube');

  return isYouTube
    ? executeClientAction(clientId, 'YOUTUBE_CREATE_COMMENT_REPLY', {
        parentId: commentId,
        textOriginal: replyText
      })
    : executeClientAction(clientId, 'INSTAGRAM_REPLY_TO_COMMENT', {
        ig_comment_id: commentId,
        message: replyText
      });
}

export default { fetchPostComments, replyToComment, resolveYouTubeVideoId, resolveInstagramMediaId };
