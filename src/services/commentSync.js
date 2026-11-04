/**
 * Social Comment Ingestion
 *
 * Fetching and replying to comments was written twice — once for the nightly
 * cron and once for the client portal's on-demand button — with the action
 * names, the parameter names and the response parsing copied between them. Both
 * copies named YouTube actions that do not exist, so this lives in one place
 * now.
 */

import db from '../../database.js';
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
  return (await fetchPostCommentsWithStatus(clientId, post)).comments;
}

/**
 * fetchPostComments plus, per platform, whether the platform returned the
 * post's whole comment list (no further page). Only a whole list can say a
 * comment is gone; a first page of a busy post can't.
 */
export async function fetchPostCommentsWithStatus(clientId, post) {
  const collected = [];
  const complete = new Set();

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
    if (Array.isArray(res?.data?.items) && !res.data.nextPageToken) complete.add('youtube');
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
    if (Array.isArray(raw) && !res?.data?.paging?.next) complete.add('instagram');
  }

  return { comments: collected, complete };
}

/**
 * Fetch one post's comments into social_comments, and drop the ones the
 * platform no longer returns (deleted or hidden there) — only for a platform
 * that returned the whole list. Used by the nightly sync and the portal button.
 *
 * @returns {{ added: number, removed: number }}
 */
export async function syncPostComments(clientId, post, { fetchFn = fetchPostCommentsWithStatus } = {}) {
  const { comments, complete } = await fetchFn(clientId, post);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO social_comments (
      content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let added = 0, removed = 0;
  db.transaction(() => {
    for (const c of comments) {
      // Tagged with the platform the comment came from, not the row's primary
      // platform — a cross-posted row collects both.
      added += insert.run(post.id, clientId, c.platform, c.id, c.author, c.text,
        c.publishedAt || new Date().toISOString()).changes;
    }
    for (const platform of complete) {
      const seen = comments.filter(c => c.platform === platform).map(c => String(c.id));
      const stored = db.prepare('SELECT id, comment_id FROM social_comments WHERE content_id = ? AND platform = ?')
        .all(post.id, platform);
      for (const row of stored) {
        if (!seen.includes(String(row.comment_id))) {
          removed += db.prepare('DELETE FROM social_comments WHERE id = ?').run(row.id).changes;
        }
      }
    }
  })();
  return { added, removed };
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

export default { fetchPostComments, fetchPostCommentsWithStatus, syncPostComments, replyToComment, resolveYouTubeVideoId, resolveInstagramMediaId };
