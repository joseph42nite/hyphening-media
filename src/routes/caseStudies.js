/**
 * Marketing Ops Center — Case Study Routes
 * Public case study listing/reading + authenticated admin CRUD.
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database.js';
import { logAction } from '../services/auditLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'case-studies');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'image/webp') {
      return cb(new Error('Only .webp images are accepted'));
    }
    cb(null, true);
  },
});

const router = Router();

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

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function ensureUniqueSlug(slug, excludeId = null) {
  let candidate = slug;
  let counter = 1;
  while (true) {
    const existing = excludeId
      ? db.prepare('SELECT id FROM case_studies WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM case_studies WHERE slug = ?').get(candidate);
    if (!existing) return candidate;
    candidate = `${slug}-${counter++}`;
  }
}

// ============================================================
// PUBLIC ENDPOINTS
// ============================================================

/**
 * GET /api/case-studies
 * Public. Returns published case studies, newest first.
 */
router.get('/', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT id, title, slug, client_name, summary, cover_image_url, written_by, published_at, created_at, updated_at
      FROM case_studies WHERE status = 'published'
      ORDER BY published_at DESC, created_at DESC
    `).all();
    res.json({ case_studies: posts });
  } catch (err) {
    console.error('[CASE STUDIES] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/case-studies/admin/all
 * Auth-protected. Returns all case studies including drafts.
 */
router.get('/admin/all', requireAdmin, (req, res) => {
  try {
    const posts = db.prepare('SELECT * FROM case_studies ORDER BY created_at DESC').all();
    res.json({ case_studies: posts });
  } catch (err) {
    console.error('[CASE STUDIES] Admin list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/case-studies/:slug
 * Public. Returns a single published case study by slug.
 */
router.get('/:slug', (req, res) => {
  try {
    const post = db.prepare(
      "SELECT * FROM case_studies WHERE slug = ? AND status = 'published'"
    ).get(req.params.slug);

    if (!post) return res.status(404).json({ error: 'Case study not found' });

    res.json({ case_study: post });
  } catch (err) {
    console.error('[CASE STUDIES] Detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * POST /api/case-studies/upload-image
 * Auth-protected. Accepts a single .webp file, stores it under
 * public/uploads/case-studies, and returns its public URL for use as
 * cover_image_url. Content-hashed filename so re-uploading the same
 * image is idempotent and caching stays safe (see server.js /uploads route).
 */
router.post('/upload-image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message || 'Upload failed' });
    handleImageUpload(req, res);
  });
});

function handleImageUpload(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const buf = req.file.buffer;
    // RIFF....WEBP — verify the actual bytes, not just the client-sent
    // mimetype, which is trivially spoofable.
    const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    if (!isWebp) return res.status(400).json({ error: 'File is not a valid .webp image' });

    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 20);
    const filename = `${hash}.webp`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);

    logAction({ action: 'upload', entityType: 'case_study_image', entityId: filename, userId: req.user.id, diff: { filename, size: buf.length } });

    res.json({ url: `/uploads/case-studies/${filename}` });
  } catch (err) {
    console.error('[CASE STUDIES] Image upload error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

/**
 * POST /api/case-studies
 */
router.post('/', requireAdmin, (req, res) => {
  try {
    const { title, client_name, summary, content, cover_image_url, gallery_image_urls, video_embed_urls, status, written_by } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const slug = ensureUniqueSlug(generateSlug(title));
    const postStatus = status || 'draft';
    const publishedAt = postStatus === 'published' ? new Date().toISOString() : null;

    const result = db.prepare(`
      INSERT INTO case_studies (title, slug, client_name, summary, content, cover_image_url, gallery_image_urls, video_embed_urls, status, published_at, written_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, slug, client_name || null, summary || null, content, cover_image_url || null,
      JSON.stringify(gallery_image_urls || []), JSON.stringify(video_embed_urls || []),
      postStatus, publishedAt, written_by || null
    );

    logAction({ action: 'create', entityType: 'case_study', entityId: result.lastInsertRowid, userId: req.user.id, diff: { title, slug, status: postStatus } });

    const post = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ case_study: post });
  } catch (err) {
    console.error('[CASE STUDIES] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/case-studies/:id
 */
router.patch('/:id', requireAdmin, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Case study not found' });

    const allowedFields = ['title', 'client_name', 'summary', 'content', 'cover_image_url', 'gallery_image_urls', 'video_embed_urls', 'status', 'written_by'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = (field === 'gallery_image_urls' || field === 'video_embed_urls')
          ? JSON.stringify(req.body[field])
          : req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    if (updates.title && updates.title !== post.title) {
      updates.slug = ensureUniqueSlug(generateSlug(updates.title), post.id);
    }

    if (updates.status === 'published' && post.status !== 'published') {
      updates.published_at = new Date().toISOString();
    }

    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE case_studies SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), post.id);

    logAction({ action: 'update', entityType: 'case_study', entityId: post.id, userId: req.user.id, diff: updates });

    const updated = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(post.id);
    res.json({ case_study: updated });
  } catch (err) {
    console.error('[CASE STUDIES] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/case-studies/:id
 */
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Case study not found' });

    db.prepare('DELETE FROM case_studies WHERE id = ?').run(post.id);
    logAction({ action: 'delete', entityType: 'case_study', entityId: post.id, userId: req.user.id, diff: { title: post.title, slug: post.slug } });

    res.json({ success: true, message: `Case study "${post.title}" deleted.` });
  } catch (err) {
    console.error('[CASE STUDIES] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
