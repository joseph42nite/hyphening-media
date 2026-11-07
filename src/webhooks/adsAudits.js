/**
 * The Ads Monitor's worker contract: claim queued runs with their fact pack,
 * stream log lines, and submit the audit.
 * Dispatched from src/routes/webhooks.js after the signature check.
 */

import { supersedeOpenRecommendations } from '../services/recommendations.js';
import db from '../../database.js';
// The ads fleet has its own runs table and lifecycle module, imported under
// aliases: every name is the same word as its SEO counterpart, and an
// unaliased import would let an ads result close an SEO run.
import {
  finishRun as finishAdsRun,
  finishActiveRunFor as finishActiveAdsRunFor,
  getRun as getAdsRun,
  armTimeout as armAdsTimeout,
  broadcastRunLog as broadcastAdsRunLog,
} from '../services/adsRuns.js';
import { buildFactPack, packForAgent } from '../services/adsFacts.js';

// ===========================================================================
// Ads Monitor
//
// Three events, mirroring the SEO worker's contract: claim work, stream logs,
// submit the result. The difference that matters is in the claim — an SEO run
// is handed a URL and goes and gathers its own data, while an ads run is handed
// the data. The whole fact pack travels in the claim response, so a run is one
// model call with no tool round-trips back to this server.
// ===========================================================================

/**
 * Hands queued ads runs to a worker, each with the fact pack it needs.
 *
 * The pack is built at claim time rather than at queue time on purpose. A run
 * can sit in the queue while a campaign row is corrected or leads are
 * qualified, and analysing the numbers as they were when someone clicked
 * would produce a report that disagrees with the dashboard beside it.
 *
 * A run whose data has disappeared between queueing and claiming is failed
 * here rather than handed over: the agent would otherwise receive an empty
 * pack, and an agent with no data does not fail, it answers from training
 * knowledge.
 */
export function handleClaimAdsRuns(payload) {
  const limit = Math.min(parseInt(payload?.limit, 10) || 1, 5);
  const worker = payload?.worker_id || 'local';

  const claim = db.transaction(() => {
    const queued = db.prepare(`
      SELECT r.id, r.client_id, r.agent_type, r.period_month, r.requested_by, r.model,
             r.trigger_source, c.name AS client_name
      FROM ads_agent_runs r
      JOIN crm_clients c ON c.id = r.client_id
      WHERE r.status = 'queued'
      ORDER BY r.id ASC
      LIMIT ?
    `).all(limit);

    const mark = db.prepare(`
      UPDATE ads_agent_runs
      SET status = 'running', started_at = datetime('now'), actual_model = COALESCE(actual_model, ?)
      WHERE id = ? AND status = 'queued'
    `);
    return queued.filter(r => mark.run(`worker:${worker}`, r.id).changes === 1);
  });

  const runs = claim();
  const delivered = [];

  for (const run of runs) {
    const conf = db.prepare('SELECT * FROM ads_agent_config WHERE agent_type = ?').get(run.agent_type);
    const built = buildFactPack(run.client_id, { month: run.period_month });

    if (!conf || !built) {
      finishAdsRun(run.id, 'failed', { error: 'Agent configuration or client record disappeared between queueing and claiming.' });
      continue;
    }

    // The timeout is armed on delivery, not on queueing: the clock that
    // matters is how long the worker has been holding the job, and a run that
    // waited an hour in the queue has not used any of its window.
    armAdsTimeout({ id: run.id, client_id: run.client_id, agent_type: run.agent_type });
    broadcastAdsRunLog(
      { id: run.id, client_id: run.client_id, agent_type: run.agent_type },
      `[SYSTEM] Claimed by worker '${worker}'. Fact pack ${built.hash} covering ${built.pack.focus_month}.`,
    );

    delivered.push({
      run_id: run.id,
      client_id: run.client_id,
      client_name: run.client_name,
      agent_type: run.agent_type,
      // The claude-ads skill that serves this card. The worker invokes this by
      // name rather than deriving it: claude-ads calls the full audit
      // 'ads-audit' while our card is 'audit', and every scheme that derives a
      // skill name from an agent type has needed a special case for exactly
      // that pair.
      skill_name: conf.skill_name,
      agent_label: conf.label,
      agent_brief: conf.description,
      platform: conf.platform || null,
      period_month: built.pack.focus_month,
      model: run.model,
      requested_by: run.requested_by,
      trigger_source: run.trigger_source,
      // Trimmed to this agent's sections. Sending the creative section to a
      // pacing agent is tokens spent on context that cannot change the answer.
      facts: packForAgent(built.pack, conf),
      facts_hash: built.hash,
    });
  }

  if (delivered.length) {
    console.log(`[ADS] Worker '${worker}' claimed ${delivered.length} run(s): ${delivered.map(r => `#${r.run_id} ${r.agent_type}`).join(', ')}`);
  }

  return {
    success: true,
    summary: `Claimed ${delivered.length} ads run(s) for worker '${worker}'.`,
    data: { runs: delivered },
  };
}

/** Relays a worker's progress line to the dashboard console. */
export function handleAdsRunLog(payload) {
  const runId = parseInt(payload?.run_id, 10);
  const line = typeof payload?.log === 'string' ? payload.log : null;
  if (!runId || !line) return { success: false, summary: 'run_id and log are required' };

  const run = getAdsRun(runId);
  if (!run) return { success: false, summary: `Ads run #${runId} not found` };

  broadcastAdsRunLog(run, line);
  return { success: true, summary: `Relayed log for ads run #${runId}` };
}

/** 0-100, or null. Anything outside the range is a scale the agent invented. */
export function normaliseScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Math.round(n);
}

