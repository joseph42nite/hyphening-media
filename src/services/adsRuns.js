/**
 * Lifecycle for ads agent runs.
 *
 * Deliberately the same state machine as seo_agent_runs — queued -> running ->
 * terminal, with the in-flight slot claimed by a partial unique index rather
 * than by anything in memory. That design is not copied for symmetry; it is
 * copied because every part of it was paid for by a specific failure on the SEO
 * side: a refresh re-queueing a paid run, a server restart stranding a run as
 * permanently `running` and blocking its agent for ever, a late result closing a
 * live card.
 *
 * What is NOT copied is the orphaned-cancelled-run claiming. Ads runs are
 * minutes of analysis over a fact pack rather than a long crawl, and every one
 * of them carries our run_id, so the ambiguity that machinery resolves does not
 * arise here. It can be added if the worker ever starts dropping the id.
 */

import db from '../../database.js';
import { registerPendingAudit, clearPendingAudit } from './pendingAudits.js';

const IN_FLIGHT = ['queued', 'running'];
const MINUTE = 60 * 1000;

// Ads runs are a single model call over a pre-computed pack, so these are
// minutes rather than the SEO fleet's tens of minutes. Still sized for the
// slowest model in the fallback chain, not the fastest: marking a live run dead
// lets a second, duplicate one start, while being generous only delays freeing
// a slot nothing is waiting for.
const TIMEOUT_MINUTES = new Map([
  ['full', 20],       // runs every section
  ['report', 12],     // long-form prose
  ['creative', 10],
  ['landing', 10],
]);
const DEFAULT_TIMEOUT_MIN = 8;

export function timeoutMsFor(agentType) {
  return (TIMEOUT_MINUTES.get(agentType) ?? DEFAULT_TIMEOUT_MIN) * MINUTE;
}

// SQLite's datetime('now') is UTC with no zone marker, which Date() would
// otherwise read as local time — hours of phantom elapsed time on both the
// timeout and the dashboard's counter.
function parseSqliteTime(value) {
  if (!value) return NaN;
  return new Date(`${value.replace(' ', 'T')}Z`).getTime();
}

function broadcast(eventType, data) {
  // Dynamic import: server.js imports the routes that import this module, so a
  // static import would close the cycle.
  import('../../server.js')
    .then(({ broadcastEvent }) => broadcastEvent(eventType, data))
    .catch(err => console.error(`[ADS RUNS] Broadcast ${eventType} failed:`, err));
}

export function broadcastRunStatus(run, extra = {}) {
  broadcast('ads_agent_status', {
    clientId: run.client_id,
    agentType: run.agent_type,
    runId: run.id,
    status: run.status,
    ...extra,
  });
}

export function broadcastRunLog(run, log) {
  broadcast('ads_agent_log', {
    clientId: run.client_id,
    agentType: run.agent_type,
    runId: run.id,
    log,
  });
}

export function getRun(runId) {
  return db.prepare('SELECT * FROM ads_agent_runs WHERE id = ?').get(runId);
}

export function getActiveRun(clientId, agentType) {
  return db.prepare(`
    SELECT * FROM ads_agent_runs
    WHERE client_id = ? AND agent_type = ? AND status IN ('queued','running')
  `).get(clientId, agentType);
}

/** Every in-flight run for a client, keyed by agent type — hydrates the cards
 *  from the database so a refresh shows "Running", not a second Run button. */
export function getActiveRunsForClient(clientId) {
  const rows = db.prepare(`
    SELECT * FROM ads_agent_runs WHERE client_id = ? AND status IN ('queued','running')
  `).all(clientId);
  return new Map(rows.map(r => [r.agent_type, r]));
}

export function listQueue({ recentLimit = 20 } = {}) {
  const active = db.prepare(`
    SELECT r.*, c.name AS client_name
    FROM ads_agent_runs r LEFT JOIN crm_clients c ON c.id = r.client_id
    WHERE r.status IN ('queued','running')
    ORDER BY r.created_at ASC
  `).all();

  const recent = db.prepare(`
    SELECT r.*, c.name AS client_name
    FROM ads_agent_runs r LEFT JOIN crm_clients c ON c.id = r.client_id
    WHERE r.status NOT IN ('queued','running')
    ORDER BY r.finished_at DESC, r.created_at DESC
    LIMIT ?
  `).all(recentLimit);

  return { active, recent };
}

/**
 * Claim the in-flight slot. Returns { run } or { conflict } — the unique index
 * decides atomically, so two racing requests cannot both win and bill twice.
 */
