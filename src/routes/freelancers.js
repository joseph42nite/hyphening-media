/**
 * Marketing Ops Center — Freelancer Routes
 * CRUD for freelancers with RBAC and audit logging.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/freelancers
 */
router.get('/', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const { is_active, specialization } = req.query;
    let query = `
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id AND status = 'Posted') AS posted_videos
      FROM freelancers f
      WHERE 1=1
    `;
    const params = [];

    if (is_active !== undefined) {
      query += ' AND f.is_active = ?';
      params.push(parseInt(is_active));
    }
    if (specialization) {
      query += ' AND f.specialization = ?';
      params.push(specialization);
    }

    query += ' ORDER BY f.name ASC';
    res.json({ freelancers: db.prepare(query).all(...params) });
  } catch (err) {
    console.error('[FREELANCERS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/freelancers/:id
 */
router.get('/:id', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const freelancer = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id AND status = 'Posted') AS posted_videos
      FROM freelancers f
      WHERE f.id = ?
    `).get(req.params.id);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });
    res.json(freelancer);
  } catch (err) {
    console.error('[FREELANCERS] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/freelancers
 */
router.post('/', authorize('admin'), (req, res) => {
  try {
    const { name, email, phone, company_name, specialization, rate_per_video, videos_paid } = req.body;

    if (!name) return res.status(400).json({ error: 'Freelancer name is required' });

    const result = db.prepare(`
      INSERT INTO freelancers (name, email, phone, company_name, specialization, rate_per_video, videos_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, email || null, phone || null, company_name || null, specialization || null, rate_per_video || null, videos_paid !== undefined ? parseInt(videos_paid) : 0);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'freelancer',
      entityId: result.lastInsertRowid,
      diff: { name, specialization },
      ip: req.ip,
    });

    const newFreelancer = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id AND status = 'Posted') AS posted_videos
      FROM freelancers f
      WHERE f.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(newFreelancer);
  } catch (err) {
    console.error('[FREELANCERS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/freelancers/:id
 */
router.patch('/:id', authorize('admin'), (req, res) => {
  try {
    const freelancer = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(req.params.id);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });

    const allowedFields = ['name', 'email', 'phone', 'company_name', 'specialization', 'rate_per_video', 'is_active', 'videos_paid'];
    const updates = {};
    const diff = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        diff[field] = { from: freelancer[field], to: req.body[field] };
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE freelancers SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'freelancer',
      entityId: parseInt(req.params.id),
      diff,
      ip: req.ip,
    });

    res.json(db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id AND status = 'Posted') AS posted_videos
      FROM freelancers f
      WHERE f.id = ?
    `).get(req.params.id));
  } catch (err) {
    console.error('[FREELANCERS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/freelancers/:id (soft delete)
 */
router.delete('/:id', authorize('admin'), (req, res) => {
  try {
    const freelancer = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(req.params.id);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });

    db.prepare('UPDATE freelancers SET is_active = 0, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(), req.params.id
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'soft_delete',
      entityType: 'freelancer',
      entityId: parseInt(req.params.id),
      diff: { name: freelancer.name },
      ip: req.ip,
    });

    res.json({ message: 'Freelancer deactivated' });
  } catch (err) {
    console.error('[FREELANCERS] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
