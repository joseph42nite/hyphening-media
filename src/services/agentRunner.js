/**
 * Starts SEO agent runs.
 *
 * Both entry points that can start an agent — the admin auto-approve path in
 * routes/seo.js and the approval path in routes/approval.js — go through
 * startAgentRun, so neither can bypass the in-flight dedupe guard.
 */

import { createRun } from './agentRuns.js';

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
export function startAgentRun({ clientId, agentType, model, requestedBy, pendingActionId = null, agentId = null, competitorDomain = null }) {
  const { run, conflict } = createRun({ clientId, agentType, model, requestedBy, pendingActionId, agentId, competitorDomain });
  if (conflict) return { conflict };

  console.log(`[AGENT] Run #${run.id} (${agentType}) queued for a worker.`);
  return { run };
}