const ADS_SCORE_FIELDS = [
  'health_score', 'efficiency_score', 'lead_quality_score', 'funnel_score',
  'creative_score', 'landing_score', 'pacing_score', 'roas_score', 'audit_score',
];

const ADS_PRIORITIES = new Set(['Critical', 'High', 'Medium', 'Low']);
const ADS_PLATFORMS = new Set(['Google', 'Meta', 'YouTube']);

/**
 * Stores a finished ads analysis.
 *
 * The agent's own facts_hash is checked against the pack it was given. A
 * mismatch means it analysed something other than what it was sent — the
 * report is still stored, because the tokens are spent and the text may be
 * useful, but the run is failed so the card stays due rather than reading as
 * freshly audited for the next thirty days.
 */
export function handleCreateAdsAudit(payload) {
  const runId = parseInt(payload?.run_id, 10) || null;
  const clientId = parseInt(payload?.client_id, 10);
  const agentType = typeof payload?.agent_type === 'string' ? payload.agent_type.trim() : null;

  if (!clientId || !agentType) {
    return { success: false, summary: 'client_id and agent_type are required' };
  }

  const conf = db.prepare('SELECT * FROM ads_agent_config WHERE agent_type = ?').get(agentType);
  if (!conf) {
    const known = db.prepare('SELECT agent_type FROM ads_agent_config').all().map(r => r.agent_type);
    console.warn(`[ADS] Rejected create_ads_audit: unknown agent_type ${JSON.stringify(agentType)} (client ${clientId}).`);
    return { success: false, summary: `Unknown agent_type '${agentType}'. Accepted: ${known.join(', ')}` };
  }

  const run = runId ? getAdsRun(runId) : null;
  const failed = payload.status === 'error' || payload.status === 'failed';

  // Did it analyse what we sent it?
  let integrityError = null;
  if (run && payload.facts_hash) {
    const rebuilt = buildFactPack(run.client_id, { month: run.period_month });
    if (rebuilt && rebuilt.hash !== payload.facts_hash) {
      // Not automatically a fault: the underlying rows can legitimately change
      // while a run is in flight. It is only recorded as one when the agent
      // ALSO claims a different month, which is the case that means it read the
      // wrong pack rather than a stale one.
      if (payload.period_month && payload.period_month !== run.period_month) {
        integrityError = `Agent reported on ${payload.period_month} but was given a fact pack for ${run.period_month}.`;
      } else {
        console.log(`[ADS] Run #${run.id} fact pack changed while in flight (${payload.facts_hash} -> ${rebuilt.hash}); the audit describes the data as it was at claim time.`);
      }
    }
  }
  if (run && run.agent_type !== agentType) {
    integrityError = `Run #${run.id} requested '${run.agent_type}' but a '${agentType}' analysis came back. '${run.agent_type}' has NOT been run.`;
  }

  const scores = {};
  for (const field of ADS_SCORE_FIELDS) scores[field] = normaliseScore(payload[field]);

  const reportJson = payload.report_json == null
    ? null
    : (typeof payload.report_json === 'string' ? payload.report_json : JSON.stringify(payload.report_json));

  const store = db.transaction(() => {
    const audit = db.prepare(`
      INSERT INTO ads_audits (
        client_id, agent_type, period_month,
        health_score, efficiency_score, lead_quality_score, funnel_score,
        creative_score, landing_score, pacing_score, roas_score, audit_score,
        summary, report_json, facts_hash, data_gaps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId, agentType, payload.period_month || run?.period_month || null,
      scores.health_score, scores.efficiency_score, scores.lead_quality_score, scores.funnel_score,
      scores.creative_score, scores.landing_score, scores.pacing_score, scores.roas_score, scores.audit_score,
      payload.summary || null, reportJson, payload.facts_hash || null,
      payload.data_gaps ? JSON.stringify(payload.data_gaps) : null,
    );
    const auditId = audit.lastInsertRowid;

    let stored = 0;
    let skipped = 0;
    if (Array.isArray(payload.recommendations)) {
      const insert = db.prepare(`
        INSERT INTO ads_recommendations (
          audit_id, client_id, priority, platform, campaign_name, metric,
          issue, action_required, observation, failure_check, expected_impact
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rec of payload.recommendations) {
        // The three fields a recommendation is useless without. A row with a
        // blank action is a finding nobody can act on, and it would sit in the
        // open-actions count for ever inflating the number the operator is
        // meant to be watching.
        if (!rec?.metric || !rec?.issue || !rec?.action_required) { skipped++; continue; }
        insert.run(
          auditId, clientId,
          ADS_PRIORITIES.has(rec.priority) ? rec.priority : 'Medium',
          ADS_PLATFORMS.has(rec.platform) ? rec.platform : null,
          rec.campaign_name || null,
          String(rec.metric).slice(0, 200),
          String(rec.issue),
          String(rec.action_required),
          rec.observation || null,
          rec.failure_check || null,
          rec.expected_impact || null,
        );
        stored++;
      }
    }
    // Only a run that produced findings replaces the last one: a failed or
    // empty run must not clear a card's open items.
    const superseded = stored
      ? supersedeOpenRecommendations('ads', { clientId, newAuditId: auditId, params: [agentType] })
      : 0;
    return { auditId, stored, skipped, superseded };
  });

  const { auditId, stored, skipped, superseded } = store();
  if (superseded) console.log(`[ADS] Audit #${auditId} (${agentType}) replaced ${superseded} open recommendation(s) from earlier runs.`);
  if (skipped) {
    console.warn(`[ADS] Audit #${auditId}: skipped ${skipped} recommendation(s) missing metric, issue or action_required.`);
  }

  if (payload.token_usage) {
    try {
      const u = payload.token_usage;
      db.prepare(`
        INSERT INTO token_usage_log (
          client_id, audit_id, agent_type, model, triggered_by,
          input_tokens, output_tokens, estimated_cost_usd, duration_seconds, status
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clientId,
        // audit_id is deliberately NULL: that column has a foreign key onto
        // seo_audits, so writing an ads_audits id there would either be
        // rejected or, worse, point at an unrelated SEO audit.
        `ads_${agentType}`,
        u.model || 'unknown',
        run?.requested_by || payload.requested_by || 'worker',
        u.input_tokens || 0,
        u.output_tokens || 0,
        u.cost_usd ?? u.estimated_cost_usd ?? 0,
        u.duration_seconds ?? null,
        failed ? 'failed' : 'completed',
      );
    } catch (err) {
      // Usage accounting must never cost us a finished audit.
      console.error('[ADS] Token usage log failed:', err.message);
    }
  }

  const finalStatus = (failed || integrityError) ? 'failed' : 'completed';
  const finishOpts = {
    auditId,
    error: integrityError || (failed ? (payload.error || payload.summary || 'The worker reported a failed analysis with no reason given') : null),
    actualModel: payload.token_usage?.model || null,
  };

  const closed = runId
    ? finishAdsRun(runId, finalStatus, finishOpts)
    : finishActiveAdsRunFor(clientId, agentType, finalStatus, finishOpts);

  if (integrityError) console.warn(`[ADS] ${integrityError}`);
  if (!closed) {
    // Kept regardless: the tokens are spent, and discarding the data wastes
    // them twice. A scheduled push with no matching run lands here.
    console.log(`[ADS] create_ads_audit for client ${clientId}/${agentType} had no matching in-flight run (untracked).`);
  }

  import('../../server.js').then(({ broadcastEvent }) => {
    if (!closed) {
      broadcastEvent('ads_agent_status', { clientId, agentType, status: finalStatus, untracked: true });
    }
    broadcastEvent('ads_audit_created', { clientId, agentType, auditId, recommendations: stored });
  }).catch(err => console.error('[ADS] Broadcast ads_audit_created failed:', err));

  return {
    success: true,
    summary: `Stored ${agentType} analysis #${auditId} for client ${clientId} with ${stored} recommendation(s).`,
    data: { audit_id: auditId, recommendations_stored: stored, recommendations_skipped: skipped, run_status: finalStatus },
  };
}
