/**
 * Marketing Ops Center — Client Routes
 * CRUD for CRM clients with RBAC, audit logging, and CSV export.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { encrypt, decrypt } from '../services/encryption.js';

const router = Router();

// Apply auth to all client routes
router.use(authenticate);

/**
 * GET /api/clients
 * List all clients. Admins and super_admins only.
 */
router.get('/', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const { client_type, is_active } = req.query;
    let query = 'SELECT * FROM crm_clients WHERE 1=1';
    const params = [];

    if (client_type) {
      query += ' AND client_type = ?';
      params.push(client_type);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(parseInt(is_active));
    }

    query += ' ORDER BY created_at DESC';
    const clients = db.prepare(query).all(...params);

    // Strip encrypted fields from response
    const sanitized = clients.map(c => {
      const { instagram_access_token_enc, youtube_api_key_enc, portal_pin, ...safe } = c;
      return {
        ...safe,
        has_instagram_token: !!instagram_access_token_enc,
        has_youtube_key: !!youtube_api_key_enc,
        has_portal_pin: !!portal_pin,
      };
    });

    res.json({ clients: sanitized });
  } catch (err) {
    console.error('[CLIENTS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id
 * Get single client details.
 */
router.get('/:id', authorize('admin', 'ops_social_media_manager'), (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { instagram_access_token_enc, youtube_api_key_enc, portal_pin, ...safe } = client;
    res.json({
      ...safe,
      has_instagram_token: !!instagram_access_token_enc,
      has_youtube_key: !!youtube_api_key_enc,
      has_portal_pin: !!portal_pin,
    });
  } catch (err) {
    console.error('[CLIENTS] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients
 * Create a new client.
 */
router.post('/', authorize('admin'), (req, res) => {
  try {
    const {
      name, client_type, contact_person, contact_email, contact_phone,
      calendar_sync_link, drive_folder_link,
      instagram_access_token, instagram_business_account_id,
      youtube_channel_id, youtube_api_key,
      google_ads_customer_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const apiKey = process.env.API_CREDENTIALS_KEY;

    const result = db.prepare(`
      INSERT INTO crm_clients (
        name, client_type, contact_person, contact_email, contact_phone,
        calendar_sync_link, drive_folder_link,
        instagram_access_token_enc, instagram_business_account_id,
        youtube_channel_id, youtube_api_key_enc,
        google_ads_customer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      client_type || 'marketing',
      contact_person || null,
      contact_email || null,
      contact_phone || null,
      calendar_sync_link || null,
      drive_folder_link || null,
      instagram_access_token && apiKey ? encrypt(instagram_access_token, apiKey) : null,
      instagram_business_account_id || null,
      youtube_channel_id || null,
      youtube_api_key && apiKey ? encrypt(youtube_api_key, apiKey) : null,
      google_ads_customer_id || null
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'client',
      entityId: result.lastInsertRowid,
      diff: { name, client_type },
      ip: req.ip,
    });

    const newClient = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(result.lastInsertRowid);
    const { instagram_access_token_enc, youtube_api_key_enc, portal_pin, ...safe } = newClient;

    res.status(201).json(safe);
  } catch (err) {
    console.error('[CLIENTS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id
 * Update client fields.
 */
router.patch('/:id', authorize('admin'), (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const allowedFields = [
      'name', 'client_type', 'contact_person', 'contact_email', 'contact_phone',
      'calendar_sync_link', 'drive_folder_link',
      'instagram_business_account_id', 'youtube_channel_id', 'google_ads_customer_id',
      'is_active', 'portal_enabled'
    ];

    const updates = {};
    const diff = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        diff[field] = { from: client[field], to: req.body[field] };
      }
    }

    // Handle encrypted fields separately
    const apiKey = process.env.API_CREDENTIALS_KEY;
    if (req.body.instagram_access_token !== undefined && apiKey) {
      updates.instagram_access_token_enc = req.body.instagram_access_token
        ? encrypt(req.body.instagram_access_token, apiKey)
        : null;
      diff.instagram_access_token = { from: '***', to: req.body.instagram_access_token ? '***' : null };
    }
    if (req.body.youtube_api_key !== undefined && apiKey) {
      updates.youtube_api_key_enc = req.body.youtube_api_key
        ? encrypt(req.body.youtube_api_key, apiKey)
        : null;
      diff.youtube_api_key = { from: '***', to: req.body.youtube_api_key ? '***' : null };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id];

    db.prepare(`UPDATE crm_clients SET ${setClauses} WHERE id = ?`).run(...values);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'client',
      entityId: parseInt(req.params.id),
      diff,
      ip: req.ip,
    });

    const updated = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(req.params.id);
    const { instagram_access_token_enc, youtube_api_key_enc, portal_pin, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    console.error('[CLIENTS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/chats
 * Retrieve chat messages for a specific client.
 */
router.get('/:id/chats', (req, res) => {
  try {
    const chats = db.prepare(
      'SELECT * FROM internal_chat_messages WHERE client_id = ? ORDER BY created_at ASC'
    ).all(req.params.id);
    res.json({ chats });
  } catch (err) {
    console.error('[CLIENTS] Get chats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/chats
 * Send a chat message for a specific client.
 */
router.post('/:id/chats', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = db.prepare(
      'INSERT INTO internal_chat_messages (client_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, req.user.id, req.user.name, message);

    const newMessage = db.prepare('SELECT * FROM internal_chat_messages WHERE id = ?').get(result.lastInsertRowid);

    // Broadcast message via SSE
    import('../../server.js').then(({ broadcastEvent }) => {
      broadcastEvent('chat_message', { client_id: parseInt(req.params.id), message: newMessage });
    }).catch(err => console.error('SSE broadcast failed:', err));

    res.status(201).json({ message: newMessage });
  } catch (err) {
    console.error('[CLIENTS] Send chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
