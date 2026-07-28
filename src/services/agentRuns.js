/**
 * Lifecycle for SEO agent runs handed off to OpenClaw.
 *
 * Every trigger claims a row in seo_agent_runs first. That row — not React
 * state, not an in-memory Map — is the single source of truth for "is this
 * agent already in flight?", which is what makes a second click cheap
 * (rejected) instead of expensive (a duplicate audit billed twice).
 */

import db from '../../database.js';
import { registerPendingAudit, clearPendingAudit, timeoutMsFor } from './pendingAudits.js';


const IN_FLIGHT = ['queued', 'running'];

// SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC with no zone
// marker, which Date() would otherwise read as local time.
function parseSqliteTime(value) {
  if (!value) return NaN;
  return new Date(`${value.replace(' ', 'T')}Z`).getTime();
}

function broadcast(eventType, data) {
  // Dynamic import: server.js imports the routes that import this module, so
  // a static import would close the cycle.
  import('../../server.js')
    .then(({ broadcastEvent }) => broadcastEvent(eventType, data))
    .catch(err => console.error(`[AGENT RUNS] Broadcast ${eventType} failed:`, err));
}

/** Emits the status shape the dashboard cards and terminal tabs listen for. */
export function broadcastRunStatus(run, extra = {}) {
  broadcast('seo_agent_status', {
    clientId: run.client_id,
    agentType: run.agent_type,
    runId: run.id,
    status: run.status,
    ...extra
  });
}

export function broadcastRunLog(run, log) {
  broadcast('seo_agent_log', {
    clientId: run.client_id,
    agentType: run.agent_type,
    runId: run.id,
    log
  });
}

export function getRun(runId) {
  return db.prepare('SELECT * FROM seo_agent_runs WHERE id = ?').get(runId);
}

/** The queued/running run for this client+agent, if any. At most one exists. */
export function getActiveRun(clientId, agentType) {
  return db.prepare(`
    SELECT * FROM seo_agent_runs
    WHERE client_id = ? AND agent_type = ? AND status IN ('queued','running')
  `).get(clientId, agentType);
}

/** Every in-flight run for a client, keyed by agent type — used to hydrate cards. */
export function getActiveRunsForClient(clientId) {
  const rows = db.prepare(`
    SELECT * FROM seo_agent_runs
    WHERE client_id = ? AND status IN ('queued','running')
  `).all(clientId);
  return new Map(rows.map(r => [r.agent_type, r]));
}

/** Global queue view: everything in flight, plus recent history for context. */
export function listQueue({ includeRecent = true, recentLimit = 20 } = {}) {
  const active = db.prepare(`
    SELECT r.*, c.name AS client_name
    FROM seo_agent_runs r
    LEFT JOIN crm_clients c ON c.id = r.client_id
    WHERE r.status IN ('queued','running')
    ORDER BY r.created_at ASC
  `).all();

  if (!includeRecent) return { active, recent: [] };

  const recent = db.prepare(`
    SELECT r.*, c.name AS client_name
    FROM seo_agent_runs r
    LEFT JOIN crm_clients c ON c.id = r.client_id
    WHERE r.status NOT IN ('queued','running')
    ORDER BY r.finished_at DESC, r.created_at DESC
    LIMIT ?
  `).all(recentLimit);

  return { active, recent };
}

/**
 * Claim the in-flight slot for this client+agent.
 * Returns { run } on success, or { conflict } if one is already in flight —
 * the partial unique index makes that decision atomically, so two racing
 * requests cannot both win.
 */
export function createRun({ clientId, agentType, model, requestedBy, pendingActionId = null }) {
  try {
    const result = db.prepare(`
      INSERT INTO seo_agent_runs (client_id, agent_type, status, model, requested_by, pending_action_id)
      VALUES (?, ?, 'queued', ?, ?, ?)
    `).run(clientId, agentType, model || null, requestedBy || null, pendingActionId);

    const run = getRun(result.lastInsertRowid);
    broadcastRunStatus(run);
    return { run };
  } catch (err) {
    const isDuplicate = err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || /UNIQUE constraint failed/i.test(err.message || '');
    if (isDuplicate) {
      return { conflict: getActiveRun(clientId, agentType) };
    }
    throw err;
  }
}

/** OpenClaw accepted the hook — the audit is genuinely in flight now. */
export function markRunning(runId, openClawRunId = null) {
  db.prepare(`
    UPDATE seo_agent_runs
    SET status = 'running',
        started_at = COALESCE(started_at, datetime('now')),
        openclaw_run_id = COALESCE(?, openclaw_run_id)
    WHERE id = ? AND status = 'queued'
  `).run(openClawRunId, runId);

  const run = getRun(runId);
  if (run) broadcastRunStatus(run);
  return run;
}

