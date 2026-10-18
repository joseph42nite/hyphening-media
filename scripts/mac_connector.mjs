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
};

function runWorker(kind) {
  const spec = WORKERS[kind];
  if (!spec) {
    console.error(`[MAC CONNECTOR] Unknown run kind: ${kind}`);
    return;
  }
  console.log(`[MAC CONNECTOR] Running ${kind} worker...`);
  const child = spawn(spec.cmd, spec.args, { cwd: REPO_ROOT, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[MAC CONNECTOR] ${kind} worker exited with code ${code}.`);
  });
}

let stopping = false;

function connect() {
  const socket = new WebSocket(WS_URL);

  socket.on('open', () => {
    console.log('[MAC CONNECTOR] Connected to Ops Center.');
    // Catch up anything queued while we were offline.
    runWorker('seo');
    runWorker('ads');
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
    if (stopping) return;
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
