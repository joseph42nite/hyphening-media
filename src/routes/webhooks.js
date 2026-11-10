/**
 * Marketing Ops Center — signed webhook for automation clients.
 *
 * HMAC-SHA256 verification over the raw request bytes, replay prevention via
 * nonce and timestamp, and handlers for every entity an automation client can
 * write.
 *
 * Two callers share it. OpenClaw posts blog content and ops writes; the local
 * SEO worker claims queued runs, streams progress, and submits audits. It was
 * named after OpenClaw when it had one caller — the mount path is still
 * /api/openclaw because both sign against it and changing a wire format earns
 * nothing.
 *
 * This file is the door: signature, replay check and the event switch. The
 * handlers live in src/webhooks/ by area: agentPipelines (night blog and SEO,
 * competitors, skill inventory), records (tasks, content, clients, artists,
 * blog posts...), seoAudits and adsAudits.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../../database.js';
import { manualSummaryLines } from '../services/manualTasks.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import {
  submitBlogDraft,
  failBlogRun,
  attachBlogAudio,
  reviewBlogRun,
} from '../services/blogRuns.js';
import {
  claimSeoFixBatches,
  submitSeoTriage,
  submitSeoFixBatch,
  claimSeoDeploys,
  finishSeoDeploy,
  nightSummaryText,
} from '../services/seoNight.js';
import { claimOutreachRuns, submitOutreachResults, failOutreachRun, outreachSummaryText } from '../services/outreach.js';
import {
  handleClaimBlogRuns,
  handleAddBlogTopics,
  handleQueueBlogRuns,
  handleQueueSeoNight,
  handleQueueSeoFixes,
  handleQueueOutreachRuns,
  handleListBlogRuns,
  handleGetBlogRun,
  handleRetryBlogRun,
  handleBlogRunLog,
  handleSeoRunLog,
  handleReportCompetitors,
  handleClaimSeoRuns,
  handleSkillInventoryReport,
  handleAgentActivityLog,
} from '../webhooks/agentPipelines.js';
import {
  handleCreateTask,
  handleUpdateTask,
  handleCreateContent,
  handleUpdateContent,
  handleCreateAdCampaign,
  handleUpdateAdCampaign,
  handleUpsertMonthlyReport,
  handleCreateScript,
  handleUpdateScript,
  handleCreateClient,
  handleUpdateClient,
  handleCreateArtist,
  handleUpdateArtist,
  handleCreateVenue,
  handleUpdateVenue,
  handleCreateGig,
  handleUpdateGig,
  handleCreateFreelancer,
  handleUpdateFreelancer,
  handleSendChatMessage,
  handleUpdateKnowledge,
  handleOptimizeQueue,
  handleCreateBlogPost,
  handleUpdateBlogPost,
} from '../webhooks/records.js';
import { handleCreateSeoAudit } from '../webhooks/seoAudits.js';
import { handleClaimAdsRuns, handleAdsRunLog, handleCreateAdsAudit } from '../webhooks/adsAudits.js';

// Every event a signed caller may send; each has a case in executeEvent below.
export const KNOWN_EVENTS = [
  'create_task', 'update_task', 'create_content', 'update_content',
  'create_ad_campaign', 'update_ad_campaign', 'upsert_monthly_report',
  'create_script', 'update_script', 'create_client', 'update_client',
  'create_artist', 'update_artist', 'create_venue', 'update_venue',
  'create_gig', 'update_gig', 'create_freelancer', 'update_freelancer',
  'send_chat_message', 'update_knowledge', 'optimize_queue',
  'create_blog_post', 'update_blog_post', 'create_seo_audit',
  'agent_activity_log', 'skill_inventory_report', 'claim_seo_runs',
  'seo_run_log', 'report_competitors',
  'claim_ads_runs', 'create_ads_audit', 'ads_run_log',
  'claim_blog_runs', 'submit_blog_draft', 'fail_blog_run', 'attach_blog_audio',
  'add_blog_topics', 'blog_run_log',
  'queue_blog_runs', 'list_blog_runs', 'get_blog_run', 'review_blog_run', 'retry_blog_run',
  'queue_seo_night', 'queue_seo_fixes', 'seo_night_summary',
  'claim_seo_fix_batches', 'submit_seo_triage', 'submit_seo_fix_batch', 'claim_seo_deploys', 'finish_seo_deploy',
  'queue_outreach_runs', 'claim_outreach_runs', 'submit_outreach_results', 'fail_outreach_run', 'outreach_summary'
];

const router = Router();

router.use(webhookLimiter);

// HYPHENING_HMAC_SECRET is the current name — the shared secret now
// authenticates our own local SEO worker as well as OpenClaw, so naming it
// after one caller was misleading. OPENCLAW_HMAC_SECRET stays as a fallback so
// an environment that has not been renamed yet keeps working: reading only the
// new name on a server still using the old one leaves HMAC_SECRET empty, which
// fails every signature check and takes the webhook down silently.
const HMAC_SECRET = process.env.HYPHENING_HMAC_SECRET
  || process.env.OPENCLAW_HMAC_SECRET
  || '';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify HMAC-SHA256 signature against the bytes that actually arrived.
 *
 * This used to hash JSON.stringify(req.body) — a re-serialisation of the parsed
 * body — which meant any formatting the sender used that Node normalises away
 * broke the signature even when the secret and the algorithm were both correct.
 * A float of 0.0 arrives as "0.0", parses to 0, and re-serialises to "0"; the
 * same applies to \uXXXX escapes, indentation and trailing whitespace. That cost
 * a full day of debugging on 2026-08-03 for exactly the 0.0 case, and it failed
 * as a bare 401 that looks identical to a wrong secret.
 *
 * Hashing req.rawBody (captured by the express.json verify hook in server.js)
 * retires that whole class of mismatch. The sender no longer has to match Node's
 * serialisation — only to sign the bytes it sends.
 */
