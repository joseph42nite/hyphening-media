/**
 * Marketing Ops Center — Leads Routes
 * Full CRUD for agency sales leads with follow-up tracking and 12 PM reminders.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();

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
      query += ' AND industry = ?';
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

    const dbIndustries = db.prepare(
      'SELECT DISTINCT industry FROM leads WHERE industry IS NOT NULL AND TRIM(industry) != "" ORDER BY industry ASC'
    ).all().map(r => r.industry);

    // Default segments/industries including Interior Designers
    const defaultIndustries = ['FnB', 'Healthcare', 'Interior Designers'];
    const allIndustries = Array.from(new Set([...defaultIndustries, ...dbIndustries]));

    res.json({ leads, industries: allIndustries });
  } catch (err) {
    console.error('[LEADS] List error:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
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

    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const finalIndustry = (industry !== undefined ? industry : segment)?.trim() || null;

    const info = db.prepare(`
      INSERT INTO leads (
        client_name, company_name, location, phone, email, website, notes, follow_up_date, status, industry, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      client_name.trim(),
      company_name?.trim() || null,
      location?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      website?.trim() || null,
      notes?.trim() || null,
      follow_up_date?.trim() || null,
      status || 'New',
      finalIndustry,
      req.user.id
    );

    const newLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_lead',
      entityType: 'lead',
      entityId: info.lastInsertRowid,
      diff: { client_name, company_name, follow_up_date, industry: finalIndustry },
      ip: req.ip,
    });

    res.status(201).json({ lead: newLead });
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

    const updated = {
      client_name: client_name !== undefined ? client_name.trim() : existing.client_name,
      company_name: company_name !== undefined ? (company_name?.trim() || null) : existing.company_name,
      location: location !== undefined ? (location?.trim() || null) : existing.location,
      phone: phone !== undefined ? (phone?.trim() || null) : existing.phone,
      email: email !== undefined ? (email?.trim() || null) : existing.email,
      website: website !== undefined ? (website?.trim() || null) : existing.website,
      notes: notes !== undefined ? (notes?.trim() || null) : existing.notes,
      follow_up_date: follow_up_date !== undefined ? (follow_up_date?.trim() || null) : existing.follow_up_date,
      status: status !== undefined ? status : existing.status,
      industry: leadIndustry !== undefined ? (leadIndustry?.trim() || null) : existing.industry,
    };

    if (!updated.client_name) {
      return res.status(400).json({ error: 'Client name cannot be empty' });
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

    res.json({ lead: result });
  } catch (err) {
    console.error('[LEADS] Update error:', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

/**
 * DELETE /api/leads/:id
 * Delete a lead.
 */
router.delete('/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
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
