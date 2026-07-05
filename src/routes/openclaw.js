/**
 * Marketing Ops Center — OpenClaw Integration Routes
 * Webhook with HMAC-SHA256 verification, replay attack prevention,
 * Telegram confirmation flow, and handlers for all dashboard entities.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../../database.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { logAction } from '../services/auditLogger.js';
import { notifyAdmin, sendMessage } from '../services/telegram.js';

const router = Router();

router.use(webhookLimiter);

const HMAC_SECRET = process.env.OPENCLAW_HMAC_SECRET || '';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

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

// ============================================================
// TELEGRAM CONFIRMATION HELPERS
// ============================================================

/**
 * Generate a unique action ID for pending actions.
 */
function generateActionId() {
  return crypto.randomUUID();
}

/**
 * Build a human-readable summary of the proposed action for Telegram.
 */
function buildConfirmationMessage(eventType, payload) {
  const actionVerb = eventType.startsWith('create_') ? 'Create' : eventType.startsWith('update_') ? 'Update' : eventType.startsWith('upsert_') ? 'Create/Update' : 'Execute';
  const entityName = eventType.replace(/^(create_|update_|upsert_)/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  let details = '';
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined && typeof value !== 'object') {
      details += `• *${key}:* ${value}\n`;
    } else if (typeof value === 'object' && value !== null) {
      details += `• *${key}:* ${JSON.stringify(value).slice(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}\n`;
    }
  }

  const isReel = (eventType.includes('content') || payload.post_type) && 
    (String(payload.post_type || '').toLowerCase().includes('reel') || String(payload.post_type || '').toLowerCase().includes('video') || String(payload.link || '').includes('drive.google.com'));

  const trialNote = isReel ? `\n🧪 *Trial Posting Question:* Do you want to post this Reel as a Trial / Test Post first?\n` : '';

  return `🤖 *OpenClaw — Confirmation Required*\n\n` +
    `*Action:* ${actionVerb} ${entityName}\n\n` +
    `📋 *Proposed Changes:*\n${details}${trialNote}` +
    `---\nTap a button below to proceed:`;
}

/**
 * Stage an action as pending and send Telegram confirmation.
 */
