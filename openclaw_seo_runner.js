/**
 * openclaw_seo_runner.js
 * Triggers an OpenClaw agent by calling the OpenClaw API Gateway.
 * This script is spawned by the main backend when an SEO audit is approved.
 */

import db from './database.js';

// --- Configuration ---
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789/hooks/agent';
// OpenClaw documents hooks.token and gateway.auth.token as separate values,
// hence the separate names. Confirmed 2026-07-28 that this deployment uses the
// same value for both, so OPENCLAW_GATEWAY_TOKEN is accepted as a fallback —
// without it the runner exits before ever reaching the gateway.
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '';

// --- Argument Parsing ---
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i].replace(/^--/, '');
  const val = process.argv[i+1];
  args[flag] = val;
}

const clientId = parseInt(args.clientId);
const agentType = args.skill || 'technical';
const model = args.model || 'primary'; // Use 'primary' as per the new API spec
const triggeredBy = args.triggeredBy || 'system';
const runId = args.runId || null; // our seo_agent_runs.id, for webhook correlation

// This field DOES route, and getting it wrong silently breaks every audit.
//
// It was documented here as inert — OpenClaw stated 2026-07-30 that
// /hooks/agent accepts `agentId` but always executes on 'main'. That was true
// only because no other agent existed yet. OpenClaw created a 'seo' agent later
// that same day, and from then on every run we sent with agentId='seo' landed
// in it. That agent is a bare workspace: no hyphening-ops-api skill, no webhook
// config. It ran the audits, wrote local files, and never POSTed anything back,
// so runs 4, 5, 8 and 9 all timed out waiting for create_seo_audit.
//
// Only name an agent that is provisioned with the Hyphening API skills. 'main'
// is the one known to be. Before pointing this at anything else, confirm the
// target agent can reach POST /api/openclaw/webhook — a run that never calls
// back is indistinguishable from a hung one for 20 minutes.
const OPENCLAW_AGENT_ID = args.agentId || process.env.OPENCLAW_AGENT_ID || 'main';

// Optional model override, read by OpenClaw's chat-model-switch plugin out of
// the prompt text. Null by default: we do NOT name a model, and the run uses
// whatever the agent's own primary is.
//
// This briefly defaulted to 'nemotron ultra' while 'main' was configured as
// Nemotron. That was reverted 2026-07-30 — Nemotron's free tier returned
// ResourceExhausted (32/32) under real load and killed runs outright rather
// than degrading, so forcing it from here made audits fail. Naming no model
// keeps this out of the way of whatever the agent is configured with.
//
// Still wired for a deliberate per-skill override: set agent_run_config
// .agent_id (see scripts/set_agent_routing.js) and the phrase is appended.
const MODEL_PHRASE = args.modelPhrase || null;

// Unique per run so each audit starts from a clean context. Prefixed 'hook:'
// to satisfy hooks.allowedSessionKeyPrefixes. runId is our seo_agent_runs.id
// and already unique; the timestamp fallback only matters for manual CLI runs
// invoked without --runId.
const SESSION_KEY = runId
  ? `hook:seo:run-${runId}`
  : `hook:seo:${agentType}-${clientId}-${Date.now()}`;

// --- Validation ---
if (isNaN(clientId)) {
  console.error('[RUNNER] Error: --clientId is required.');
  process.exit(1);
}
if (!OPENCLAW_HOOK_TOKEN) {
  console.error('[RUNNER] Error: OPENCLAW_HOOK_TOKEN environment variable is not set.');
  process.exit(1);
}

// --- Client & URL Lookup ---
const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(clientId);
if (!client) {
  console.error(`[RUNNER] Error: Client #${clientId} not found.`);
  process.exit(1);
}
const targetUrl = client.website_url;
if (!targetUrl) {
  console.error(`[RUNNER] Error: Client website_url is not configured.`);
  process.exit(1);
}

/**
 * Calls the OpenClaw hook endpoint to wake the SEO agent.
 * @param {string} userMessage The message to send to the agent.
 */
