/**
 * Marketing Ops Center — Blog Routes
 * Public blog listing/reading + authenticated admin CRUD.
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../../database.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

/**
 * Auth middleware for admin-only blog management endpoints.
 */
function requireAdmin(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = db.prepare('SELECT id, role, name FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Generate a URL-friendly slug from a title.
 */
function generateSlug(title) {
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
function ensureUniqueSlug(slug, excludeId = null) {
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

/**
 * Estimate read time from content (words / 200 wpm).
 */
function estimateReadTime(content) {
  if (!content) return 1;
  const words = content.replace(/[#*_\[\]()>-]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ============================================================
// PUBLIC ENDPOINTS
// ============================================================

/**
 * GET /api/blog
 * Public. Returns published blog posts, newest first.
 * Query params: ?category=, ?tag=, ?page=1, ?limit=12
 */
router.get('/', (req, res) => {
  try {
    const { category, tag, page = 1, limit = 12 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = `FROM blog_posts WHERE status = 'published'`;
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (tag) {
      query += ' AND tags LIKE ?';
      params.push(`%${tag}%`);
    }

    // Get total count
    const total = db.prepare(`SELECT COUNT(*) as count ${query}`).get(...params).count;

    // Get posts (without full content for listing)
    const posts = db.prepare(`
      SELECT id, title, slug, excerpt, cover_image_url, author, category, tags,
             meta_title, meta_description, status, published_at, created_at, updated_at
      ${query}
      ORDER BY published_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    // Add read_time estimate
    const postsWithMeta = posts.map(p => ({
      ...p,
      read_time: estimateReadTime(p.excerpt || ''),
    }));

    // Get unique categories for filter tabs
    const categories = db.prepare(
      "SELECT DISTINCT category FROM blog_posts WHERE status = 'published' AND category IS NOT NULL ORDER BY category"
    ).all().map(r => r.category);

    res.json({
      posts: postsWithMeta,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum),
      categories,
    });
  } catch (err) {
    console.error('[BLOG] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/blog/sitemap
 * Public. Returns all published post slugs and dates for sitemap generation.
 */
router.get('/sitemap', (req, res) => {
  try {
    const posts = db.prepare(
      "SELECT slug, published_at, updated_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC"
    ).all();
    res.json({ posts });
  } catch (err) {
    console.error('[BLOG] Sitemap error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/blog/admin/all
 * Auth-protected. Returns all posts including drafts.
 */
router.get('/admin/all', requireAdmin, (req, res) => {
  try {
    const posts = db.prepare(
      'SELECT id, title, slug, excerpt, cover_image_url, author, category, tags, meta_title, meta_description, meta_keywords, internal_links, status, published_at, created_at, updated_at FROM blog_posts ORDER BY created_at DESC'
    ).all();
    res.json({ posts });
  } catch (err) {
    console.error('[BLOG] Admin list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/blog/:slug
 * Public. Returns a single published post by slug + related posts.
 */
router.get('/:slug', (req, res) => {
  try {
    const post = db.prepare(
      "SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'"
    ).get(req.params.slug);

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Add read time
    post.read_time = estimateReadTime(post.content);

    // Get related posts (same category, excluding current)
    const related = db.prepare(
      "SELECT id, title, slug, excerpt, cover_image_url, category, published_at FROM blog_posts WHERE status = 'published' AND category = ? AND id != ? ORDER BY published_at DESC LIMIT 3"
    ).all(post.category, post.id);

    // Parse internal_links
    let internalLinks = [];
    try {
      internalLinks = JSON.parse(post.internal_links || '[]');
    } catch (e) {
      internalLinks = [];
    }

    // Fetch linked posts
    let linkedPosts = [];
    if (internalLinks.length > 0) {
      const placeholders = internalLinks.map(() => '?').join(',');
      linkedPosts = db.prepare(
        `SELECT id, title, slug, excerpt, cover_image_url, category FROM blog_posts WHERE slug IN (${placeholders}) AND status = 'published'`
      ).all(...internalLinks);
    }

    res.json({ post, related, linked_posts: linkedPosts });
  } catch (err) {
    console.error('[BLOG] Article error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * POST /api/blog
 * Create a new blog post.
 */
router.post('/', requireAdmin, (req, res) => {
  try {
    const { title, excerpt, content, cover_image_url, author, category, tags,
            meta_title, meta_description, meta_keywords, internal_links, status } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const slug = ensureUniqueSlug(generateSlug(title));
    const postStatus = status || 'draft';
    const publishedAt = postStatus === 'published' ? new Date().toISOString() : null;

    const result = db.prepare(`
      INSERT INTO blog_posts (title, slug, excerpt, content, cover_image_url, author, category, tags,
        meta_title, meta_description, meta_keywords, internal_links, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, slug, excerpt || null, content, cover_image_url || null,
      author || 'Hyphening Media', category || 'General', tags || null,
      meta_title || null, meta_description || null, meta_keywords || null,
      JSON.stringify(internal_links || []), postStatus, publishedAt
    );

    logAction({ action: 'create', entityType: 'blog_post', entityId: result.lastInsertRowid, userId: req.user.id, diff: { title, slug, status: postStatus } });

    const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ post });
  } catch (err) {
    console.error('[BLOG] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/blog/:id
 * Update a blog post.
 */
router.patch('/:id', requireAdmin, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const allowedFields = ['title', 'excerpt', 'content', 'cover_image_url', 'author', 'category', 'tags',
                           'meta_title', 'meta_description', 'meta_keywords', 'internal_links', 'status'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'internal_links' ? JSON.stringify(req.body[field]) : req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Regenerate slug if title changes
    if (updates.title && updates.title !== post.title) {
      updates.slug = ensureUniqueSlug(generateSlug(updates.title), post.id);
    }

    // Set published_at if transitioning to published
    if (updates.status === 'published' && post.status !== 'published') {
      updates.published_at = new Date().toISOString();
    }

    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE blog_posts SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), post.id);

    logAction({ action: 'update', entityType: 'blog_post', entityId: post.id, userId: req.user.id, diff: updates });

    const updated = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(post.id);
    res.json({ post: updated });
  } catch (err) {
    console.error('[BLOG] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/blog/:id
 * Delete a blog post.
 */
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(post.id);
    logAction({ action: 'delete', entityType: 'blog_post', entityId: post.id, userId: req.user.id, diff: { title: post.title, slug: post.slug } });

    res.json({ success: true, message: `Post "${post.title}" deleted.` });
  } catch (err) {
    console.error('[BLOG] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