async function stageAction(eventType, payload) {
  const actionId = generateActionId();
  const message = buildConfirmationMessage(eventType, payload);

  // Check if item is Reel/Video content
  const isReel = (eventType.includes('content') || payload.post_type) && 
    (String(payload.post_type || '').toLowerCase().includes('reel') || String(payload.post_type || '').toLowerCase().includes('video') || String(payload.link || '').includes('drive.google.com'));

  // Build inline keyboard with optional Trial button
  const inlineButtons = [
    [
      { text: '✅ Accept & Schedule', callback_data: `openclaw_accept:${actionId}` },
      { text: '❌ Reject', callback_data: `openclaw_reject:${actionId}` }
    ]
  ];

  if (isReel) {
    inlineButtons.unshift([
      { text: '🧪 Post as Trial', callback_data: `openclaw_trial:${actionId}` }
    ]);
  } else {
    inlineButtons.push([
      { text: '✏️ Update', callback_data: `openclaw_update:${actionId}` }
    ]);
  }

  // Store pending action in DB
  db.prepare(`
    INSERT INTO openclaw_pending_actions (action_id, event_type, payload, status, telegram_chat_id)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(actionId, eventType, JSON.stringify(payload), ADMIN_CHAT_ID || '');

  // Send Telegram message with inline keyboard
  const replyMarkup = { inline_keyboard: inlineButtons };

  const result = await notifyAdmin(message, replyMarkup);

  // Store the Telegram message IDs as a JSON string so we can edit them later
  if (result) {
    const resultsArray = Array.isArray(result) ? result : [result];
    db.prepare('UPDATE openclaw_pending_actions SET telegram_message_id = ? WHERE action_id = ?')
      .run(JSON.stringify(resultsArray), actionId);
  }

  return actionId;
}

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================

/**
 * POST /api/openclaw/webhook
 * Process incoming webhook events from OpenClaw.
 * Events are staged as pending and confirmed via Telegram.
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

    if (!event_type || !payload) {
      return res.status(400).json({ error: 'event_type and payload are required' });
    }

    // Validate event type is known
    const knownEvents = [
      'create_task', 'update_task', 'create_content', 'update_content',
      'create_ad_campaign', 'update_ad_campaign', 'upsert_monthly_report',
      'create_script', 'update_script', 'create_client', 'update_client',
      'create_artist', 'update_artist', 'create_venue', 'update_venue',
      'create_gig', 'update_gig', 'create_freelancer', 'update_freelancer',
      'send_chat_message', 'update_knowledge', 'optimize_queue',
      'create_blog_post', 'update_blog_post'
    ];

    if (!knownEvents.includes(event_type)) {
      console.warn(`[OPENCLAW] Unknown event type: ${event_type}`);
      return res.status(400).json({ error: `Unknown event type: ${event_type}` });
    }

    // If it is a draft blog post, execute immediately without Telegram confirmation
    const isDraftBlog = (event_type === 'create_blog_post' || event_type === 'update_blog_post') &&
      (payload.status && payload.status.toLowerCase() === 'draft');

    if (isDraftBlog) {
      const result = executeEvent(event_type, payload);
      
      logAction({
        action: 'openclaw_auto_executed',
        entityType: 'openclaw',
        diff: { event_type, payload_keys: Object.keys(payload || {}) },
      });

      return res.json({ 
        status: 'executed', 
        event_type, 
        message: `Blog post draft auto-executed immediately: ${result.summary}` 
      });
    }

    // Stage the action for Telegram confirmation
    stageAction(event_type, payload).catch(err => {
      console.error('[OPENCLAW] Failed to stage action for Telegram confirmation:', err);
    });

    logAction({
      action: 'webhook_received',
      entityType: 'openclaw',
      diff: { event_type, payload_keys: Object.keys(payload || {}) },
    });

    res.json({ status: 'accepted', event_type, message: 'Action staged for admin confirmation via Telegram' });
  } catch (err) {
    console.error('[OPENCLAW] Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TELEGRAM CALLBACK HANDLER
// ============================================================

/**
 * POST /api/openclaw/telegram-callback
 * Handles Telegram bot callback queries (Accept/Reject/Update buttons).
 * This should be registered as the Telegram bot webhook URL.
 */
router.post('/telegram-callback', async (req, res) => {
  try {
    const { callback_query } = req.body;

    if (!callback_query) {
      return res.json({ ok: true }); // Not a callback query, ignore
    }

    const callbackData = callback_query.data;
    const chatId = callback_query.message?.chat?.id;
    const messageId = callback_query.message?.message_id;

    if (!callbackData || !callbackData.startsWith('openclaw_')) {
      return res.json({ ok: true });
    }

    // Authorization check to ensure the user clicking the button is an authorized admin
    const userTelegramId = String(callback_query.from?.id || '');
    const authorizedAdminIds = process.env.TELEGRAM_ADMIN_CHAT_ID
      ? process.env.TELEGRAM_ADMIN_CHAT_ID.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    if (authorizedAdminIds.length > 0 && !authorizedAdminIds.includes(userTelegramId)) {
      await answerCallbackQuery(callback_query.id, '❌ You are not authorized to perform this action.');
      return res.json({ ok: true });
    }

    const [action, actionId] = callbackData.split(':');

    // Lookup the pending action
    const pendingAction = db.prepare(
      'SELECT * FROM openclaw_pending_actions WHERE action_id = ? AND status = ?'
    ).get(actionId, 'pending');

    if (!pendingAction) {
      // Answer the callback to dismiss the loading indicator
      await answerCallbackQuery(callback_query.id, '⚠️ Action already processed or not found.');
      return res.json({ ok: true });
    }

    const eventType = pendingAction.event_type;
    const payload = JSON.parse(pendingAction.payload);

    // Get all sent messages to update them all
    let sentMessages = [];
    try {
      const parsed = JSON.parse(pendingAction.telegram_message_id || '[]');
      sentMessages = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      if (pendingAction.telegram_message_id && pendingAction.telegram_chat_id) {
        sentMessages = [{ chat_id: pendingAction.telegram_chat_id, message_id: pendingAction.telegram_message_id }];
      }
    }

    if (action === 'openclaw_accept' || action === 'openclaw_trial') {
      const isTrial = action === 'openclaw_trial';
      if (isTrial) {
        payload.is_trial = 1;
      }

      // Execute the action
      const result = executeEvent(eventType, payload);

      // Update pending action status
      db.prepare('UPDATE openclaw_pending_actions SET status = ?, resolved_at = datetime(?) WHERE action_id = ?')
        .run('accepted', new Date().toISOString(), actionId);

      // Edit the Telegram message to show it was accepted in all admin chats
      const entityName = eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const statusBadge = isTrial ? '🧪 *Executed as Trial Reel!*' : '✅ *Done!*';
      const updatedText = `${statusBadge} ${entityName} has been scheduled/posted.\n\n${result.summary || ''}`;
      
      for (const msg of sentMessages) {
        if (msg && msg.chat_id && msg.message_id) {
          await editMessageText(msg.chat_id, msg.message_id, updatedText);
        }
      }

      await answerCallbackQuery(callback_query.id, isTrial ? '🧪 Trial Reel scheduled!' : '✅ Action executed!');

      logAction({
        action: isTrial ? 'openclaw_trial_scheduled' : 'openclaw_confirmed',
        entityType: 'openclaw',
        diff: { event_type: eventType, action_id: actionId, is_trial: isTrial ? 1 : 0 },
      });

    } else if (action === 'openclaw_reject') {
      // Reject the action
      db.prepare('UPDATE openclaw_pending_actions SET status = ?, resolved_at = datetime(?) WHERE action_id = ?')
        .run('rejected', new Date().toISOString(), actionId);

      const updatedText = `❌ *Action Cancelled.* No changes were made.\n\nOriginal request: ${eventType}`;
      for (const msg of sentMessages) {
        if (msg && msg.chat_id && msg.message_id) {
          await editMessageText(msg.chat_id, msg.message_id, updatedText);
        }
      }

      await answerCallbackQuery(callback_query.id, '❌ Action rejected.');

      logAction({
        action: 'openclaw_rejected',
        entityType: 'openclaw',
        diff: { event_type: eventType, action_id: actionId },
      });

    } else if (action === 'openclaw_update') {
      // Prompt user to send updated instructions
      await answerCallbackQuery(callback_query.id, '✏️ Please reply with your changes.');
      await sendMessage(chatId, `✏️ *Update Requested*\n\nReply to this message with your changes for the *${eventType.replace(/_/g, ' ')}* action. OpenClaw will re-submit with your amendments.`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[OPENCLAW] Telegram callback error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Answer a Telegram callback query (dismisses the button loading indicator).
 */
async function answerCallbackQuery(callbackQueryId, text) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (err) {
    console.error('[TELEGRAM] Answer callback error:', err.message);
  }
}

/**
 * Edit an existing Telegram message text.
 */
async function editMessageText(chatId, messageId, text) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('[TELEGRAM] Edit message error:', err.message);
  }
}

// ============================================================
// EVENT EXECUTION ENGINE
// ============================================================

/**
 * Execute a confirmed event. Routes to the appropriate handler.
 * Returns { success: boolean, summary: string }
 */
function executeEvent(eventType, payload) {
  try {
    switch (eventType) {
      case 'create_task': return handleCreateTask(payload);
      case 'update_task': return handleUpdateTask(payload);
      case 'create_content': return handleCreateContent(payload);
      case 'update_content': return handleUpdateContent(payload);
      case 'create_ad_campaign': return handleCreateAdCampaign(payload);
      case 'update_ad_campaign': return handleUpdateAdCampaign(payload);
      case 'upsert_monthly_report': return handleUpsertMonthlyReport(payload);
      case 'create_script': return handleCreateScript(payload);
      case 'update_script': return handleUpdateScript(payload);
      case 'create_client': return handleCreateClient(payload);
      case 'update_client': return handleUpdateClient(payload);
      case 'create_artist': return handleCreateArtist(payload);
      case 'update_artist': return handleUpdateArtist(payload);
      case 'create_venue': return handleCreateVenue(payload);
      case 'update_venue': return handleUpdateVenue(payload);
      case 'create_gig': return handleCreateGig(payload);
      case 'update_gig': return handleUpdateGig(payload);
      case 'create_freelancer': return handleCreateFreelancer(payload);
      case 'update_freelancer': return handleUpdateFreelancer(payload);
      case 'send_chat_message': return handleSendChatMessage(payload);
      case 'update_knowledge': return handleUpdateKnowledge(payload);
      case 'optimize_queue': return handleOptimizeQueue(payload);
      case 'create_blog_post': return handleCreateBlogPost(payload);
      case 'update_blog_post': return handleUpdateBlogPost(payload);
      default:
        return { success: false, summary: `Unknown event type: ${eventType}` };
    }
  } catch (err) {
    console.error(`[OPENCLAW] Error executing ${eventType}:`, err);
    return { success: false, summary: `Error: ${err.message}` };
  }
}

// ============================================================
// HANDLER IMPLEMENTATIONS
// ============================================================

function handleCreateTask(payload) {
  if (!payload?.title) return { success: false, summary: 'Title is required' };
  const result = db.prepare(`
    INSERT INTO kanban_tasks (title, description, status, priority, task_type, client_id, assigned_to, due_date)
    VALUES (?, ?, 'todo', ?, ?, ?, ?, ?)
  `).run(
    payload.title,
    payload.description || null,
    payload.priority || 'medium',
    payload.task_type || 'other',
    payload.client_id || null,
    payload.assigned_to || null,
    payload.due_date || null
  );

  logAction({ action: 'create', entityType: 'task', entityId: result.lastInsertRowid, diff: { title: payload.title, source: 'openclaw' } });
  return { success: true, summary: `Task #${result.lastInsertRowid} "${payload.title}" created.` };
}

function handleUpdateTask(payload) {
  if (!payload?.task_id) return { success: false, summary: 'task_id is required' };
  const allowedFields = ['status', 'priority', 'description', 'assigned_to', 'title', 'due_date', 'task_type', 'client_id', 'drive_link'];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE kanban_tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), payload.task_id);

  logAction({ action: 'update', entityType: 'task', entityId: payload.task_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Task #${payload.task_id} updated. Fields: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}` };
}

function handleCreateContent(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  let finalTitle = payload.title;
  if (!finalTitle) {
    if (payload.script) finalTitle = payload.script.slice(0, 30) + (payload.script.length > 30 ? '...' : '');
    else if (payload.caption) finalTitle = payload.caption.slice(0, 30) + (payload.caption.length > 30 ? '...' : '');
    else finalTitle = `Content Plan - ${payload.date || new Date().toISOString().split('T')[0]}`;
  }

  // Compute metrics
  const views = payload.views || 0, likes = payload.likes || 0, comments = payload.comments || 0;
  const shares = payload.shares || 0, saves = payload.saves || 0;
  const awt = payload.avg_watch_time_pct !== undefined ? payload.avg_watch_time_pct : null;

  let engagement_rate_pct = null, save_rate_pct = null, content_score = null;
  if (views > 0) {
    engagement_rate_pct = Math.round(((likes + comments + shares + saves) / views) * 100 * 100) / 100;
    save_rate_pct = Math.round((saves / views) * 100 * 100) / 100;
  }
  if (engagement_rate_pct !== null && save_rate_pct !== null && awt !== null) {
    content_score = Math.round(((engagement_rate_pct * 0.3) + (save_rate_pct * 2.5) + (awt * 0.45)) * 10) / 10;
  }

  const result = db.prepare(`
    INSERT INTO marketing_content_tracker (
      client_id, platform, date, post_type, title, script, link, time, caption, status, source,
      views, likes, comments, shares, saves, avg_watch_time_pct, boosted, follows,
      youtube_views, youtube_watch_time, youtube_avg_view_duration, youtube_ctr,
      engagement_rate_pct, save_rate_pct, content_score,
      facebook_post_id, instagram_media_id, youtube_video_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id,
    payload.platform || null,
    payload.date || null,
    payload.post_type || null,
    finalTitle,
    payload.script || null,
    payload.link || null,
    payload.time || null,
    payload.caption || null,
    payload.status || 'Draft',
    views, likes, comments, shares, saves,
    awt,
    payload.boosted || 'No',
    payload.follows || 0,
    payload.youtube_views || 0,
    payload.youtube_watch_time || 0.0,
    payload.youtube_avg_view_duration || null,
    payload.youtube_ctr || 0.0,
    engagement_rate_pct, save_rate_pct, content_score,
    payload.facebook_post_id || null,
    payload.instagram_media_id || null,
    payload.youtube_video_id || null
  );

  // Link script if provided
  if (payload.script_id) {
    db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)')
      .run(result.lastInsertRowid, payload.script_id);
  }

  logAction({ action: 'create', entityType: 'content', entityId: result.lastInsertRowid, diff: { title: finalTitle, source: 'openclaw' } });
  return { success: true, summary: `Content #${result.lastInsertRowid} "${finalTitle}" created for client ${payload.client_id}.` };
}

function handleUpdateContent(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  let content = null;
  let identifierUsed = '';

  if (payload.content_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ? AND client_id = ?')
      .get(payload.content_id, payload.client_id);
    identifierUsed = `id #${payload.content_id}`;
  } else if (payload.facebook_post_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE facebook_post_id = ? AND client_id = ?')
      .get(payload.facebook_post_id, payload.client_id);
    identifierUsed = `facebook_post_id "${payload.facebook_post_id}"`;
  } else if (payload.instagram_media_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE instagram_media_id = ? AND client_id = ?')
      .get(payload.instagram_media_id, payload.client_id);
    identifierUsed = `instagram_media_id "${payload.instagram_media_id}"`;
  } else if (payload.youtube_video_id) {
    content = db.prepare('SELECT * FROM marketing_content_tracker WHERE youtube_video_id = ? AND client_id = ?')
      .get(payload.youtube_video_id, payload.client_id);
    identifierUsed = `youtube_video_id "${payload.youtube_video_id}"`;
  }

  if (!content) {
    return {
      success: false,
      summary: `Content row not found for client ${payload.client_id} using supplied identifiers.`
    };
  }

  const targetContentId = content.id;

  const allowedFields = [
    'platform', 'date', 'post_type', 'title', 'script', 'status',
    'views', 'likes', 'comments', 'shares', 'saves', 'avg_watch_time_pct',
    'boosted', 'link', 'time', 'caption', 'follows',
    'youtube_views', 'youtube_watch_time', 'youtube_avg_view_duration', 'youtube_ctr',
    'facebook_post_id', 'instagram_media_id', 'youtube_video_id'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0 && payload.script_id === undefined) {
    return { success: false, summary: 'No valid fields to update' };
  }

  if (Object.keys(updates).length > 0) {
    // Recompute metrics
    const merged = { ...content, ...updates };
    const v = merged.views || 0, l = merged.likes || 0, c = merged.comments || 0;
    const sh = merged.shares || 0, sa = merged.saves || 0;
    const awt = merged.avg_watch_time_pct;

    if (v > 0) {
      updates.engagement_rate_pct = Math.round(((l + c + sh + sa) / v) * 100 * 100) / 100;
      updates.save_rate_pct = Math.round((sa / v) * 100 * 100) / 100;
    }
    if (updates.engagement_rate_pct !== undefined && updates.save_rate_pct !== undefined && awt !== null && awt !== undefined) {
      updates.content_score = Math.round(((updates.engagement_rate_pct * 0.3) + (updates.save_rate_pct * 2.5) + (awt * 0.45)) * 10) / 10;
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE marketing_content_tracker SET ${setClauses} WHERE id = ?`)
      .run(...Object.values(updates), targetContentId);
  }

  // Handle script linking
  if (payload.script_id !== undefined) {
    db.prepare('DELETE FROM marketing_content_script_relation WHERE content_id = ?').run(targetContentId);
    if (payload.script_id) {
      db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)')
        .run(targetContentId, payload.script_id);
    }
  }

  logAction({ action: 'update', entityType: 'content', entityId: targetContentId, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Content #${targetContentId} (found via ${identifierUsed}) updated.` };
}

function handleCreateAdCampaign(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  const imp = payload.impressions || 0, clk = payload.clicks || 0;
  const spend = payload.total_ad_spend_inr || 0, leads = payload.leads || 0;
  const rev = payload.revenue_generated || 0;

  const ctr_pct = imp > 0 ? Math.round((clk / imp) * 100 * 100) / 100 : null;
  const cpc_inr = clk > 0 ? Math.round(spend / clk) : null;
  const cpl_inr = leads > 0 ? Math.round(spend / leads) : null;
  const roas = spend > 0 ? Math.round((rev / spend) * 100) / 100 : null;

  const result = db.prepare(`
    INSERT INTO marketing_ad_campaigns (client_id, platform, ad_campaign_name, leads, total_ad_spend_inr,
      impressions, clicks, ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id, payload.platform || null, payload.ad_campaign_name || null,
    leads, spend, imp, clk, ctr_pct, cpc_inr, cpl_inr, rev, roas
  );

  logAction({ action: 'create', entityType: 'ad_campaign', entityId: result.lastInsertRowid, diff: { ad_campaign_name: payload.ad_campaign_name, source: 'openclaw' } });
  return { success: true, summary: `Ad Campaign #${result.lastInsertRowid} "${payload.ad_campaign_name || 'Unnamed'}" created.` };
}

function handleUpdateAdCampaign(payload) {
  if (!payload?.client_id || !payload?.ad_id) return { success: false, summary: 'client_id and ad_id are required' };

  const ad = db.prepare('SELECT * FROM marketing_ad_campaigns WHERE id = ? AND client_id = ?')
    .get(payload.ad_id, payload.client_id);
  if (!ad) return { success: false, summary: `Ad campaign #${payload.ad_id} not found` };

  const allowedFields = ['platform', 'ad_campaign_name', 'leads', 'total_ad_spend_inr', 'impressions', 'clicks', 'revenue_generated'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };

  // Recompute metrics
  const merged = { ...ad, ...updates };
  updates.ctr_pct = merged.impressions > 0 ? Math.round((merged.clicks / merged.impressions) * 100 * 100) / 100 : null;
  updates.cpc_inr = merged.clicks > 0 ? Math.round(merged.total_ad_spend_inr / merged.clicks) : null;
  updates.cpl_inr = merged.leads > 0 ? Math.round(merged.total_ad_spend_inr / merged.leads) : null;
  updates.roas = merged.total_ad_spend_inr > 0 ? Math.round((merged.revenue_generated / merged.total_ad_spend_inr) * 100) / 100 : null;
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE marketing_ad_campaigns SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.ad_id);

  logAction({ action: 'update', entityType: 'ad_campaign', entityId: payload.ad_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Ad Campaign #${payload.ad_id} updated.` };
}

function handleUpsertMonthlyReport(payload) {
  if (!payload?.client_id || !payload?.month) return { success: false, summary: 'client_id and month are required' };

  // Get previous month for MoM computation
  const [year, mon] = payload.month.split('-').map(Number);
  const prevDate = new Date(year, mon - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const prevReport = db.prepare(
    'SELECT website_traffic, map_views FROM marketing_monthly_report WHERE client_id = ? AND month = ?'
  ).get(payload.client_id, prevMonth);

  let mom_growth_sessions = null, mom_growth_gmb_views = null;
  if (prevReport) {
    if (prevReport.website_traffic > 0 && payload.website_traffic) {
      mom_growth_sessions = Math.round(((payload.website_traffic - prevReport.website_traffic) / prevReport.website_traffic) * 10000) / 10000;
    }
    if (prevReport.map_views > 0 && payload.map_views) {
      mom_growth_gmb_views = Math.round(((payload.map_views - prevReport.map_views) / prevReport.map_views) * 10000) / 10000;
    }
  }

  db.prepare(`
    INSERT INTO marketing_monthly_report (
      client_id, month, website_clicks, website_traffic, gmb_views, map_views, gmb_clicks,
      on_page_score, off_page, blogs, calls, directions, reviews, avg_rating,
      top_keywords, da, mom_growth_sessions, mom_growth_gmb_views, ai_overview_visible
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id, month) DO UPDATE SET
      website_clicks = excluded.website_clicks,
      website_traffic = excluded.website_traffic,
      gmb_views = excluded.gmb_views,
      map_views = excluded.map_views,
      gmb_clicks = excluded.gmb_clicks,
      on_page_score = excluded.on_page_score,
      off_page = excluded.off_page,
      blogs = excluded.blogs,
      calls = excluded.calls,
      directions = excluded.directions,
      reviews = excluded.reviews,
      avg_rating = excluded.avg_rating,
      top_keywords = excluded.top_keywords,
      da = excluded.da,
      mom_growth_sessions = excluded.mom_growth_sessions,
      mom_growth_gmb_views = excluded.mom_growth_gmb_views,
      ai_overview_visible = excluded.ai_overview_visible,
      updated_at = datetime('now')
  `).run(
    payload.client_id, payload.month,
    payload.website_clicks || null, payload.website_traffic || null,
    payload.gmb_views || null, payload.map_views || null, payload.gmb_clicks || null,
    payload.on_page_score || null, payload.off_page || null, payload.blogs || null,
    payload.calls || null, payload.directions || null, payload.reviews || null,
    payload.avg_rating || null, payload.top_keywords || null, payload.da || null,
    mom_growth_sessions, mom_growth_gmb_views, payload.ai_overview_visible || 'No'
  );

  logAction({ action: 'upsert', entityType: 'monthly_report', diff: { month: payload.month, source: 'openclaw' } });
  return { success: true, summary: `Monthly report for ${payload.month} (client ${payload.client_id}) upserted.` };
}

function handleCreateScript(payload) {
  if (!payload?.client_id || !payload?.title || !payload?.script_text || !payload?.month) {
    return { success: false, summary: 'client_id, title, script_text, and month are required' };
  }

  const result = db.prepare(`
    INSERT INTO marketing_scripts (client_id, month, title, script_text, reference_video_link, reaction_video_link, format)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.client_id, payload.month, payload.title, payload.script_text,
    payload.reference_video_link || null, payload.reaction_video_link || null, payload.format || 'reel'
  );

  logAction({ action: 'create', entityType: 'script', entityId: result.lastInsertRowid, diff: { title: payload.title, source: 'openclaw' } });
  return { success: true, summary: `Script #${result.lastInsertRowid} "${payload.title}" created.` };
}

function handleUpdateScript(payload) {
  if (!payload?.client_id || !payload?.script_id) return { success: false, summary: 'client_id and script_id are required' };

  const script = db.prepare('SELECT * FROM marketing_scripts WHERE id = ? AND client_id = ?')
    .get(payload.script_id, payload.client_id);
  if (!script) return { success: false, summary: `Script #${payload.script_id} not found` };

  const allowedFields = ['title', 'script_text', 'month', 'reference_video_link', 'reaction_video_link', 'format'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE marketing_scripts SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.script_id);

  logAction({ action: 'update', entityType: 'script', entityId: payload.script_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Script #${payload.script_id} updated.` };
}

function handleCreateClient(payload) {
  if (!payload?.name) return { success: false, summary: 'Client name is required' };

  const result = db.prepare(`
    INSERT INTO crm_clients (name, client_type, contact_person, contact_email, contact_phone,
      calendar_sync_link, drive_folder_link, instagram_business_account_id,
      youtube_channel_id, google_ads_customer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.client_type || 'marketing',
    payload.contact_person || null,
    payload.contact_email || null,
    payload.contact_phone || null,
    payload.calendar_sync_link || null,
    payload.drive_folder_link || null,
    payload.instagram_business_account_id || null,
    payload.youtube_channel_id || null,
    payload.google_ads_customer_id || null
  );

  logAction({ action: 'create', entityType: 'client', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Client #${result.lastInsertRowid} "${payload.name}" created.` };
}

function handleUpdateClient(payload) {
  if (!payload?.client_id) return { success: false, summary: 'client_id is required' };

  const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(payload.client_id);
  if (!client) return { success: false, summary: `Client #${payload.client_id} not found` };

  const allowedFields = [
    'name', 'client_type', 'contact_person', 'contact_email', 'contact_phone',
    'calendar_sync_link', 'drive_folder_link', 'instagram_business_account_id',
    'youtube_channel_id', 'google_ads_customer_id', 'is_active', 'portal_enabled'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE crm_clients SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.client_id);

  logAction({ action: 'update', entityType: 'client', entityId: payload.client_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Client #${payload.client_id} updated.` };
}

function handleCreateArtist(payload) {
  if (!payload?.name) return { success: false, summary: 'Artist name is required' };

  // Generate artist_id from name + phone
  const prefix = payload.name.substring(0, 3).toUpperCase();
  const suffix = payload.phone ? payload.phone.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
  const artistCode = `${prefix}${suffix}`;

  const result = db.prepare(`
    INSERT INTO artists (artist_id, name, category, city, phone, email, telegram_chat_id,
      instruments, insta_link, description, rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artistCode, payload.name,
    payload.category || null, payload.city || null,
    payload.phone || null, payload.email || null,
    payload.telegram_chat_id || null,
    payload.instruments || null, payload.insta_link || null,
    payload.description || null,
    payload.rating !== undefined && payload.rating !== '' ? parseInt(payload.rating) : null,
    payload.notes || null
  );

  logAction({ action: 'create', entityType: 'artist', entityId: result.lastInsertRowid, diff: { name: payload.name, artist_id: artistCode, source: 'openclaw' } });
  return { success: true, summary: `Artist #${result.lastInsertRowid} "${payload.name}" (${artistCode}) created.` };
}

function handleUpdateArtist(payload) {
  if (!payload?.artist_id) return { success: false, summary: 'artist_id is required' };

  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(payload.artist_id);
  if (!artist) return { success: false, summary: `Artist #${payload.artist_id} not found` };

  const allowedFields = ['name', 'category', 'city', 'phone', 'email', 'telegram_chat_id', 'is_active',
    'instruments', 'insta_link', 'description', 'rating', 'notes'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE artists SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.artist_id);

  logAction({ action: 'update', entityType: 'artist', entityId: payload.artist_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Artist #${payload.artist_id} updated.` };
}

function handleCreateVenue(payload) {
  if (!payload?.name) return { success: false, summary: 'Venue name is required' };

  const result = db.prepare(`
    INSERT INTO venues (name, address, city, map_link, poc_name, poc_phone, poc_email, social_links, gig_confirmed_message, client_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.address || null, payload.city || null, payload.map_link || null,
    payload.poc_name || null, payload.poc_phone || null, payload.poc_email || null,
    payload.social_links || null, payload.gig_confirmed_message || null,
    payload.client_id || null
  );

  logAction({ action: 'create', entityType: 'venue', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Venue #${result.lastInsertRowid} "${payload.name}" created.` };
}

function handleUpdateVenue(payload) {
  if (!payload?.venue_id) return { success: false, summary: 'venue_id is required' };

  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(payload.venue_id);
  if (!venue) return { success: false, summary: `Venue #${payload.venue_id} not found` };

  const allowedFields = ['name', 'address', 'city', 'map_link', 'poc_name', 'poc_phone', 'poc_email', 'social_links', 'gig_confirmed_message', 'client_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE venues SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.venue_id);

  logAction({ action: 'update', entityType: 'venue', entityId: payload.venue_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Venue #${payload.venue_id} updated.` };
}

function handleCreateGig(payload) {
  if (!payload?.artist_id || !payload?.gig_date) return { success: false, summary: 'artist_id and gig_date are required' };

  const result = db.prepare(`
    INSERT INTO gig_status (artist_id, venue_id, planning_cycle_id, gig_date, fee_inr, advance_paid, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.artist_id,
    payload.venue_id || null,
    payload.planning_cycle_id || null,
    payload.gig_date,
    payload.fee_inr || 0,
    payload.advance_paid || 0,
    payload.status || 'Pending'
  );

  // Recalculate artist rollups
  recalculateArtistRollups(payload.artist_id);

  logAction({ action: 'create', entityType: 'gig', entityId: result.lastInsertRowid, diff: { artist_id: payload.artist_id, gig_date: payload.gig_date, source: 'openclaw' } });
  return { success: true, summary: `Gig #${result.lastInsertRowid} on ${payload.gig_date} created.` };
}

function handleUpdateGig(payload) {
  if (!payload?.gig_id) return { success: false, summary: 'gig_id is required' };

  const gig = db.prepare('SELECT * FROM gig_status WHERE id = ?').get(payload.gig_id);
  if (!gig) return { success: false, summary: `Gig #${payload.gig_id} not found` };

  const allowedFields = ['status', 'fee_inr', 'advance_paid', 'gig_date', 'venue_id', 'artist_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE gig_status SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.gig_id);

  // Recalculate rollups
  recalculateArtistRollups(gig.artist_id);
  if (updates.artist_id && updates.artist_id !== gig.artist_id) {
    recalculateArtistRollups(updates.artist_id);
  }

  logAction({ action: 'update', entityType: 'gig', entityId: payload.gig_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Gig #${payload.gig_id} updated.` };
}

function handleCreateFreelancer(payload) {
  if (!payload?.name) return { success: false, summary: 'Freelancer name is required' };

  const result = db.prepare(`
    INSERT INTO freelancers (name, email, phone, company_name, specialization, rate_per_video)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    payload.name, payload.email || null, payload.phone || null,
    payload.company_name || null, payload.specialization || null, payload.rate_per_video || null
  );

  logAction({ action: 'create', entityType: 'freelancer', entityId: result.lastInsertRowid, diff: { name: payload.name, source: 'openclaw' } });
  return { success: true, summary: `Freelancer #${result.lastInsertRowid} "${payload.name}" created.` };
}

function handleUpdateFreelancer(payload) {
  if (!payload?.freelancer_id) return { success: false, summary: 'freelancer_id is required' };

  const freelancer = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(payload.freelancer_id);
  if (!freelancer) return { success: false, summary: `Freelancer #${payload.freelancer_id} not found` };

  const allowedFields = ['name', 'email', 'phone', 'company_name', 'specialization', 'rate_per_video', 'is_active'];
  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE freelancers SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), payload.freelancer_id);

  logAction({ action: 'update', entityType: 'freelancer', entityId: payload.freelancer_id, diff: { ...updates, source: 'openclaw' } });
  return { success: true, summary: `Freelancer #${payload.freelancer_id} updated.` };
}

function handleSendChatMessage(payload) {
  if (!payload?.client_id || !payload?.message) return { success: false, summary: 'client_id and message are required' };

  const result = db.prepare(
    'INSERT INTO internal_chat_messages (client_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)'
  ).run(payload.client_id, 0, 'OpenClaw', payload.message);

  const newMessage = db.prepare('SELECT * FROM internal_chat_messages WHERE id = ?').get(result.lastInsertRowid);

  import('../../server.js').then(({ broadcastEvent }) => {
    broadcastEvent('chat_message', { client_id: parseInt(payload.client_id), message: newMessage });
  }).catch(err => console.error('[OPENCLAW] Broadcast chat message failed:', err));

  logAction({ action: 'create', entityType: 'chat_message', entityId: result.lastInsertRowid, diff: { client_id: payload.client_id, source: 'openclaw' } });
  return { success: true, summary: `Chat message sent for client ${payload.client_id}.` };
}

function handleUpdateKnowledge(payload) {
  if (!payload?.key || !payload?.content) return { success: false, summary: 'key and content are required' };
  db.prepare(`
    INSERT INTO openclaw_operational_knowledge (key, knowledge_type, content)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      knowledge_type = excluded.knowledge_type,
      content = excluded.content,
      updated_at = datetime('now')
  `).run(payload.key, payload.knowledge_type || 'general', JSON.stringify(payload.content));

  logAction({ action: 'upsert', entityType: 'knowledge', diff: { key: payload.key, source: 'openclaw' } });
  return { success: true, summary: `Knowledge "${payload.key}" saved.` };
}

function handleOptimizeQueue(payload) {
  if (payload?.task_order && Array.isArray(payload.task_order)) {
    for (const item of payload.task_order) {
      if (item.task_id && item.priority) {
        db.prepare('UPDATE kanban_tasks SET priority = ?, updated_at = ? WHERE id = ?')
          .run(item.priority, new Date().toISOString(), item.task_id);
      }
    }
    logAction({ action: 'optimize_queue', entityType: 'task', diff: { task_count: payload.task_order.length, source: 'openclaw' } });
    return { success: true, summary: `Queue optimized: ${payload.task_order.length} tasks reordered.` };
  }
  return { success: true, summary: 'Queue optimization requested (no task_order provided).' };
}

// ============================================================
// BLOG POST HANDLERS
// ============================================================

/**
 * Generate a URL-friendly slug from a title.
 */
function generateBlogSlug(title) {
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
function ensureUniqueBlogSlug(slug, excludeId = null) {
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

function handleCreateBlogPost(payload) {
  if (!payload?.title || !payload?.content) {
    return { success: false, summary: 'title and content are required' };
  }

  const slug = ensureUniqueBlogSlug(generateBlogSlug(payload.title));
  const status = payload.status || 'published';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO blog_posts (
      title, slug, excerpt, content, cover_image_url, author, category, tags,
      meta_title, meta_description, meta_keywords, internal_links, status, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.title,
    slug,
    payload.excerpt || null,
    payload.content,
    payload.cover_image_url || null,
    payload.author || 'Hyphening Media',
    payload.category || 'General',
    payload.tags || null,
    payload.meta_title || null,
    payload.meta_description || null,
    payload.meta_keywords || null,
    JSON.stringify(payload.internal_links || []),
    status,
    publishedAt
  );

  logAction({
    action: 'create',
    entityType: 'blog_post',
    entityId: result.lastInsertRowid,
    diff: { title: payload.title, slug, status, source: 'openclaw' }
  });

  return {
    success: true,
    summary: `Blog post #${result.lastInsertRowid} "${payload.title}" created (${status}). Slug: /blog/${slug}`
  };
}

function handleUpdateBlogPost(payload) {
  // Find post by blog_id or slug
  let post = null;
  if (payload.blog_id) {
    post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(payload.blog_id);
  } else if (payload.slug) {
    post = db.prepare('SELECT * FROM blog_posts WHERE slug = ?').get(payload.slug);
  }

  if (!post) return { success: false, summary: 'Blog post not found. Provide blog_id or slug.' };

  const allowedFields = [
    'title', 'excerpt', 'content', 'cover_image_url', 'author', 'category', 'tags',
    'meta_title', 'meta_description', 'meta_keywords', 'internal_links', 'status'
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = field === 'internal_links' ? JSON.stringify(payload[field]) : payload[field];
    }
  }

  if (Object.keys(updates).length === 0) return { success: false, summary: 'No valid fields to update' };

  // Regenerate slug if title changes
  if (updates.title && updates.title !== post.title) {
    updates.slug = ensureUniqueBlogSlug(generateBlogSlug(updates.title), post.id);
  }

  // Set published_at if transitioning to published
  if (updates.status === 'published' && post.status !== 'published') {
    updates.published_at = new Date().toISOString();
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE blog_posts SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), post.id);

  logAction({
    action: 'update',
    entityType: 'blog_post',
    entityId: post.id,
    diff: { ...updates, source: 'openclaw' }
  });

  return {
    success: true,
    summary: `Blog post #${post.id} "${updates.title || post.title}" updated. Fields: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}`
  };
}

// ============================================================
// HELPER: Recalculate artist rollups (duplicated from artists.js)
// ============================================================

function recalculateArtistRollups(artistId) {
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

  let last_perf_date = 'No gigs yet';
  if (stats.latest_gig_date) {
    const d = new Date(stats.latest_gig_date + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    last_perf_date = `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
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

// ============================================================
// GET PENDING ACTIONS (for debugging / admin view)
// ============================================================

/**
 * GET /api/openclaw/pending
 * List all pending actions waiting for Telegram confirmation.
 */
router.get('/pending', (req, res) => {
  try {
    const pending = db.prepare(
      'SELECT * FROM openclaw_pending_actions WHERE status = ? ORDER BY created_at DESC'
    ).all('pending');
    res.json({ pending_actions: pending });
  } catch (err) {
    console.error('[OPENCLAW] Pending list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
