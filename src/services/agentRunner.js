/**
 * Spawns the OpenClaw hand-off process for a claimed SEO agent run.
 *
 * Both entry points that can start an agent — the admin auto-approve path in
 * routes/seo.js and the approval path in routes/approval.js — go through
 * startAgentRun, so neither can bypass the in-flight dedupe guard.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRun,
  markRunning,
  attachOpenClawRunId,
  finishRun,
  getRun,
  armTimeout,
  broadcastRunLog
} from './agentRuns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The runner echoes the gateway's runId on stdout so the parent can store it
// against the run record without the runner needing any schema knowledge.
const RUNID_LINE = /^\[RUNID\]\s+(\S+)/;

// Which model-name phrase to embed in the trigger message, driven by
// agent_run_config.agent_id — the same per-skill column originally built for
// agent-level HTTP dispatch (confirmed inert 2026-07-30; OpenClaw never
// routed on it). Repurposed as the input to the chat-model-switch plugin,
// which reads a model's name out of the prompt text instead. 'main' is now
// configured as Nemotron, so that is the default; 'kimi' is for skills marked
// as creative work, where Kimi's strengths are a better fit than a reasoning
// model tuned for analysis.
function modelPhraseFor(agentId) {
  if (agentId === 'kimi') return 'kimi';
  return 'nemotron ultra';
}

/**
 * Spawns the runner for an already-claimed run record. Every log line and
 * status change carries run.id, so the dashboard buckets output per job
 * instead of merging two runs of the same skill into one stream.
 */
export function spawnAgent(run, model) {
  const runnerPath = path.resolve(__dirname, '../../openclaw_seo_runner.js');
  const args = [
    runnerPath,
    '--clientId', String(run.client_id),
    '--skill', run.agent_type,
    '--model', model || 'primary',
    '--triggeredBy', run.requested_by || 'system',
    '--runId', String(run.id),
    // Always explicit — never omit this and rely on default resolution,
    // since the plugin remembers the last model named per session and we
    // don't know whether separate hook calls share one.
    '--modelPhrase', modelPhraseFor(run.agent_id)
  ];

  // Kept for the (currently theoretical) case OpenClaw wires real agent-level
  // dispatch later — inert today, does not affect which model runs.
  if (run.agent_id) args.push('--agentId', run.agent_id);

  console.log(`[AGENT RUNNER] Spawning: node ${args.join(' ')}`);

  const child = spawn(process.execPath || 'node', args, {
    cwd: path.resolve(__dirname, '../..')
  });

  const emit = (line, isError = false) => {
    const match = RUNID_LINE.exec(line.trim());
    if (match) attachOpenClawRunId(run.id, match[1]);
    broadcastRunLog(run, isError ? `[ERROR] ${line}` : line);
  };

  let stdoutBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) emit(line);
    }
  });

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) emit(line, true);
    }
  });

  child.on('close', (code) => {
    if (stdoutBuffer.trim()) emit(stdoutBuffer);
    if (stderrBuffer.trim()) emit(stderrBuffer, true);

    // The operator may have cancelled while the hand-off was still in flight.
    const current = getRun(run.id);
    if (!current || (current.status !== 'queued' && current.status !== 'running')) return;

    if (code === 0) {
      // The hand-off succeeded — the actual audit is still running on
      // OpenClaw's side. Move to 'running' and wait for the create_seo_audit
      // webhook; the timeout is the fallback for when it never arrives.
      broadcastRunLog(run, '[SYSTEM] Trigger accepted by OpenClaw. Awaiting audit results...');
      markRunning(run.id);
      armTimeout(run);
    } else {
      finishRun(run.id, 'failed', { error: `Runner exited with code ${code}` });
    }
  });

  child.on('error', (err) => {
    console.error(`[AGENT RUNNER] Spawn failed for ${run.agent_type}:`, err);
    broadcastRunLog(run, `[SYSTEM ERROR] Failed to spawn agent: ${err.message}`);
    finishRun(run.id, 'failed', { error: `Failed to spawn runner: ${err.message}` });
  });

  return child;
}

/**
 * True once OpenClaw exposes an abort route and it is configured here.
 * Until then cancelling only frees our slot — the job runs to completion and
 * keeps spending — so the dashboard wording depends on this.
 */
export function isAbortSupported() {
  return !!process.env.OPENCLAW_ABORT_URL;
}

/**
 * Asks OpenClaw to abort a run that is still executing.
 *
 * OpenClaw confirmed (2026-07-28) that aborting emits no terminal webhook and
 * discards partial work. Neither matters here: we initiate the abort, so we
 * already know it happened and mark the run cancelled ourselves — there is
 * nothing to wait for. Discarded partial work is what cancelling means, and
 * it also guarantees no late result arrives to be misattributed.
 *
 * Never throws: a failed abort must not block the cancel, which still has to
 * free the queue slot.
 */
export async function abortOpenClawRun(run) {
  const endpoint = process.env.OPENCLAW_ABORT_URL;
  if (!endpoint) return { ok: false, reason: 'not_configured' };
  if (!run.openclaw_run_id) return { ok: false, reason: 'no_openclaw_run_id' };

  // {runId} is substituted if present, otherwise the id is appended.
  const url = endpoint.includes('{runId}')
    ? endpoint.replace('{runId}', encodeURIComponent(run.openclaw_run_id))
    : `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(run.openclaw_run_id)}/abort`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Same token fallback as the runner — see openclaw_seo_runner.js.
        Authorization: `Bearer ${process.env.OPENCLAW_HOOK_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || ''}`
      },
      body: JSON.stringify({ runId: run.openclaw_run_id, reason: 'cancelled_from_dashboard' })
    });

    const body = await res.text();
    if (!res.ok) {
      return { ok: false, reason: `gateway_${res.status}`, detail: body.slice(0, 200) };
    }
    return { ok: true, detail: body.slice(0, 200) };
  } catch (err) {
    return { ok: false, reason: 'request_failed', detail: err.message };
  }
}

/**
 * Claims the in-flight slot and, if it was free, spawns the runner.
 * Returns { run } on success or { conflict } when that client+agent already
 * has a run in flight — the caller should surface a 409 rather than spend.
 */
export function startAgentRun({ clientId, agentType, model, requestedBy, pendingActionId = null, agentId = null }) {
  const { run, conflict } = createRun({ clientId, agentType, model, requestedBy, pendingActionId, agentId });
  if (conflict) return { conflict };

  spawnAgent(run, model);
  return { run };
}
