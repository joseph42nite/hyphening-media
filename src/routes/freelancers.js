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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /api/freelancers
 */
router.get('/', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const { is_active, specialization, month } = req.query;

    if (month !== undefined && !MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    }

    // Scoped to a month, both sides of the balance come from that month: videos
    // posted within it, and payments recorded against it. Unscoped, the lifetime
    // counter on the freelancer row stands as before.
    let query = month ? `
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker
          WHERE freelancer_id = f.id AND status = 'Posted' AND substr(date, 1, 7) = ?) AS posted_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker
          WHERE freelancer_id = f.id AND substr(date, 1, 7) = ?) AS assigned_videos_in_month,
        COALESCE((SELECT videos_paid FROM freelancer_monthly_payments
          WHERE freelancer_id = f.id AND month = ?), 0) AS videos_paid,
        f.videos_paid AS lifetime_videos_paid
      FROM freelancers f
      WHERE 1=1
    ` : `
      SELECT f.*,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id) AS total_videos,
        (SELECT COUNT(*) FROM marketing_content_tracker WHERE freelancer_id = f.id AND status = 'Posted') AS posted_videos
      FROM freelancers f
      WHERE 1=1
    `;
    const params = month ? [month, month, month] : [];

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
 * GET /api/freelancers/payment-months
 * Months that actually have freelancer-assigned content, for the month picker.
 * Declared before /:id so "payment-months" is not read as an id.
 */
router.get('/payment-months', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT substr(date, 1, 7) AS month, COUNT(*) AS posted_videos
      FROM marketing_content_tracker
      WHERE freelancer_id IS NOT NULL AND date IS NOT NULL AND status = 'Posted'
      GROUP BY month
      ORDER BY month DESC
    `).all();
    res.json({ months: rows });
  } catch (err) {
    console.error('[FREELANCERS] Payment months error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/freelancers/:id/payments/:month
 * Record how many videos have been paid for in a given month.
 */
router.put('/:id/payments/:month', authorize('admin'), (req, res) => {
  try {
    const { id, month } = req.params;
    if (!MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    }

    const freelancer = db.prepare('SELECT id, name FROM freelancers WHERE id = ?').get(id);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });

    const videosPaid = parseInt(req.body?.videos_paid, 10);
    if (!Number.isInteger(videosPaid) || videosPaid < 0) {
      return res.status(400).json({ error: 'videos_paid must be a non-negative integer' });
    }

    const previous = db.prepare(
      'SELECT videos_paid FROM freelancer_monthly_payments WHERE freelancer_id = ? AND month = ?'
    ).get(id, month);

    db.prepare(`
      INSERT INTO freelancer_monthly_payments (freelancer_id, month, videos_paid, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (freelancer_id, month)
      DO UPDATE SET videos_paid = excluded.videos_paid, updated_at = excluded.updated_at
    `).run(id, month, videosPaid);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'freelancer_monthly_payment',
      entityId: parseInt(id, 10),
      diff: { month, videos_paid: { from: previous?.videos_paid ?? 0, to: videosPaid } },
      ip: req.ip,
    });

    res.json({ success: true, freelancer_id: parseInt(id, 10), month, videos_paid: videosPaid });
  } catch (err) {
    console.error('[FREELANCERS] Monthly payment error:', err);
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
