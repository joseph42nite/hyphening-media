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
    publishedAt: snippet.publishedAt || null,
    ownReply: ownYouTubeReply(thread)
  };
}

/** The channel's own latest reply in a thread, if it answered: { text, at }. */
function ownYouTubeReply(thread) {
  const channelId = thread?.snippet?.channelId;
  if (!channelId) return null;
  const own = (thread?.replies?.comments || [])
    .map(r => r?.snippet || {})
    .filter(r => r.authorChannelId?.value === channelId)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  return own ? { text: own.textOriginal || own.textDisplay || '', at: own.publishedAt || null } : null;
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
    publishedAt: comment?.timestamp || null,
    // Instagram lists replies alongside comments: a reply names its comment
    // in parent_id, and the account's own carry self_ig_scoped_id.
    parentId: comment?.parent_id || null,
    fromSelf: !!comment?.from?.self_ig_scoped_id
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
 * post's whole comment list (no further page) — only a whole list can say a
 * comment is gone; a first page of a busy post can't — and which comments the
 * account has already answered, wherever the reply was sent from.
 */
export async function fetchPostCommentsWithStatus(clientId, post) {
  const collected = [];
  const complete = new Set();
  const answered = new Map(); // comment id -> the account's own reply { text, at }

  const videoId = resolveYouTubeVideoId(post);
  if (videoId) {
    const res = await executeClientAction(clientId, 'YOUTUBE_LIST_COMMENT_THREADS', {
      videoId,
      part: 'snippet,replies',
      maxResults: 100
    });
    for (const thread of (res?.data?.items || [])) {
      const { ownReply, ...c } = normalizeYouTubeThread(thread);
      if (!c.id) continue;
      collected.push({ ...c, platform: 'youtube' });
      if (ownReply) answered.set(String(c.id), ownReply);
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
      const { parentId, fromSelf, ...c } = normalizeInstagramComment(comment);
      if (!c.id) continue;
      if (parentId) {
        // A reply isn't an inbox item; the account's own marks its comment answered.
        const prev = answered.get(String(parentId));
        if (fromSelf && (!prev || String(c.publishedAt) > String(prev.at))) {
          answered.set(String(parentId), { text: c.text, at: c.publishedAt });
        }
        continue;
      }
      collected.push({ ...c, platform: 'instagram' });
    }
    if (Array.isArray(raw) && !res?.data?.paging?.next) complete.add('instagram');
  }

  return { comments: collected, complete, answered };
}

// Instagram's "+0000" offsets aren't something SQLite's datetime() reads.
function sqliteTime(at) {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().replace('T', ' ').slice(0, 19) : null;
}

/**
 * Fetch one post's comments into social_comments, and drop the ones the
 * platform no longer returns (deleted or hidden there) — only for a platform
 * that returned the whole list. Used by the nightly sync and the portal button.
 *
 * @returns {{ added: number, removed: number }}
 */
export async function syncPostComments(clientId, post, { fetchFn = fetchPostCommentsWithStatus } = {}) {
  const { comments, complete, answered = new Map() } = await fetchFn(clientId, post);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO social_comments (
      content_id, client_id, platform, comment_id, commenter_name, comment_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const markAnswered = db.prepare(`
    UPDATE social_comments
    SET replied_at = COALESCE(replied_at, ?, CURRENT_TIMESTAMP), reply_text = COALESCE(reply_text, ?)
    WHERE comment_id = ? AND client_id = ?
  `);
  let added = 0, removed = 0;
  db.transaction(() => {
    for (const c of comments) {
      // Tagged with the platform the comment came from, not the row's primary
      // platform — a cross-posted row collects both.
      added += insert.run(post.id, clientId, c.platform, c.id, c.author, c.text,
        c.publishedAt || new Date().toISOString()).changes;
    }
    // Answered in the app or before the inbox recorded replies: out of the inbox.
    for (const [commentId, reply] of answered) {
      markAnswered.run(sqliteTime(reply.at), reply.text, commentId, clientId);
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
