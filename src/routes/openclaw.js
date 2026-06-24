/**
 * Marketing Ops Center — OpenClaw Integration Routes
 * Webhook with HMAC-SHA256 verification and replay attack prevention.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../../database.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { logAction } from '../services/auditLogger.js';
import { notifyAdmin } from '../services/telegram.js';

const router = Router();

router.use(webhookLimiter);

const HMAC_SECRET = process.env.OPENCLAW_HMAC_SECRET || '';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify HMAC-SHA256 signature.
 */
function verifySignature(body, signature) {
  if (!HMAC_SECRET) return false;
  const expected = crypto.createHmac('sha256', HMAC_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Check for replay attacks via timestamp + nonce.
 */
function checkReplay(timestamp, nonce) {
  const now = Date.now();
  const eventTime = new Date(timestamp).getTime();

  // Reject if timestamp is outside the replay window
  if (Math.abs(now - eventTime) > REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'Timestamp outside acceptable window' };
  }

  // Check nonce uniqueness
  const existing = db.prepare('SELECT nonce FROM openclaw_nonces WHERE nonce = ?').get(nonce);
  if (existing) {
    return { valid: false, reason: 'Duplicate nonce — possible replay attack' };
  }

  // Store nonce
  db.prepare('INSERT INTO openclaw_nonces (nonce) VALUES (?)').run(nonce);

  // Clean up old nonces (older than 10 minutes)
  db.prepare("DELETE FROM openclaw_nonces WHERE received_at < datetime('now', '-10 minutes')").run();

  return { valid: true };
}

/**
 * POST /api/openclaw/webhook
 * Process incoming webhook events from OpenClaw.
 */
router.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-openclaw-signature'];
    const timestamp = req.headers['x-openclaw-timestamp'];
    const nonce = req.headers['x-openclaw-nonce'];

    // Verify signature
    if (!signature || !verifySignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check for replay
    if (timestamp && nonce) {
      const replay = checkReplay(timestamp, nonce);
      if (!replay.valid) {
        return res.status(409).json({ error: replay.reason });
      }
    }

    const { event_type, payload } = req.body;

    // Process event types
    switch (event_type) {
      case 'create_task':
        handleCreateTask(payload);
        break;
      case 'update_task':
        handleUpdateTask(payload);
        break;
      case 'optimize_queue':
        handleOptimizeQueue(payload);
        break;
      case 'update_knowledge':
        handleUpdateKnowledge(payload);
        break;
      default:
        console.warn(`[OPENCLAW] Unknown event type: ${event_type}`);
    }

    logAction({
      action: 'webhook_received',
      entityType: 'openclaw',
      diff: { event_type, payload_keys: Object.keys(payload || {}) },
    });

    res.json({ status: 'accepted', event_type });
  } catch (err) {
    console.error('[OPENCLAW] Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function handleCreateTask(payload) {
  if (!payload?.title) return;
  db.prepare(`
    INSERT INTO kanban_tasks (title, description, status, priority, task_type, client_id)
    VALUES (?, ?, 'todo', ?, ?, ?)
  `).run(payload.title, payload.description || null, payload.priority || 'medium', payload.task_type || 'other', payload.client_id || null);

  try {
    notifyAdmin(`➕ *New Task Created (via OpenClaw)*\n\n` +
      `*Task:* ${payload.title}\n` +
      `*Type:* ${payload.task_type || 'other'}\n` +
      `*Priority:* ${payload.priority || 'medium'}\n` +
      `*Assignee:* Unassigned\n` +
      `*Due Date:* N/A`);
  } catch (telegramErr) {
    console.error('[TELEGRAM] Notification error during OpenClaw task creation:', telegramErr.message);
  }
}

function handleUpdateTask(payload) {
  if (!payload?.task_id) return;
  const allowedFields = ['status', 'priority', 'description', 'assigned_to'];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return;
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE kanban_tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), payload.task_id);
}

function handleOptimizeQueue(payload) {
  // Reorder tasks based on priority and due date
  console.log('[OPENCLAW] Queue optimization requested:', payload);
}

function handleUpdateKnowledge(payload) {
  if (!payload?.key || !payload?.content) return;
  db.prepare(`
    INSERT INTO openclaw_operational_knowledge (key, knowledge_type, content)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      knowledge_type = excluded.knowledge_type,
      content = excluded.content,
      updated_at = datetime('now')
  `).run(payload.key, payload.knowledge_type || 'general', JSON.stringify(payload.content));
}

export default router;