function verifySignature(req, signature) {
  if (!HMAC_SECRET) return false;

  // Falls back for any path that reaches here without the verify hook having
  // run — a non-JSON content type, or a router mounted without it in a test.
  const body = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

  const expected = Buffer.from(
    crypto.createHmac('sha256', HMAC_SECRET).update(body).digest('hex'),
    'utf8'
  );
  const received = Buffer.from(signature, 'utf8');

  // timingSafeEqual throws on a length mismatch, which the route's catch turned
  // into a 500 — reading as a server fault rather than a bad signature.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
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
  const existing = db.prepare('SELECT nonce FROM webhook_nonces WHERE nonce = ?').get(nonce);
  if (existing) {
    return { valid: false, reason: 'Duplicate nonce — possible replay attack' };
  }

  // Store nonce
  db.prepare('INSERT INTO webhook_nonces (nonce) VALUES (?)').run(nonce);

  // Clean up old nonces (older than 10 minutes)
  db.prepare("DELETE FROM webhook_nonces WHERE received_at < datetime('now', '-10 minutes')").run();

  return { valid: true };
}

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================

/**
 * POST /api/openclaw/webhook
 * Process incoming webhook events from OpenClaw.
 * Events are executed immediately.
 */
router.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-openclaw-signature'];
    const timestamp = req.headers['x-openclaw-timestamp'];
    const nonce = req.headers['x-openclaw-nonce'];

    // Verify signature
    //
    // Logged, because a silent 401 here is indistinguishable from OpenClaw
    // never calling at all. A secret mismatch used to leave no trace on either
    // side: OpenClaw reports "posted the result", our logs show nothing, and
    // the run sits until it times out. The event_type is safe to log; the
    // signature itself is not, so only its length is recorded — enough to tell
    // a truncated header from a wrong secret.
    if (!signature || !verifySignature(req, signature)) {
      console.warn(
        `[OPENCLAW] Rejected webhook (401): ${signature ? 'signature mismatch' : 'no x-openclaw-signature header'}. ` +
        `event_type=${req.body?.event_type || '(none)'} signature_length=${signature?.length ?? 0} ` +
        `hmac_secret_configured=${!!HMAC_SECRET}`
      );
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
      // Says exactly what was missing and what arrived instead. The common
      // cause is sending the fields flat — {event_type, client_id, url, ...}
      // — rather than nested under "payload", which produces a 400 that is
      // otherwise indistinguishable from a genuinely malformed body.
      const received = Object.keys(req.body || {});
      console.warn(`[OPENCLAW] Rejected webhook: missing ${!event_type ? 'event_type' : 'payload'}. Top-level keys received: ${received.join(', ') || '(none)'}`);
      return res.status(400).json({
        error: 'event_type and payload are required',
        missing: !event_type ? 'event_type' : 'payload',
        received_top_level_keys: received,
        expected_shape: { event_type: 'create_seo_audit', payload: { client_id: 1, audit_type: 'technical', url: 'https://example.com' } },
        hint: 'Audit fields go inside "payload", not at the top level.'
      });
    }


    if (!KNOWN_EVENTS.includes(event_type)) {
      console.warn(`[OPENCLAW] Unknown event type: ${event_type}`);
      return res.status(400).json({ error: `Unknown event type: ${event_type}`, known_events: KNOWN_EVENTS });
    }

    // Execute event immediately
    const result = executeEvent(event_type, payload);
    
    logAction({
      action: 'webhook_executed',
      entityType: 'webhook',
      diff: { event_type, payload_keys: Object.keys(payload || {}), success: result.success },
    });

    // Broadcast incoming webhook event to frontend in real-time
    import('../../server.js').then(({ broadcastEvent }) => {
      const payloadData = {
        event_type,
        success: result.success,
        summary: result.summary,
        payload_keys: Object.keys(payload || {}),
        timestamp: new Date().toISOString()
      };
      broadcastEvent('agent_webhook', payloadData);
      broadcastEvent('openclaw_webhook', payloadData); // backward-compatible alias
    }).catch(err => console.error('[WEBHOOK] Broadcast agent_webhook failed:', err));

    if (!result.success) {
      return res.status(500).json({
        error: 'Execution failed',
        message: result.summary
      });
    }

    return res.json({
      status: 'executed',
      event_type,
      message: `Action executed immediately: ${result.summary}`,
      // Handlers that answer a question rather than record one set `data`.
      // The local SEO worker claims queued runs this way, which keeps it on the
      // HMAC channel that already has replay protection and signature checks
      // instead of needing a second authenticated surface.
      ...(result.data !== undefined ? { data: result.data } : {}),
    });
  } catch (err) {
    console.error('[OPENCLAW] Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// EVENT EXECUTION ENGINE
// ============================================================

/**
 * Execute an event. Routes to the appropriate handler.
 * Returns { success: boolean, summary: string }
 */
export function executeEvent(eventType, payload) {
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
      case 'create_seo_audit': return handleCreateSeoAudit(payload);
      case 'agent_activity_log': return handleAgentActivityLog(payload);
      case 'skill_inventory_report': return handleSkillInventoryReport(payload);
      case 'claim_seo_runs': return handleClaimSeoRuns(payload);
      case 'seo_run_log': return handleSeoRunLog(payload);
      case 'report_competitors': return handleReportCompetitors(payload);
      case 'claim_ads_runs': return handleClaimAdsRuns(payload);
      case 'create_ads_audit': return handleCreateAdsAudit(payload);
      case 'ads_run_log': return handleAdsRunLog(payload);
      case 'claim_blog_runs': return handleClaimBlogRuns(payload);
      case 'submit_blog_draft': return submitBlogDraft(payload);
      case 'fail_blog_run': return failBlogRun(payload);
      case 'attach_blog_audio': return attachBlogAudio(payload);
      case 'add_blog_topics': return handleAddBlogTopics(payload);
      case 'blog_run_log': return handleBlogRunLog(payload);
      case 'queue_blog_runs': return handleQueueBlogRuns(payload);
      case 'list_blog_runs': return handleListBlogRuns(payload);
      case 'get_blog_run': return handleGetBlogRun(payload);
      case 'review_blog_run': return reviewBlogRun(payload);
      case 'retry_blog_run': return handleRetryBlogRun(payload);
      case 'queue_seo_night': return handleQueueSeoNight(payload);
      case 'queue_seo_fixes': return handleQueueSeoFixes(payload);
      case 'seo_night_summary': {
        // Manual tasks ride along so the morning brief shows the hand work waiting too.
        const manual = manualSummaryLines();
        const text = [nightSummaryText(), ...(manual.length ? ['Manual tasks (SEO and ads, Manual tasks tab):', ...manual] : [])].join('\n');
        return { success: true, summary: text, data: { text } };
      }
      case 'claim_seo_fix_batches': { const batches = claimSeoFixBatches(payload?.worker); return { success: true, summary: `Claimed ${batches.length} fix batch(es)`, data: { batches } }; }
      case 'submit_seo_triage': return submitSeoTriage(payload);
      case 'submit_seo_fix_batch': return submitSeoFixBatch(payload);
      case 'claim_seo_deploys': { const deploys = claimSeoDeploys(payload?.worker); return { success: true, summary: `Claimed ${deploys.length} deploy(s)`, data: { deploys } }; }
      case 'finish_seo_deploy': return finishSeoDeploy(payload);
      case 'queue_outreach_runs': return handleQueueOutreachRuns(payload);
      case 'claim_outreach_runs': { const runs = claimOutreachRuns(payload?.worker); return { success: true, summary: `Claimed ${runs.length} outreach run(s)`, data: { runs } }; }
      case 'submit_outreach_results': return submitOutreachResults(payload);
      case 'fail_outreach_run': return failOutreachRun(payload);
      case 'outreach_summary': return { success: true, summary: outreachSummaryText(), data: { text: outreachSummaryText() } };
      default:
        return { success: false, summary: `Unknown event type: ${eventType}` };
    }
  } catch (err) {
    console.error(`[OPENCLAW] Error executing ${eventType}:`, err);
    // The error alone is not actionable. A CHECK constraint failure prints the
    // whole allowed-values list but never the value that violated it, so two
    // rejected create_seo_audit calls (2026-08-03) discarded finished audits
    // without leaving any way to tell which audit_type OpenClaw had sent. The
    // tokens were already spent, so the payload is worth a log line.
    console.error(`[OPENCLAW] Failed payload for ${eventType}: ${safeSummarisePayload(payload)}`);
    return { success: false, summary: `Error: ${err.message}` };
  }
}

