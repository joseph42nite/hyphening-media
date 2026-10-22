/**
 * Marketing Ops Center — Leads Routes
 * Full CRUD for agency sales leads with follow-up tracking, industry management, and 12 PM reminders.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

// Ensure lead_industries table exists and is seeded
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_industries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const count = db.prepare('SELECT COUNT(*) as c FROM lead_industries').get()?.c || 0;
  if (count === 0) {
    const insertDefault = db.prepare('INSERT OR IGNORE INTO lead_industries (name) VALUES (?)');
    ['FnB', 'Healthcare', 'Interior Designers'].forEach(name => insertDefault.run(name));
  }
} catch (err) {
  console.error('[LEADS] Failed to initialize lead_industries table:', err.message);
}

/**
 * Helper: sync any distinct industries from leads table into lead_industries
 * and return all active industry names.
 */
function getAllIndustries() {
  const dbLeadIndustries = db.prepare(
    'SELECT DISTINCT TRIM(industry) as industry FROM leads WHERE industry IS NOT NULL AND LENGTH(TRIM(industry)) > 0'
  ).all().map(r => r.industry);

  if (dbLeadIndustries.length > 0) {
    const existingLower = new Set(
      db.prepare('SELECT LOWER(name) as lname FROM lead_industries').all().map(r => r.lname)
    );
    const insertStmt = db.prepare('INSERT OR IGNORE INTO lead_industries (name) VALUES (?)');
    for (const ind of dbLeadIndustries) {
      if (ind && !existingLower.has(ind.toLowerCase())) {
        insertStmt.run(ind);
        existingLower.add(ind.toLowerCase());
      }
    }
  }

  return db.prepare('SELECT name FROM lead_industries ORDER BY id ASC').all().map(r => r.name);
}

/**
 * Helper: ensure an industry name is stored in lead_industries (case-insensitive).
 * Returns the canonical stored industry name.
 */
function ensureIndustrySaved(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const existing = db.prepare(
    'SELECT name FROM lead_industries WHERE LOWER(name) = LOWER(?)'
  ).get(trimmed);

  if (existing) {
    return existing.name;
  }

  db.prepare('INSERT OR IGNORE INTO lead_industries (name) VALUES (?)').run(trimmed);
  return trimmed;
}

router.use(authenticate);

/**
 * GET /api/leads
 * List leads with optional search and filters.
 */
