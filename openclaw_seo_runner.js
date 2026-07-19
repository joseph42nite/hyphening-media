/**
 * openclaw_seo_runner.js
 * Triggers an OpenClaw agent by calling the OpenClaw API Gateway.
 * This script is spawned by the main backend when an SEO audit is approved.
 */

import db from './database.js';

// --- Configuration ---
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789/hooks/agent';
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || '';

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
  console.log(`[GATEWAY]   - Requested model: ${model} (not sent — OpenClaw confirmed model selection is fully determined by its own per-skill config)`);

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
        agentId: "main",
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

  const userMessage = `seo ${agentType === 'full' ? 'audit' : agentType} ${targetUrl} [client_id:${clientId}]`;

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