/**
 * Compact, log-safe view of a rejected payload: the identifying fields that
 * tell us which call failed, plus the key list. Deliberately excludes the bulk
 * fields (report_json, recommendations, summary) — they are large and can carry
 * scraped page content into the logs.
 */
function safeSummarisePayload(payload) {
  if (!payload || typeof payload !== 'object') return String(payload);
  const { client_id, audit_type, url, page_url, run_id, status } = payload;
  const identifiers = { client_id, audit_type, url, page_url, run_id, status };
  const named = Object.entries(identifiers)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${named || '(no identifying fields)'} | keys: ${Object.keys(payload).join(', ')}`;
}

// ============================================================
// GET PENDING ACTIONS (for debugging / admin view)
// ============================================================

/**
 * GET /api/openclaw/pending
 * List all pending actions waiting for Telegram confirmation.
 *
 * Was unauthenticated — anyone, logged in or not, could read every pending
 * action's payload (client id, requested_by email, agent type). Confirmed
 * 2026-07-30 that an OpenClaw cron was polling this route on a schedule to
 * execute run_seo_agent items directly, bypassing the admin-approval flow
 * entirely (POST /api/approval/:id/approve was never called). The withheld
 * auto_approved rows only blocked one query shape; a caller asking for
 * ?status=pending was never filtered. Authentication closes the endpoint to
 * every caller, not just that one query pattern.
 */
router.get('/pending', authenticate, authorize('admin'), (req, res) => {
  try {
    const status = req.query.status;

    // Auto-approved run_seo_agent rows are never served here.
    //
    // These are written by the admin trigger path, which ALSO calls the
    // OpenClaw hook gateway directly in the same request. When OpenClaw's
    // seo-audit-queue-poller was polling this endpoint for auto_approved
    // items, every admin trigger therefore ran twice and billed twice — and
    // the in-flight guard on seo_agent_runs cannot catch it, because the
    // poller path never reaches our backend at all.
    //
    // The poller has been disabled on OpenClaw's side (2026-07-28), but that
    // is a config flag someone could flip back. Withholding the rows makes
    // the duplicate impossible rather than merely switched off. The rows are
    // still written, and still readable through the approval history views —
    // they are just no longer a work queue anyone can pick up.
    //
    // The staff approval flow is unaffected: those rows are 'pending' until
    // an admin resolves them, and approval.js reads them directly.
    const conditions = ["NOT (action_type = 'run_seo_agent' AND status = 'auto_approved')"];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const query = `SELECT * FROM pending_actions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;

    const actions = db.prepare(query).all(...params);
    res.json({ pending_actions: actions });
  } catch (err) {
    console.error('[WEBHOOK] Pending list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/webhooks/activity (and /api/openclaw/activity)
 * List all activity logs.
 */
router.get('/activity', authenticate, (req, res) => {
  try {
    const { limit = 50, offset = 0, action } = req.query;

    let query = 'SELECT * FROM agent_activity_log';
    const params = [];

    if (action) {
      query += ' WHERE action = ?';
      params.push(action);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));

    const logs = db.prepare(query).all(...params);
    
    // Also get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM agent_activity_log';
    if (action) {
      countQuery += ' WHERE action = ?';
      const countResult = db.prepare(countQuery).get(action);
      res.json({ logs, total: countResult.count });
    } else {
      const countResult = db.prepare(countQuery).get();
      res.json({ logs, total: countResult.count });
    }

  } catch (err) {
    console.error('[WEBHOOK] Activity log fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;
