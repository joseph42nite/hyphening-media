/**
 * Marketing Ops Center — Artist Curation Routes
 * Roster management, gig scheduling, venue CRUD, and planning cycles.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { encrypt, decrypt } from '../services/encryption.js';
import { sendCycleApprovalCard, sendArtistGigConfirmation } from '../services/telegram.js';

const router = Router();

router.use(authenticate);

/**
 * Generate artist_id from name and phone: UPPER(LEFT(name,3)) + RIGHT(phone,4)
 */
function generateArtistId(name, phone) {
  const prefix = name.substring(0, 3).toUpperCase();
  const suffix = phone ? phone.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${suffix}`;
}

/**
 * Recalculate roster rollups for an artist.
 */
function recalculateRollups(artistId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_gigs,
      SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_gigs,
      SUM(CASE WHEN status = 'Pending' OR status = 'Advance Paid' THEN 1 ELSE 0 END) as pending_gigs,
      ROUND(AVG(CASE WHEN status = 'Paid' THEN fee_inr END), 0) as average_fee_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN fee_inr ELSE 0 END), 0) as total_amount_paid_inr
    FROM gig_status 
    WHERE artist_id = ?
  `).get(artistId);

  let reliability_score = null;
  if (stats.total_gigs > 0) {
    reliability_score = Math.round((stats.paid_gigs / stats.total_gigs) * 100);
  }

  let payment_status = 'No Records';
  if (stats.total_gigs > 0) {
    payment_status = stats.pending_gigs > 0 ? '⚠ Pending' : '✅ All Paid';
  }

  db.prepare(`
    UPDATE artists SET 
      total_performances = ?, average_fee_inr = ?, total_amount_paid_inr = ?,
      payment_status = ?, reliability_score = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stats.total_gigs, stats.average_fee_inr || 0, stats.total_amount_paid_inr,
    payment_status, reliability_score, new Date().toISOString(), artistId
  );
}

// =========================================
// ARTISTS
// =========================================

/**
 * GET /api/artists
 */
router.get('/', authorize('admin'), (req, res) => {
  try {
    const { category, city, is_active } = req.query;
    let query = 'SELECT * FROM artists WHERE 1=1';
    const params = [];

    if (category) { query += ' AND category = ?'; params.push(category); }
    if (city) { query += ' AND city = ?'; params.push(city); }
    if (is_active !== undefined) { query += ' AND is_active = ?'; params.push(parseInt(is_active)); }

    query += ' ORDER BY name ASC';
    const artists = db.prepare(query).all(...params);

    // Strip encrypted bank details
    const safe = artists.map(({ bank_details_enc, ...rest }) => ({
      ...rest,
      has_bank_details: !!bank_details_enc,
    }));

    res.json({ artists: safe });
  } catch (err) {
    console.error('[ARTISTS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/artists
 */
router.post('/', authorize('admin'), (req, res) => {
  try {
    const { name, category, city, phone, email, telegram_chat_id, bank_details } = req.body;
    if (!name) return res.status(400).json({ error: 'Artist name is required' });

    const artist_id = generateArtistId(name, phone);
    const bankKey = process.env.ARTIST_BANK_KEY;

    const result = db.prepare(`
      INSERT INTO artists (artist_id, name, category, city, phone, email, telegram_chat_id, bank_details_enc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      artist_id, name, category || null, city || null, phone || null,
      email || null, telegram_chat_id || null,
      bank_details && bankKey ? encrypt(JSON.stringify(bank_details), bankKey) : null
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'artist',
      entityId: result.lastInsertRowid,
      diff: { name, artist_id },
      ip: req.ip,
    });

    const newArtist = db.prepare('SELECT * FROM artists WHERE id = ?').get(result.lastInsertRowid);
    const { bank_details_enc, ...safe } = newArtist;
    res.status(201).json({ ...safe, has_bank_details: !!bank_details_enc });
  } catch (err) {
    console.error('[ARTISTS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/artists/:id
 */
router.patch('/:id', authorize('admin'), (req, res) => {
  try {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(req.params.id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });

    const allowedFields = ['name', 'category', 'city', 'phone', 'email', 'telegram_chat_id', 'is_active'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Handle bank details encryption
    if (req.body.bank_details !== undefined) {
      const bankKey = process.env.ARTIST_BANK_KEY;
      updates.bank_details_enc = req.body.bank_details && bankKey
        ? encrypt(JSON.stringify(req.body.bank_details), bankKey) : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE artists SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'artist',
      entityId: parseInt(req.params.id),
      ip: req.ip,
    });

    const updated = db.prepare('SELECT * FROM artists WHERE id = ?').get(req.params.id);
    const { bank_details_enc, ...safe } = updated;
    res.json({ ...safe, has_bank_details: !!bank_details_enc });
  } catch (err) {
    console.error('[ARTISTS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/artists/:id/bank
 * Retrieve decrypted bank details — super_admin only.
 */
router.get('/:id/bank', authorize(), (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can access bank details' });
  }

  try {
    const artist = db.prepare('SELECT bank_details_enc, name FROM artists WHERE id = ?').get(req.params.id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    if (!artist.bank_details_enc) return res.json({ bank_details: null });

    const bankKey = process.env.ARTIST_BANK_KEY;
    if (!bankKey) return res.status(500).json({ error: 'Bank encryption key not configured' });

    const decrypted = decrypt(artist.bank_details_enc, bankKey);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'view_bank_details',
      entityType: 'artist',
      entityId: parseInt(req.params.id),
      diff: { artist_name: artist.name },
      ip: req.ip,
    });

    res.json({ bank_details: JSON.parse(decrypted) });
  } catch (err) {
    console.error('[ARTISTS] Bank details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// VENUES
// =========================================

router.get('/venues', authorize('admin'), (req, res) => {
  try {
    res.json({ venues: db.prepare('SELECT * FROM venues ORDER BY name ASC').all() });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/venues', authorize('admin'), (req, res) => {
  try {
    const { name, address, city, map_link, poc_name, poc_phone, gig_confirmed_message } = req.body;
    if (!name) return res.status(400).json({ error: 'Venue name is required' });

    const result = db.prepare(`
      INSERT INTO venues (name, address, city, map_link, poc_name, poc_phone, gig_confirmed_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, address || null, city || null, map_link || null, poc_name || null, poc_phone || null, gig_confirmed_message || null);

    res.status(201).json(db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// GIGS
// =========================================

router.patch('/gigs/:id', authorize('admin'), (req, res) => {
  try {
    const gig = db.prepare('SELECT * FROM gig_status WHERE id = ?').get(req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const allowedFields = ['status', 'fee_inr', 'advance_paid', 'gig_date', 'venue_id'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE gig_status SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    // Recalculate artist rollups
    recalculateRollups(gig.artist_id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'gig',
      entityId: parseInt(req.params.id),
      diff: updates,
      ip: req.ip,
    });

    res.json(db.prepare('SELECT * FROM gig_status WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// PLANNING CYCLES
// =========================================

router.get('/planning-cycles', authorize('admin'), (req, res) => {
  try {
    res.json({
      cycles: db.prepare('SELECT * FROM artist_planning_cycles ORDER BY start_date DESC').all(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/planning-cycles', authorize('admin'), (req, res) => {
  try {
    const { cycle_label, start_date, end_date } = req.body;
    if (!cycle_label || !start_date || !end_date) {
      return res.status(400).json({ error: 'cycle_label, start_date, and end_date are required' });
    }

    const result = db.prepare(`
      INSERT INTO artist_planning_cycles (cycle_label, start_date, end_date)
      VALUES (?, ?, ?)
    `).run(cycle_label, start_date, end_date);

    res.status(201).json(db.prepare('SELECT * FROM artist_planning_cycles WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/planning-cycles/:id/submit-approval
 * Submit cycle for admin approval via Telegram.
 */
router.post('/planning-cycles/:id/submit-approval', authorize('admin'), (req, res) => {
  try {
    const cycle = db.prepare('SELECT * FROM artist_planning_cycles WHERE id = ?').get(req.params.id);
    if (!cycle) return res.status(404).json({ error: 'Planning cycle not found' });

    if (cycle.status !== 'open') {
      return res.status(400).json({ error: 'Only open cycles can be submitted for approval' });
    }

    db.prepare('UPDATE artist_planning_cycles SET status = ?, updated_at = ? WHERE id = ?')
      .run('finalised', new Date().toISOString(), req.params.id);

    // Send Telegram approval card
    const gigs = db.prepare('SELECT * FROM gig_status WHERE planning_cycle_id = ?').all(cycle.id);
    sendCycleApprovalCard(cycle, gigs);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'submit_approval',
      entityType: 'planning_cycle',
      entityId: parseInt(req.params.id),
      ip: req.ip,
    });

    res.json({ message: 'Planning cycle submitted for approval' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/public/gigs/confirm/:token
 * Public endpoint — artist confirms a gig via email token (green light).
 */
export function publicGigConfirmRoute(req, res) {
  try {
    const { token } = req.params;

    const gig = db.prepare(
      'SELECT * FROM gig_status WHERE confirmation_token = ? AND token_expires_at > datetime("now")'
    ).get(token);

    if (!gig) {
      return res.status(404).json({ error: 'Invalid or expired confirmation link' });
    }

    db.prepare(`
      UPDATE gig_status SET status = 'Confirmed', confirmation_token = NULL, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), gig.id);

    // Recalculate rollups
    recalculateRollups(gig.artist_id);

    // Send Telegram DM to artist with confirmed details
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(gig.artist_id);
    const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(gig.venue_id);
    if (artist && venue && artist.telegram_chat_id) {
      sendArtistGigConfirmation(
        artist.telegram_chat_id,
        artist.name,
        gig.gig_date,
        venue.name,
        venue.address,
        venue.map_link,
        venue.gig_confirmed_message
      );
    }

    logAction({
      actorId: null,
      action: 'gig_confirmed',
      entityType: 'gig',
      entityId: gig.id,
      diff: { artist_id: gig.artist_id },
    });

    res.json({ message: '✅ Gig confirmed! You will receive details via Telegram shortly.' });
  } catch (err) {
    console.error('[GIG] Confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default router;