router.get('/', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const { status, q, due, industry } = req.query;

    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (industry && industry !== 'all') {
      query += ' AND LOWER(TRIM(industry)) = LOWER(TRIM(?))';
      params.push(industry);
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      query += ` AND (
        client_name LIKE ? OR 
        company_name LIKE ? OR 
        location LIKE ? OR 
        phone LIKE ? OR 
        email LIKE ? OR 
        notes LIKE ? OR
        industry LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    if (due === 'today') {
      const today = new Date().toLocaleDateString('en-CA');
      query += ' AND follow_up_date = ?';
      params.push(today);
    } else if (due === 'overdue') {
      const today = new Date().toLocaleDateString('en-CA');
      query += ' AND follow_up_date < ? AND status NOT IN ("Converted", "Lost")';
      params.push(today);
    }

    query += ' ORDER BY CASE WHEN follow_up_date IS NULL THEN 1 ELSE 0 END, follow_up_date ASC, created_at DESC';

    const leads = db.prepare(query).all(...params);
    const allIndustries = getAllIndustries();

    res.json({ leads, industries: allIndustries });
  } catch (err) {
    console.error('[LEADS] List error:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

/**
 * GET /api/leads/industries
 * Return all saved industries.
 */
router.get('/industries', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    res.json({ industries: getAllIndustries() });
  } catch (err) {
    console.error('[LEADS] Get industries error:', err);
    res.status(500).json({ error: 'Failed to fetch industries' });
  }
});

/**
 * POST /api/leads/industries
 * Create/save a new industry name.
 */
router.post('/industries', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const trimmed = (req.body?.name || req.body?.industry || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Industry name is required' });
    }

    const existing = db.prepare(
      'SELECT id, name FROM lead_industries WHERE LOWER(name) = LOWER(?)'
    ).get(trimmed);

    if (existing) {
      return res.json({
        industry: existing.name,
        industries: getAllIndustries(),
        alreadyExists: true
      });
    }

    const info = db.prepare('INSERT INTO lead_industries (name) VALUES (?)').run(trimmed);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_lead_industry',
      entityType: 'lead_industry',
      entityId: info.lastInsertRowid,
      diff: { name: trimmed },
      ip: req.ip,
    });

    res.status(201).json({
      industry: trimmed,
      industries: getAllIndustries()
    });
  } catch (err) {
    console.error('[LEADS] Create industry error:', err);
    res.status(500).json({ error: 'Failed to add industry' });
  }
});

/**
 * PATCH /api/leads/industries
 * Rename/edit a previously saved industry name and update all matching leads.
 */
router.patch('/industries', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const oldTrimmed = (req.body?.old_name || '').trim();
    const newTrimmed = (req.body?.new_name || '').trim();

    if (!oldTrimmed || !newTrimmed) {
      return res.status(400).json({ error: 'Both current and new industry names are required' });
    }

    const renameTransaction = db.transaction(() => {
      const existingOld = db.prepare(
        'SELECT id, name FROM lead_industries WHERE LOWER(name) = LOWER(?)'
      ).get(oldTrimmed);

      const existingNew = db.prepare(
        'SELECT id, name FROM lead_industries WHERE LOWER(name) = LOWER(?)'
      ).get(newTrimmed);

      if (existingOld && existingNew && existingOld.id !== existingNew.id) {
        // Merging into an already-existing industry name
        db.prepare('DELETE FROM lead_industries WHERE id = ?').run(existingOld.id);
        db.prepare("UPDATE lead_industries SET name = ?, updated_at = datetime('now') WHERE id = ?")
          .run(newTrimmed, existingNew.id);
      } else if (existingOld) {
        db.prepare("UPDATE lead_industries SET name = ?, updated_at = datetime('now') WHERE id = ?")
          .run(newTrimmed, existingOld.id);
      } else if (!existingNew) {
        db.prepare('INSERT INTO lead_industries (name) VALUES (?)').run(newTrimmed);
      }

      // Update all leads that had the old industry name
      const updateLeads = db.prepare(
        "UPDATE leads SET industry = ?, updated_at = datetime('now') WHERE LOWER(TRIM(industry)) = LOWER(?)"
      ).run(newTrimmed, oldTrimmed);

      return updateLeads.changes;
    });

    const updatedLeadsCount = renameTransaction();

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_lead_industry',
      entityType: 'lead_industry',
      entityId: null,
      diff: { old_name: oldTrimmed, new_name: newTrimmed, updated_leads: updatedLeadsCount },
      ip: req.ip,
    });

    res.json({
      old_name: oldTrimmed,
      new_name: newTrimmed,
      updated_leads: updatedLeadsCount,
      industries: getAllIndustries()
    });
  } catch (err) {
    console.error('[LEADS] Rename industry error:', err);
    res.status(500).json({ error: 'Failed to update industry name' });
  }
});

/**
 * DELETE /api/leads/industries
 * Delete a saved industry name and clear it from leads if present.
 */
router.delete('/industries', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const targetName = (req.body?.name || req.query?.name || '').trim();
    if (!targetName) {
      return res.status(400).json({ error: 'Industry name is required' });
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM lead_industries WHERE LOWER(name) = LOWER(?)').run(targetName);
      db.prepare(
        "UPDATE leads SET industry = NULL, updated_at = datetime('now') WHERE LOWER(TRIM(industry)) = LOWER(?)"
      ).run(targetName);
    });

    deleteTx();

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'delete_lead_industry',
      entityType: 'lead_industry',
      entityId: null,
      diff: { name: targetName },
      ip: req.ip,
    });

    res.json({
      deleted: targetName,
      industries: getAllIndustries()
    });
  } catch (err) {
    console.error('[LEADS] Delete industry error:', err);
    res.status(500).json({ error: 'Failed to delete industry' });
  }
});

/**
 * GET /api/leads/reminders
 * Returns count and list of active leads with follow-up due on or before today.
 */
router.get('/reminders', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const query = `
      SELECT * FROM leads 
      WHERE follow_up_date IS NOT NULL 
        AND follow_up_date <= ? 
        AND status NOT IN ('Converted', 'Lost')
      ORDER BY follow_up_date ASC
    `;
    const pendingLeads = db.prepare(query).all(today);
    res.json({
      count: pendingLeads.length,
      today,
      leads: pendingLeads
    });
  } catch (err) {
    console.error('[LEADS] Reminders error:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

/**
 * POST /api/leads
 * Create a new lead.
 */
router.post('/', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const {
      client_name,
      company_name,
      location,
      phone,
      email,
      website,
      notes,
      follow_up_date,
      status = 'New',
      industry,
      segment
    } = req.body;

    const cleanClientName = (client_name || '').trim() || (company_name || '').trim();
    const cleanCompanyName = (company_name || '').trim() || null;

    if (!cleanClientName) {
      return res.status(400).json({ error: 'Client name or Company name is required' });
    }

    const rawIndustry = (industry !== undefined ? industry : segment)?.trim() || null;
    const finalIndustry = rawIndustry ? ensureIndustrySaved(rawIndustry) : null;

    const validUser = req.user?.id
      ? db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id)
      : null;
    const createdBy = validUser ? validUser.id : null;

    const info = db.prepare(`
      INSERT INTO leads (
        client_name, company_name, location, phone, email, website, notes, follow_up_date, status, industry, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      cleanClientName,
      cleanCompanyName,
      location?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      website?.trim() || null,
      notes?.trim() || null,
      follow_up_date?.trim() || null,
      status || 'New',
      finalIndustry,
      createdBy
    );

    const newLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_lead',
      entityType: 'lead',
      entityId: info.lastInsertRowid,
      diff: { client_name: cleanClientName, company_name: cleanCompanyName, follow_up_date, industry: finalIndustry },
      ip: req.ip,
    });

    res.status(201).json({ lead: newLead, industries: getAllIndustries() });
  } catch (err) {
    console.error('[LEADS] Create error:', err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

/**
 * PATCH /api/leads/:id
 * Update an existing lead.
 */
router.patch('/:id', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const {
      client_name,
      company_name,
      location,
      phone,
      email,
      website,
      notes,
      follow_up_date,
      status,
      industry,
      segment
    } = req.body;

    const leadIndustry = industry !== undefined ? industry : segment;
    const resolvedIndustry = leadIndustry !== undefined
      ? (leadIndustry?.trim() ? ensureIndustrySaved(leadIndustry.trim()) : null)
      : existing.industry;

    const nextCompany = company_name !== undefined ? (company_name?.trim() || null) : existing.company_name;
    const nextClient = client_name !== undefined
      ? (client_name.trim() || nextCompany || '')
      : existing.client_name;

    const updated = {
      client_name: nextClient,
      company_name: nextCompany,
      location: location !== undefined ? (location?.trim() || null) : existing.location,
      phone: phone !== undefined ? (phone?.trim() || null) : existing.phone,
      email: email !== undefined ? (email?.trim() || null) : existing.email,
      website: website !== undefined ? (website?.trim() || null) : existing.website,
      notes: notes !== undefined ? (notes?.trim() || null) : existing.notes,
      follow_up_date: follow_up_date !== undefined ? (follow_up_date?.trim() || null) : existing.follow_up_date,
      status: status !== undefined ? status : existing.status,
      industry: resolvedIndustry,
    };

    if (!updated.client_name) {
      return res.status(400).json({ error: 'Client name or Company name cannot be empty' });
    }

    db.prepare(`
      UPDATE leads SET
        client_name = ?,
        company_name = ?,
        location = ?,
        phone = ?,
        email = ?,
        website = ?,
        notes = ?,
        follow_up_date = ?,
        status = ?,
        industry = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      updated.client_name,
      updated.company_name,
      updated.location,
      updated.phone,
      updated.email,
      updated.website,
      updated.notes,
      updated.follow_up_date,
      updated.status,
      updated.industry,
      id
    );

    const result = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_lead',
      entityType: 'lead',
      entityId: parseInt(id),
      diff: { before: existing, after: result },
      ip: req.ip,
    });

    res.json({ lead: result, industries: getAllIndustries() });
  } catch (err) {
    console.error('[LEADS] Update error:', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

/**
 * DELETE /api/leads/:id
 * Delete a lead.
 */
router.delete('/:id', authorize('admin', 'ops_social_media_manager', 'ops_video_editor'), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    db.prepare('DELETE FROM leads WHERE id = ?').run(id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'delete_lead',
      entityType: 'lead',
      entityId: parseInt(id),
      diff: { client_name: existing.client_name, company_name: existing.company_name },
      ip: req.ip,
    });

    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    console.error('[LEADS] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

export default router;