export function createRun({ clientId, agentType, periodMonth = null, model = null, requestedBy = null, triggerSource = 'manual', pendingActionId = null }) {
  try {
    const result = db.prepare(`
      INSERT INTO ads_agent_runs (client_id, agent_type, status, period_month, model, requested_by, trigger_source, pending_action_id)
      VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)
    `).run(clientId, agentType, periodMonth, model, requestedBy, triggerSource, pendingActionId);

    const run = getRun(result.lastInsertRowid);
    broadcastRunStatus(run);
    return { run };
  } catch (err) {
    const isDuplicate = err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || /UNIQUE constraint failed/i.test(err.message || '');
    if (isDuplicate) return { conflict: getActiveRun(clientId, agentType) };
    throw err;
  }
}

/** A worker claimed the run and is executing it. */
export function markRunning(runId, worker = null) {
  db.prepare(`
    UPDATE ads_agent_runs
    SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
        actual_model = COALESCE(actual_model, ?)
    WHERE id = ? AND status = 'queued'
  `).run(worker ? `worker:${worker}` : null, runId);
  const run = getRun(runId);
  if (run) broadcastRunStatus(run);
  return run;
}

/** Terminal state. Only advances a run still in flight, so a late result
 *  cannot resurrect one the operator already cancelled. */
export function finishRun(runId, status, { error = null, auditId = null, actualModel = null } = {}) {
  const result = db.prepare(`
    UPDATE ads_agent_runs
    SET status = ?, finished_at = datetime('now'), error = ?,
        audit_id = COALESCE(?, audit_id),
        actual_model = COALESCE(?, actual_model)
    WHERE id = ? AND status IN ('queued','running')
  `).run(status, error, auditId, actualModel, runId);

  if (result.changes === 0) return null;

  const run = getRun(runId);
  clearPendingAudit(run.client_id, `ads:${run.agent_type}`);
  broadcastRunStatus(run, { error });
  return run;
}

export function finishActiveRunFor(clientId, agentType, status, opts = {}) {
  const run = getActiveRun(clientId, agentType);
  if (!run) return null;
  return finishRun(run.id, status, opts);
}

export function cancelRun(runId, cancelledBy = null) {
  const run = getRun(runId);
  if (!run) return { error: 'not_found' };
  if (!IN_FLIGHT.includes(run.status)) return { error: 'not_in_flight', run };

  broadcastRunLog(run, `[SYSTEM] Run cancelled by ${cancelledBy || 'operator'}. The queue slot is free. A run already claimed by a worker keeps going and keeps spending until it finishes; its result will be stored but will not reopen this card.`);
  return { run: finishRun(runId, 'cancelled', { error: `Cancelled by ${cancelledBy || 'operator'}` }) };
}

/** Arms the "the worker never reported back" fallback.
 *  Namespaced 'ads:' so an ads agent and an SEO agent with the same name for
 *  the same client cannot cancel each other's timer. */
export function armTimeout(run, overrideMs = null) {
  registerPendingAudit(run.client_id, `ads:${run.agent_type}`, () => {
    const current = getRun(run.id);
    if (!current || !IN_FLIGHT.includes(current.status)) return;
    broadcastRunLog(current, '[TIMEOUT] No result received from the worker within the expected window.');
    finishRun(run.id, 'timed_out', { error: 'No create_ads_audit webhook received before the timeout window elapsed.' });
  }, overrideMs ?? timeoutMsFor(run.agent_type));
}

/**
 * Timers are in-memory, so without this a restart strands every in-flight run
 * as permanently `running` — and a stranded run holds the unique index slot,
 * which blocks that agent from ever being triggered again.
 */
export function recoverInFlightRuns() {
  let reArmed = 0;
  let expired = 0;

  for (const run of db.prepare(`SELECT * FROM ads_agent_runs WHERE status IN ('queued','running')`).all()) {
    const startedMs = parseSqliteTime(run.started_at || run.created_at);
    const elapsed = Number.isNaN(startedMs) ? Infinity : Date.now() - startedMs;
    const remaining = timeoutMsFor(run.agent_type) - elapsed;

    if (remaining <= 0) {
      finishRun(run.id, 'timed_out', { error: 'Server restarted and the run was already past its timeout window.' });
      expired++;
    } else {
      armTimeout(run, remaining);
      reArmed++;
    }
  }

  if (reArmed || expired) {
    console.log(`[ADS RUNS] Recovered in-flight runs: ${reArmed} re-armed, ${expired} expired.`);
  }
  return { reArmed, expired };
}
