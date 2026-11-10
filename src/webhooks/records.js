/**
 * Blog post handlers for the signed webhook (create_blog_post,
 * update_blog_post). Dispatched from src/routes/webhooks.js after the
 * signature check.
 */

import db from '../../database.js';
import { logAction } from '../services/auditLogger.js';

// ============================================================
// BLOG POST HANDLERS
// ============================================================

/**
 * Generate a URL-friendly slug from a title.
 */
export function generateBlogSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/**
 * Ensure slug uniqueness by appending a counter if needed.
 */
export function ensureUniqueBlogSlug(slug, excludeId = null) {
  let candidate = slug;
  let counter = 1;
  while (true) {
    const existing = excludeId
      ? db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(candidate);
    if (!existing) return candidate;
    candidate = `${slug}-${counter++}`;
  }
}

export function handleCreateBlogPost(payload) {
  if (!payload?.title || !payload?.content) {
    return { success: false, summary: 'title and content are required' };
  }

  const slug = ensureUniqueBlogSlug(generateBlogSlug(payload.title));
  const status = payload.status || 'published';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO blog_posts (
      title, slug, excerpt, content, cover_image_url, audio_url, author, category, tags,
      meta_title, meta_description, meta_keywords, internal_links, status, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.title,
    slug,
    payload.excerpt || null,
    payload.content,
    payload.cover_image_url || null,
    payload.audio_url || null,
    payload.author || 'Hyphening Media',
    payload.category || 'General',
    payload.tags || null,
    payload.meta_title || null,
    payload.meta_description || null,
    payload.meta_keywords || null,
    JSON.stringify(payload.internal_links || []),
    status,
    publishedAt
  );

  logAction({
    action: 'create',
    entityType: 'blog_post',
    entityId: result.lastInsertRowid,
    diff: { title: payload.title, slug, status, source: 'webhook' }
  });

  return {
    success: true,
    summary: `Blog post #${result.lastInsertRowid} "${payload.title}" created (${status}). Slug: /blog/${slug}`
  };
}

export function handleUpdateBlogPost(payload) {
  // Find post by blog_id or slug
  let post = null;
  if (payload.blog_id) {
    post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(payload.blog_id);
  } else if (payload.slug) {
    post = db.prepare('SELECT * FROM blog_posts WHERE slug = ?').get(payload.slug);
  }

  if (!post) return { success: false, summary: 'Blog post not found. Provide blog_id or slug.' };

  const allowedFields = [
    'title', 'excerpt', 'content', 'cover_image_url', 'audio_url', 'author', 'category', 'tags',
    'meta_title', 'meta_description', 'meta_keywords', 'internal_links', 'status'
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = field === 'internal_links' ? JSON.stringify(payload[field]) : payload[field];
    }
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };

  // Regenerate slug if title changes
  if (updates.title && updates.title !== post.title) {
    updates.slug = ensureUniqueBlogSlug(generateBlogSlug(updates.title), post.id);
  }

  // Set published_at if transitioning to published
  if (updates.status === 'published' && post.status !== 'published') {
    updates.published_at = new Date().toISOString();
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE blog_posts SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), post.id);

  logAction({
    action: 'update',
    entityType: 'blog_post',
    entityId: post.id,
    diff: { ...updates, source: 'webhook' }
  });

  return {
    success: true,
    summary: `Blog post #${post.id} "${updates.title || post.title}" updated. Fields: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}`
  };
}
