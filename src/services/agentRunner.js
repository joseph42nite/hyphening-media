/**
 * Starts SEO agent runs.
 *
 * Both entry points that can start an agent — the admin auto-approve path in
 * routes/seo.js and the approval path in routes/approval.js — go through
 * startAgentRun, so neither can bypass the in-flight dedupe guard.
 */

import { createRun } from './agentRuns.js';

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
 * Claims the in-flight slot and queues the run for a worker.
 *
 * Returns { run } on success or { conflict } when that client+agent already has
 * a run in flight — the caller should surface a 409 rather than spend.
 *
 * Nothing is spawned. The SEO worker claims queued runs over the signed webhook
 * (claim_seo_runs), which inverts the dependency: no tunnel into a machine we
 * do not control, and a worker that was offline collects its backlog on waking
 * rather than the work being lost.
 */
export function startAgentRun({ clientId, agentType, model, requestedBy, pendingActionId = null, agentId = null }) {
  const { run, conflict } = createRun({ clientId, agentType, model, requestedBy, pendingActionId, agentId });
  if (conflict) return { conflict };

  console.log(`[AGENT] Run #${run.id} (${agentType}) queued for a worker.`);
  return { run };
}