/** The gateway's runId arrives on the runner's stdout, mid-flight. */
export function attachOpenClawRunId(runId, openClawRunId) {
  db.prepare('UPDATE seo_agent_runs SET openclaw_run_id = ? WHERE id = ?').run(openClawRunId, runId);
}

/**
 * Terminal state. Only advances a run that is still in flight, so a late
 * webhook can never resurrect a run the operator already cancelled.
 */
export function finishRun(runId, status, { error = null, auditId = null } = {}) {
  const result = db.prepare(`
    UPDATE seo_agent_runs
    SET status = ?, finished_at = datetime('now'), error = ?, audit_id = COALESCE(?, audit_id)
    WHERE id = ? AND status IN ('queued','running')
  `).run(status, error, auditId, runId);

  if (result.changes === 0) return null;

  const run = getRun(runId);
  clearPendingAudit(run.client_id, run.agent_type);
  broadcastRunStatus(run, { error });
  return run;
}

/** Same as finishRun but addressed the way OpenClaw's webhook identifies work. */
export function finishActiveRunFor(clientId, agentType, status, opts = {}) {
  const run = getActiveRun(clientId, agentType);
  if (!run) return null;
  return finishRun(run.id, status, opts);
}

/**
 * A cancelled run whose result is still expected.
 *
 * OpenClaw confirmed (2026-07-28) it exposes no way to abort a run, so
 * cancelling here never stops the work — that job WILL report back later.
 * Until OpenClaw echoes our run_id in create_seo_audit, a late result carries
 * nothing to identify itself but client_id + audit_type, and would otherwise
 * be matched to whatever run is in flight now — closing a live run with a
 * stale audit and flipping the card to "completed" while it is still working.
 *
 * Outstanding cancelled runs therefore get first claim on an unidentified
 * result, oldest first: the earlier job is the one that reports earlier.
 * The claim window is the skill's own timeout, so a cancelled run that never
 * reports stops shadowing new results once that window passes.
 */
export function claimOrphanedCancelledRun(clientId, agentType, auditId) {
  const windowMs = timeoutMsFor(agentType);
  const candidates = db.prepare(`
    SELECT * FROM seo_agent_runs
    WHERE client_id = ? AND agent_type = ? AND status = 'cancelled' AND audit_id IS NULL
    ORDER BY created_at ASC
  `).all(clientId, agentType);

  for (const run of candidates) {
    const startedMs = parseSqliteTime(run.started_at || run.created_at);
    if (!Number.isNaN(startedMs) && Date.now() - startedMs <= windowMs) {
      db.prepare('UPDATE seo_agent_runs SET audit_id = ? WHERE id = ?').run(auditId, run.id);
      return run;
    }
  }
  return null;
}

/**
 * Operator-initiated cancel. This releases our slot and stops us waiting for
 * the result — it does NOT stop work already running inside OpenClaw, which
 * has no abort endpoint. Tokens keep being spent until that job finishes.
 */
export function cancelRun(runId, cancelledBy = null) {
  const run = getRun(runId);
  if (!run) return { error: 'not_found' };
  if (!IN_FLIGHT.includes(run.status)) return { error: 'not_in_flight', run };

  broadcastRunLog(run, `[SYSTEM] Run cancelled by ${cancelledBy || 'operator'}. Queue slot released. OpenClaw has no abort endpoint, so this job keeps running and keeps spending tokens until it finishes on its own; its result will be stored but will not reopen this card.`);
  const cancelled = finishRun(runId, 'cancelled', { error: `Cancelled by ${cancelledBy || 'operator'}` });
  return { run: cancelled };
}

/** Arms the "OpenClaw never called back" fallback for a run. */
export function armTimeout(run, overrideMs = null) {
  registerPendingAudit(run.client_id, run.agent_type, () => {
    const current = getRun(run.id);
    if (!current || !IN_FLIGHT.includes(current.status)) return;
    broadcastRunLog(current, '[TIMEOUT] No audit result received from OpenClaw within the expected window for this audit type.');
    finishRun(run.id, 'timed_out', { error: 'No create_seo_audit webhook received before the timeout window elapsed.' });
  }, overrideMs);
}

/**
 * Timeout timers are in-memory, so a restart would otherwise strand every
 * in-flight run as permanently "running" — and a stranded run holds the
 * unique index slot, blocking that agent from ever being triggered again.
 * On boot: re-arm whatever time is left, and expire anything already past due.
 */
export function recoverInFlightRuns() {
  let reArmed = 0;
  let expired = 0;

  const runs = db.prepare(`SELECT * FROM seo_agent_runs WHERE status IN ('queued','running')`).all();
  for (const run of runs) {
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
    console.log(`[AGENT RUNS] Recovered in-flight runs: ${reArmed} re-armed, ${expired} expired.`);
  }
  return { reArmed, expired };
}
