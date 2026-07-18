/**
 * openclaw_remote_daemon.js
 * Run this daemon script on your remote OpenClaw server.
 * It polls the website backend's pending actions queue, detects approved audits,
 * and automatically triggers the claude-seo skill command line in Claude Code.
 */

import { spawn } from 'child_process';

const API_URL = process.env.HYPHENING_API_URL || 'https://hypheningmedia.com';
const POLL_INTERVAL_MS = 10000; // Polls every 10 seconds

// Track processed action IDs to prevent duplicate runs in the same session
const processedActions = new Set();

console.log(`[DAEMON] Starting OpenClaw Remote Queue Listener...`);
console.log(`[DAEMON] Polling backend at: ${API_URL}`);

async function checkQueue() {
  try {
    const response = await fetch(`${API_URL}/api/openclaw/pending?status=auto_approved`);
    if (!response.ok) {
      console.error(`[DAEMON] Failed to fetch queue. Status: ${response.status}`);
      return;
    }

    const { pending_actions } = await response.json();
    if (!Array.isArray(pending_actions)) return;

    // Filter for active trigger requests
    const runs = pending_actions.filter(
      (a) => a.action_type === 'run_seo_agent' && !processedActions.has(a.id)
    );

    for (const run of runs) {
      processedActions.add(run.id);
      
      const payload = JSON.parse(run.action_payload);
      const agentType = payload.agentType || 'technical';
      const targetUrl = payload.url;
      const cmdSkill = agentType === 'full' ? 'audit' : agentType;

      const message = `seo ${cmdSkill} ${targetUrl}`;
      console.log(`\n[TRIGGER] Received approved run #${run.id}: ${agentType} on ${targetUrl}`);
      console.log(`[DAEMON] Sending message: openclaw message send --channel telegram --target 6439186232 --message "${message}"`);

      // Spawn OpenClaw with stdio: inherit to stream interactive logs directly
      const child = spawn('openclaw', [
        'message',
        'send',
        '--channel',
        'telegram',
        '--target',
        '6439186232',
        '--message',
        message
      ], {
        shell: true,
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        console.log(`[DAEMON] Run #${run.id} finished with code ${code}.`);
      });
    }
  } catch (err) {
    console.error(`[DAEMON] Network error:`, err.message);
  }
}

// Start polling loop
setInterval(checkQueue, POLL_INTERVAL_MS);
checkQueue();