async function askOpenClaw(userMessage) {
  console.log(`[GATEWAY] Sending request to OpenClaw hook endpoint...`);
  console.log(`[GATEWAY]   - URL: ${OPENCLAW_GATEWAY_URL}`);
  console.log(`[GATEWAY]   - Message: "${userMessage}"`);
  console.log(`[GATEWAY]   - Model: ${MODEL_PHRASE ? `"${MODEL_PHRASE}" requested in message via chat-model-switch plugin` : 'not specified — the agent\'s own primary decides'}`);
  console.log(`[GATEWAY]   - Session key: ${SESSION_KEY} (isolates this run; ignored unless OpenClaw sets hooks.allowRequestSessionKey)`);
  console.log(`[GATEWAY]   - agentId field sent: ${OPENCLAW_AGENT_ID} (confirmed inert for routing as of 2026-07-30 — kept in case that changes)`);

  try {
    const response = await fetch(OPENCLAW_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENCLAW_HOOK_TOKEN}`
      },
      body: JSON.stringify({
        message: userMessage,
        name: `SEO ${agentType} — client #${clientId}`,
        agentId: OPENCLAW_AGENT_ID,
        // One fresh session per run, rather than every SEO run sharing
        // OpenClaw's hooks.defaultSessionKey ("hook:ingress"). Sharing one
        // session means each run loads every previous run's transcript as
        // context: growing token cost (observed inputs up to 35k), one
        // client's audit visible while auditing another, and — most likely —
        // the model seeing earlier successful webhook submissions in history
        // and reporting one it never made.
        //
        // Requires hooks.allowRequestSessionKey=true and a matching entry in
        // hooks.allowedSessionKeyPrefixes on OpenClaw's side; until those are
        // set this field is silently ignored and behaviour is unchanged.
        sessionKey: SESSION_KEY,
        wakeMode: "now",
        deliver: false
      })
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}: ${rawBody}`);
    }

    // Confirmed shape: { "ok": true, "runId": "<uuid>" }
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed?.runId) {
        console.log(`[GATEWAY] OpenClaw accepted the request. Run ID: ${parsed.runId}`);
        // Machine-readable line: the spawning parent scrapes this to store the
        // gateway's runId against our seo_agent_runs record, which is what
        // ties our job to OpenClaw's.
        console.log(`[RUNID] ${parsed.runId}`);
      }
    } catch {
      // Non-JSON response body — fall back to logging the raw text below.
    }

    return rawBody || 'accepted';
  } catch (error) {
    console.error('[GATEWAY] Error calling OpenClaw hook endpoint:', error.message);
    return null;
  }
}

/**
 * Main execution function.
 */
async function run() {
  console.log(`[INIT] Initializing '${agentType}' agent request for target: ${targetUrl}`);

  // run_id lets OpenClaw echo the exact job back in create_seo_audit. Without
  // it we can only correlate on client_id + audit_type, which is ambiguous the
  // moment a scheduled run overlaps a manual one for the same skill.
  //
  // No model is named unless one was explicitly requested. The trailing clause,
  // when present, is the chat-model-switch plugin's trigger — it scans this
  // text for a model name and overrides the session's model to match.
  const modelClause = MODEL_PHRASE ? ` — use ${MODEL_PHRASE} for this one.` : '';
  const userMessage = `seo ${agentType === 'full' ? 'audit' : agentType} ${targetUrl} [client_id:${clientId}]${runId ? ` [run_id:${runId}]` : ''}${modelClause}`;

  const confirmation = await askOpenClaw(userMessage);

  if (confirmation) {
    console.log(`[GATEWAY] Response from OpenClaw: "${confirmation}"`);
    console.log('[SUCCESS] Agent triggered successfully. Results will be delivered via webhook.');
    process.exit(0);
  } else {
    console.error('[FAILURE] Failed to trigger agent via API Gateway.');
    process.exit(1);
  }
}

run();