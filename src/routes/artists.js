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
import { sendArtistGigConfirmation } from '../services/telegram.js';

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
      SUM(CASE WHEN status != 'Cancelled' THEN 1 ELSE 0 END) as total_gigs,
      SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_gigs,
      SUM(CASE WHEN status = 'Pending' OR status = 'Advance Paid' THEN 1 ELSE 0 END) as pending_gigs,
      ROUND(AVG(CASE WHEN status = 'Paid' THEN fee_inr END), 0) as average_fee_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN fee_inr ELSE 0 END), 0) as total_amount_paid_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' OR status = 'Cancelled' THEN 0 ELSE fee_inr - advance_paid END), 0) as total_amount_pending_inr,
      MAX(CASE WHEN status != 'Cancelled' THEN gig_date END) as latest_gig_date
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

  // Format last_perf_date like DD-MMM-YYYY
  let last_perf_date = 'No gigs yet';
  if (stats.latest_gig_date) {
    const d = new Date(stats.latest_gig_date + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    last_perf_date = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  db.prepare(`
    UPDATE artists SET 
      total_performances = ?, average_fee_inr = ?, total_amount_paid_inr = ?,
      total_amount_pending_inr = ?, payment_status = ?, reliability_score = ?, perf_with_m = ?,
      last_perf_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stats.total_gigs, stats.average_fee_inr || 0, stats.total_amount_paid_inr,
    stats.total_amount_pending_inr, payment_status, reliability_score, stats.paid_gigs || 0,
    last_perf_date, new Date().toISOString(), artistId
  );
}

// =========================================
// ARTISTS
// =========================================

/**
 * GET /api/artists
 */
router.get('/', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { category, city, is_active } = req.query;
    let query = 'SELECT * FROM artists WHERE 1=1';
    const params = [];

    if (category) { query += ' AND category = ?'; params.push(category); }
    if (city) { query += ' AND city = ?'; params.push(city); }
    if (is_active !== undefined) { query += ' AND is_active = ?'; params.push(parseInt(is_active)); }

    query += ' ORDER BY name ASC';
    const artists = db.prepare(query).all(...params);

    // Decrypt bank details for each artist if available
    const bankKey = process.env.ARTIST_BANK_KEY;
    const safe = artists.map(({ bank_details_enc, ...rest }) => {
      let bank_details = null;
      if (bank_details_enc && bankKey) {
        try {
          const decrypted = decrypt(bank_details_enc, bankKey);
          try {
            bank_details = JSON.parse(decrypted);
          } catch (e) {
            bank_details = decrypted;
          }
        } catch (e) {
          console.error('[ARTISTS] Decrypt error for artist', rest.id, e.message);
        }
      }
      return {
        ...rest,
        bank_details,
        has_bank_details: !!bank_details_enc,
      };
    });

    res.json({ artists: safe });
  } catch (err) {
    console.error('[ARTISTS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/artists
 */
router.post('/', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { name, category, city, phone, email, telegram_chat_id, bank_details,
            instruments, insta_link, description, rating, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Artist name is required' });

    const artist_id = generateArtistId(name, phone);
    const bankKey = process.env.ARTIST_BANK_KEY;

    const result = db.prepare(`
      INSERT INTO artists (artist_id, name, category, city, phone, email, telegram_chat_id, bank_details_enc,
                           instruments, insta_link, description, rating, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      artist_id, name, category || null, city || null, phone || null,
      email || null, telegram_chat_id || null,
      bank_details && bankKey ? encrypt(JSON.stringify(bank_details), bankKey) : null,
      instruments || null, insta_link || null, description || null,
      rating !== undefined && rating !== '' ? parseInt(rating) : null,
      notes || null
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
    res.status(201).json({ ...safe, bank_details: bank_details || null, has_bank_details: !!bank_details_enc });
  } catch (err) {
    console.error('[ARTISTS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/artists/:id
 */
router.patch('/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(req.params.id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });

    const allowedFields = ['name', 'category', 'city', 'phone', 'email', 'telegram_chat_id', 'is_active',
                           'instruments', 'insta_link', 'description', 'rating', 'notes'];
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
    res.json({ ...safe, bank_details: req.body.bank_details || null, has_bank_details: !!bank_details_enc });
  } catch (err) {
    console.error('[ARTISTS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/artists/:id/bank
 * Retrieve decrypted bank details.
 */
router.get('/:id/bank', authorize(), (req, res) => {
  try {
    const artist = db.prepare('SELECT bank_details_enc, name FROM artists WHERE id = ?').get(req.params.id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    if (!artist.bank_details_enc) return res.json({ bank_details: null });

    const bankKey = process.env.ARTIST_BANK_KEY;
    if (!bankKey) return res.status(500).json({ error: 'Bank encryption key not configured' });

    const decrypted = decrypt(artist.bank_details_enc, bankKey);
    let bank_details;
    try {
      bank_details = JSON.parse(decrypted);
    } catch (e) {
      bank_details = decrypted;
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'view_bank_details',
      entityType: 'artist',
      entityId: parseInt(req.params.id),
      diff: { artist_name: artist.name },
      ip: req.ip,
    });

    res.json({ bank_details });
  } catch (err) {
    console.error('[ARTISTS] Bank details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// VENUES
// =========================================

router.get('/venues', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const venues = db.prepare(`
      SELECT v.*, c.name as client_name
      FROM venues v
      LEFT JOIN crm_clients c ON v.client_id = c.id
      ORDER BY v.name ASC
    `).all();
    res.json({ venues });
  } catch (err) {
    console.error('[VENUES] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/venues', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { name, address, city, map_link, poc_name, poc_phone, poc_email, social_links, gig_confirmed_message, client_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Venue name is required' });

    const result = db.prepare(`
      INSERT INTO venues (name, address, city, map_link, poc_name, poc_phone, poc_email, social_links, gig_confirmed_message, client_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      address || null,
      city || null,
      map_link || null,
      poc_name || null,
      poc_phone || null,
      poc_email || null,
      social_links || null,
      gig_confirmed_message || null,
      client_id || null
    );

    const newVenue = db.prepare(`
      SELECT v.*, c.name as client_name
      FROM venues v
      LEFT JOIN crm_clients c ON v.client_id = c.id
      WHERE v.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newVenue);
  } catch (err) {
    console.error('[VENUES] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/venues/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });

    const allowedFields = ['name', 'address', 'city', 'map_link', 'poc_name', 'poc_phone', 'poc_email', 'social_links', 'gig_confirmed_message', 'client_id'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE venues SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    const updated = db.prepare(`
      SELECT v.*, c.name as client_name
      FROM venues v
      LEFT JOIN crm_clients c ON v.client_id = c.id
      WHERE v.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('[VENUES] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================
// GIGS
// =========================================

/**
 * GET /api/artists/gigs — list all gigs with joined artist/venue names
 */
router.get('/gigs', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const gigs = db.prepare(`
      SELECT g.*, a.name as artist_name, a.artist_id as artist_code,
             v.name as venue_name
      FROM gig_status g
      LEFT JOIN artists a ON g.artist_id = a.id
      LEFT JOIN venues v ON g.venue_id = v.id
      ORDER BY g.gig_date DESC
    `).all();
    res.json({ gigs });
  } catch (err) {
    console.error('[GIGS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/artists/gigs — create a new gig and recalculate rollups
 */
router.post('/gigs', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { artist_id, venue_id, gig_date, fee_inr, advance_paid, status, swiggy_link, zomato_link } = req.body;
    if (!artist_id || !gig_date) return res.status(400).json({ error: 'artist_id and gig_date are required' });

    const result = db.prepare(`
      INSERT INTO gig_status (artist_id, venue_id, gig_date, fee_inr, advance_paid, status, swiggy_link, zomato_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      artist_id,
      venue_id || null,
      gig_date,
      fee_inr || 0,
      advance_paid || 0,
      status || 'Pending',
      swiggy_link || null,
      zomato_link || null
    );

    // Recalculate artist rollups
    recalculateRollups(artist_id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'gig',
      entityId: result.lastInsertRowid,
      diff: { artist_id, gig_date, fee_inr },
      ip: req.ip,
    });

    const newGig = db.prepare(`
      SELECT g.*, a.name as artist_name, a.artist_id as artist_code,
             v.name as venue_name
      FROM gig_status g
      LEFT JOIN artists a ON g.artist_id = a.id
      LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newGig);
  } catch (err) {
    console.error('[GIGS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/gigs/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const gig = db.prepare('SELECT * FROM gig_status WHERE id = ?').get(req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const allowedFields = ['status', 'fee_inr', 'advance_paid', 'gig_date', 'venue_id', 'artist_id', 'swiggy_link', 'zomato_link'];
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

    // Recalculate artist rollups for both old and potentially new artist
    recalculateRollups(gig.artist_id);
    if (updates.artist_id && updates.artist_id !== gig.artist_id) {
      recalculateRollups(updates.artist_id);
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'gig',
      entityId: parseInt(req.params.id),
      diff: updates,
      ip: req.ip,
    });

    const updated = db.prepare(`
      SELECT g.*, a.name as artist_name, a.artist_id as artist_code,
             v.name as venue_name
      FROM gig_status g
      LEFT JOIN artists a ON g.artist_id = a.id
      LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/artists/gigs/:id — delete a gig and recalculate rollups
 */
router.delete('/gigs/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const gig = db.prepare('SELECT * FROM gig_status WHERE id = ?').get(req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    db.prepare('DELETE FROM gig_status WHERE id = ?').run(req.params.id);

    // Recalculate artist rollups for the artist
    recalculateRollups(gig.artist_id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'delete',
      entityType: 'gig',
      entityId: parseInt(req.params.id),
      diff: gig,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Event/Gig deleted successfully.' });
  } catch (err) {
    console.error('[GIGS] Delete error:', err);
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
