#!/usr/bin/env node
/**
 * Mac-side half of the push channel in src/services/macConnector.js.
 *
 * Dials out to the Ops Center's WebSocket endpoint (outbound only — nothing
 * on this machine needs to be reachable from the internet) and holds the
 * connection open. On a 'run' message it shells out to the matching worker's
 * --once pass, same as a human running it from the terminal.
 *
 * Runs a catch-up pass for both workers immediately on connect, so a run
 * queued while this was offline (asleep, outside the 11am-6pm window) gets
 * drained the moment the window opens instead of needing a fresh click.
 *
 * Env (from .env, same file the workers already read):
 *   HYPHENING_API_URL      Ops Center base URL (default http://localhost:3000)
 *   MAC_CONNECTOR_SECRET   shared token, verified by macConnector.js (required)
 *
 * Usage: node scripts/mac_connector.mjs
 * Stop with SIGTERM/SIGINT — exits cleanly, no cleanup needed.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import WebSocket from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const API = (process.env.HYPHENING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.MAC_CONNECTOR_SECRET;
const WS_URL = `${API.replace(/^http/, 'ws')}/ws/mac-connector?token=${encodeURIComponent(SECRET || '')}`;

if (!SECRET) {
  console.error('[MAC CONNECTOR] MAC_CONNECTOR_SECRET is not set in .env — refusing to start.');
  process.exit(1);
}

const WORKERS = {
  seo: { cmd: 'node', args: ['scripts/seo_worker.mjs', '--once'] },
  ads: { cmd: 'node', args: ['plugins/hyphening-ads/scripts/ads_worker.mjs', '--once'] },
  blog: { cmd: 'node', args: ['scripts/blog_worker.mjs', '--once'] },
  seo_fix: { cmd: 'node', args: ['scripts/seo_fix_worker.mjs', '--once'] },
  deploy: { cmd: 'node', args: ['scripts/deploy_worker.mjs', '--once'] },
  outreach: { cmd: 'node', args: ['scripts/outreach_worker.mjs', '--once'] },
};

function runWorker(kind) {
  const spec = WORKERS[kind];
  if (!spec) {
    console.error(`[MAC CONNECTOR] Unknown run kind: ${kind}`);
    return;
  }
  // The blog worker drains the whole queue and can run for hours, so a second
  // signal while it's busy is already covered; starting another would race it
  // for Claude and the Kokoro lock.
  // The same goes for the fix and deploy workers: each drains its whole queue,
  // and two of them at once would fight over the same git worktrees.
  if (SINGLE_RUN.has(kind) && running.has(kind)) {
    console.log(`[MAC CONNECTOR] ${kind} worker already running; it will pick the new run up.`);
    return;
  }
  console.log(`[MAC CONNECTOR] Running ${kind} worker...`);
  const child = spawn(spec.cmd, spec.args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (SINGLE_RUN.has(kind)) running.add(kind);
  child.on('exit', (code) => {
    running.delete(kind);
    console.log(`[MAC CONNECTOR] ${kind} worker exited with code ${code}.`);
  });
}

const SINGLE_RUN = new Set(['blog', 'seo_fix', 'deploy', 'outreach']);
const running = new Set();

let stopping = false;

// Heartbeat: a socket killed while the laptop slept (or by a server restart)
// never fires 'close' on this side, so ping regularly and terminate on a
// missed pong. A timer-drift check also catches wake-from-sleep right away.
const PING_MS = 20000;
const WAKE_GAP_MS = 45000;

function connect() {
  const socket = new WebSocket(WS_URL);
  let alive = true;
  let lastTick = Date.now();
  let retryScheduled = false;

  const heartbeat = setInterval(() => {
    const now = Date.now();
    const slept = now - lastTick > WAKE_GAP_MS;
    lastTick = now;
    if (socket.readyState !== WebSocket.OPEN) return;
    if (slept || !alive) {
      console.log(`[MAC CONNECTOR] ${slept ? 'Woke from sleep' : 'Missed pong'}, reconnecting...`);
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, PING_MS / 4);

  socket.on('pong', () => { alive = true; });

  socket.on('open', () => {
    console.log('[MAC CONNECTOR] Connected to Ops Center.');
    // Catch up anything queued while we were offline.
    runWorker('seo');
    runWorker('ads');
    runWorker('blog');
    runWorker('seo_fix');
    runWorker('deploy');
    runWorker('outreach');
  });

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'run') runWorker(msg.kind);
    } catch (err) {
      console.error('[MAC CONNECTOR] Bad message:', err.message);
    }
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    if (stopping || retryScheduled) return;
    retryScheduled = true;
    console.log('[MAC CONNECTOR] Disconnected, retrying in 5s...');
    setTimeout(connect, 5000);
  });

  socket.on('error', (err) => {
    console.error('[MAC CONNECTOR] Connection error:', err.message);
  });
}

process.on('SIGTERM', () => { stopping = true; process.exit(0); });
process.on('SIGINT', () => { stopping = true; process.exit(0); });

connect();
