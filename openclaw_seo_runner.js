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

// Historical note, not a working mechanism: sending a different `agentId` in
// the hook payload does not change which model runs. OpenClaw confirmed
// 2026-07-30 that /hooks/agent accepts the field but never routes on it —
// every call executes on 'main' regardless. Still sent below in case that
// changes later; nothing currently depends on it.
const OPENCLAW_AGENT_ID = args.agentId || process.env.OPENCLAW_AGENT_ID || 'main';

// The actual lever: OpenClaw's chat-model-switch plugin reads the model's own
// name out of the prompt text and overrides the session's model for that call.
// Always set explicitly — never omit it and rely on "no phrase = default" —
// because the plugin remembers the last model mentioned per session, and we
// don't yet know whether separate hook calls share a session. Naming the
// model every time removes that ambiguity regardless of how sessions work
// underneath. Unverified for hook-triggered runs as of 2026-07-30; confirm
// with a real run and actual_model before trusting it broadly.
//
// Default is 'nemotron ultra' because 'main' was switched to Nemotron
// (2026-07-30) — this restates the default rather than assuming it, in case
// this call's session inherited a different model from an earlier mention.
const MODEL_PHRASE = args.modelPhrase || 'nemotron ultra';

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
  console.log(`[GATEWAY]   - Model hint in message: "${MODEL_PHRASE}" (via chat-model-switch plugin — unverified for hook-triggered runs)`);
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
  // The trailing clause is the chat-model-switch plugin's trigger — it scans
  // this text for a model name and overrides the session's model to match.
  // Phrased in the plugin's own documented style ("use X for this one").
  const userMessage = `seo ${agentType === 'full' ? 'audit' : agentType} ${targetUrl} [client_id:${clientId}]${runId ? ` [run_id:${runId}]` : ''} — use ${MODEL_PHRASE} for this one.`;

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