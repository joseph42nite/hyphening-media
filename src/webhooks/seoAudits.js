/**
 * create_seo_audit: stores a worker's SEO audit and its recommendations, and
 * closes the run it belongs to.
 * Dispatched from src/routes/webhooks.js after the signature check.
 */

import db from '../../database.js';
import { logAction } from '../services/auditLogger.js';
// Timeout timers are cleared by finishRun as part of closing a run, so the
// webhook never clears them directly.
import {
  finishActiveRunFor,
  finishRun,
  claimOrphanedCancelledRun,
  getRun,
} from '../services/agentRuns.js';

// Mirrors the CHECK constraint on seo_audits.audit_type (migration 043). Kept
// here so a bad value is rejected with a readable message instead of surfacing
// as a SqliteError, and so normaliseAuditType can tell "needs rewriting" from
// "genuinely unknown". Keep in sync with the migration.
const VALID_AUDIT_TYPES = new Set([
  'full', 'page', 'technical', 'content', 'content_brief', 'schema', 'sitemap',
  'images', 'geo', 'local', 'maps', 'hreflang', 'google', 'backlinks', 'cluster',
  'sxo', 'drift', 'ecommerce', 'flow', 'competitor_pages', 'plan', 'programmatic',
  'dataforseo', 'image_gen'
]);

// Skill names that do not reduce to a valid audit type by prefix-stripping
// alone. Only add entries here for a genuine naming difference between the two
// systems, not to paper over a skill sending the wrong value.
const AUDIT_TYPE_ALIASES = {
  audit: 'full',
};

/**
 * Accepts OpenClaw's skill names as audit types.
 *
 * Each SEO sub-skill's webhook template substitutes its own SKILL.md `name`
 * into audit_type, which yields 'seo-schema' or 'seo-image-gen' rather than
 * 'schema' or 'image_gen'. Only 2 of OpenClaw's 21 sub-skills happen to produce
 * a value our schema accepts (confirmed 2026-08-03). The orchestrator sends
 * hardcoded correct values, so hook-triggered runs were unaffected — but any
 * sub-skill invoked directly hit the CHECK constraint and the finished audit
 * was discarded with a 500, after the tokens had already been spent.
 *
 * Rewriting on receipt fixes both failure modes at once: the insert, and the
 * run correlation in finishActiveRunFor, which matches on seo_agent_runs
 * .agent_type ('geo') and would never match 'seo-geo' either.
 *
 * Returns null for anything that is still unrecognised after rewriting, so a
 * genuinely unknown type is reported rather than silently coerced.
 */
export function normaliseAuditType(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (VALID_AUDIT_TYPES.has(trimmed)) return trimmed;

  const rewritten = trimmed.replace(/^seo[-_]/, '').replace(/-/g, '_');
  if (VALID_AUDIT_TYPES.has(rewritten)) return rewritten;

  // 'full' is the one type whose name differs on both sides. We ask for it as
  // "seo audit" (openclaw_seo_runner.js renames it when building the trigger),
  // OpenClaw's skill is called seo-audit, so its payload reports 'seo-audit' or
  // 'audit' — neither of which the prefix strip above can reach, since 'audit'
  // is not a valid type on its own.
  return AUDIT_TYPE_ALIASES[rewritten] || null;
}

export function handleCreateSeoAudit(payload) {
  if (!payload?.client_id || !payload?.audit_type || !payload?.url) {
    return { success: false, summary: 'client_id, audit_type, and url are required' };
  }

  // Normalised in place: audit_type is read in ~15 places below, including the
  // insert and the run correlation, and all of them need the canonical value.
  const receivedAuditType = payload.audit_type;
  const auditType = normaliseAuditType(receivedAuditType);

  if (!auditType) {
    console.warn(`[OPENCLAW] Rejected create_seo_audit: unrecognised audit_type ${JSON.stringify(receivedAuditType)} (client ${payload.client_id}).`);
    return {
      success: false,
      summary: `Unrecognised audit_type '${receivedAuditType}'. Accepted values: ${[...VALID_AUDIT_TYPES].join(', ')}`
    };
  }

  if (auditType !== receivedAuditType) {
    console.log(`[OPENCLAW] Normalised audit_type ${JSON.stringify(receivedAuditType)} -> '${auditType}' (client ${payload.client_id}). OpenClaw is sending skill names; the sending skill's template should be corrected.`);
    payload.audit_type = auditType;
  }

  // Support two formats:
  // 1. Single audit: {client_id, audit_type, url, page_url, health_score, ...}
  // 2. Multi-URL: {client_id, audit_type, url, results: [{page_url, health_score, ...}, ...]}

  const results = payload.results && Array.isArray(payload.results)
    ? payload.results
    : [{ page_url: payload.page_url || payload.url, health_score: payload.health_score, technical_score: payload.technical_score, content_score: payload.content_score, on_page_score: payload.on_page_score, schema_score: payload.schema_score, performance_score: payload.performance_score, geo_score: payload.geo_score, backlinks_score: payload.backlinks_score, local_score: payload.local_score, sxo_score: payload.sxo_score, audit_score: payload.audit_score, summary: payload.summary, report_json: payload.report_json, recommendations: payload.recommendations, token_usage: payload.token_usage }];

  let totalAuditsCreated = 0;
  let firstAuditId = null;

  // A failed run (rate limit, provider error, upstream failure) reports through
  // this same event, carrying health_score 0 and no recommendations. Those must
  // NOT become audit rows: freshness is derived from the newest seo_audits row,
  // so a 429 would mark the skill "fresh" and make the dashboard demand a Force
  // Run for the retry — the opposite of what a rate-limited run needs. A zero
  // score would also overwrite the client's monthly report. The failure is
  // recorded on the run itself (status + error), which is where it belongs.
  const auditFailed = payload.status === 'error' || payload.status === 'failed';

  // Insert one audit row per URL
  // A competitor run reports is_competitor so the audit is stored as research,
  // not as the client's own result. The run row is the authority — reading it
  // back rather than trusting the payload, since the flag decides whether this
  // audit counts toward the client's freshness.
  const originRun = payload.run_id
    ? db.prepare('SELECT target_url, is_competitor, competitor_domain FROM seo_agent_runs WHERE id = ?').get(payload.run_id)
    : null;
  const isCompetitorAudit = originRun?.is_competitor === 1 ? 1 : 0;
  const auditTargetUrl = originRun?.target_url || null;
  // Read from the run for the same reason is_competitor is: the run row is what
  // the trigger validated against client_competitors, and a payload field would
  // let a worker store a comparison against a domain nobody approved. Also what
  // the per-competitor freshness check reads back.
  const auditCompetitorDomain = originRun?.competitor_domain || null;

  const insertAudit = db.prepare(`
    INSERT INTO seo_audits (
      client_id, audit_type, url, page_url, health_score, technical_score, content_score,
      on_page_score, schema_score, performance_score, geo_score, backlinks_score,
      local_score, sxo_score, audit_score, summary, report_json, target_url, is_competitor,
      competitor_domain
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of results) {
    if (auditFailed) {
      // Tokens were still spent before the error, so the usage is worth
      // keeping even though there is no audit to attach it to.
      if (result.token_usage) {
        const usage = result.token_usage;
        db.prepare(`
          INSERT INTO token_usage_log (
            client_id, audit_id, agent_type, model, triggered_by,
            input_tokens, output_tokens, estimated_cost_usd, external_api_cost_usd,
            duration_seconds, status
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'failed')
        `).run(
          payload.client_id,
          payload.audit_type,
          // token_usage_log.model is NOT NULL, so a failure reporting usage
          // without naming a model used to throw and take the whole webhook
          // down with a 500 — losing the usage record it was trying to save,
          // on exactly the path we ask OpenClaw to use for failures. The
          // success path below already defaults; this one did not.
          usage.model || 'unknown',
          payload.triggered_by || 'system',
          usage.input_tokens || 0,
          usage.output_tokens || 0,
          usage.estimated_cost_usd || 0,
          usage.external_api_cost_usd || 0,
          usage.duration_seconds || null
        );
      }
      continue;
    }

    const auditResult = insertAudit.run(
      payload.client_id,
      payload.audit_type,
      payload.url,
      result.page_url || payload.url,
      result.health_score ?? null,
      result.technical_score ?? null,
      result.content_score ?? null,
      result.on_page_score ?? null,
      result.schema_score ?? null,
      result.performance_score ?? null,
      result.geo_score ?? null,
      result.backlinks_score ?? null,
      result.local_score ?? null,
      result.sxo_score ?? null,
      result.audit_score ?? null,
      result.summary ?? null,
      result.report_json ? JSON.stringify(result.report_json) : null,
      auditTargetUrl,
      isCompetitorAudit,
      auditCompetitorDomain
    );

    const auditId = auditResult.lastInsertRowid;
    totalAuditsCreated++;
    if (firstAuditId === null) firstAuditId = auditId;

    // Insert recommendations for this specific audit/page
    if (Array.isArray(result.recommendations)) {
      const insertRec = db.prepare(`
        INSERT INTO seo_recommendations (
          audit_id, client_id, priority, metric, issue, action_required,
          observation, dependency, failure_check, leading_indicator, page_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
      `);

      for (const rec of result.recommendations) {
        insertRec.run(
          auditId,
          payload.client_id,
          rec.priority || 'Medium',
          rec.metric || '',
          rec.issue || '',
          rec.action_required || '',
          rec.observation || null,
          rec.dependency || null,
          rec.failure_check || null,
          rec.leading_indicator || null,
          rec.page_url || result.page_url || payload.url
        );
      }
    }

    // Backlinks: parse referring domains and upsert into outreach_targets
    if (payload.audit_type === 'backlinks' && result.report_json) {
      const report = result.report_json;
      const targets = report.outreach_targets || report.competitor_gap || [];
      if (Array.isArray(targets)) {
        const insertTarget = db.prepare(`
          INSERT INTO outreach_targets (client_id, site_name, site_url, source, category, domain_authority, vetting_status)
          VALUES (?, ?, ?, 'seo_backlinks_gap', ?, ?, 'unvetted')
        `);
        for (const t of targets) {
          if (t.site_url) {
            insertTarget.run(
              payload.client_id,
              t.site_name || t.site_url,
              t.site_url,
              t.category || 'guest_post',
              t.domain_authority || t.da || null
            );
          }
        }
      }
    }

    // Token cost logging
    if (result.token_usage) {
      const usage = result.token_usage;
      db.prepare(`
        INSERT INTO token_usage_log (
          client_id, audit_id, agent_type, model, triggered_by,
          input_tokens, output_tokens, estimated_cost_usd, external_api_cost_usd,
          duration_seconds, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        payload.client_id,
        auditId,
        payload.audit_type,
        usage.model || 'claude',
        payload.triggered_by || 'system',
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        usage.estimated_cost_usd || 0,
        usage.external_api_cost_usd || 0,
        usage.duration_seconds || null
      );
    }
  }

  // Sync overall scores with marketing_monthly_report (use first result's
  // scores). Skipped for a failed run: its scores are zeros standing in for
  // "no data", and writing them would silently overwrite a real score in the
  // client's monthly report with a 0 caused by a rate limit.
  if (!auditFailed) {
    const firstResult = results[0];
    const currentMonth = new Date().toISOString().slice(0, 7);
    const existingReport = db.prepare('SELECT id FROM marketing_monthly_report WHERE client_id = ? AND month = ?').get(payload.client_id, currentMonth);

    if (existingReport) {
      db.prepare(`
        UPDATE marketing_monthly_report SET
          on_page_score = COALESCE(?, on_page_score),
          da = COALESCE(?, da),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        firstResult.on_page_score ?? firstResult.health_score ?? null,
        firstResult.backlinks_score ?? null,
        existingReport.id
      );
    } else {
      db.prepare(`
        INSERT INTO marketing_monthly_report (
          client_id, month, on_page_score, da
        ) VALUES (?, ?, ?, ?)
      `).run(
        payload.client_id,
        currentMonth,
        firstResult.on_page_score ?? firstResult.health_score ?? null,
        firstResult.backlinks_score ?? null
      );
    }
  }

  logAction({
    action: 'create',
    entityType: 'seo_audit',
    entityId: null,
    diff: { audit_type: payload.audit_type, client_id: payload.client_id, results_count: totalAuditsCreated, status: auditFailed ? 'failed' : 'completed' }
  });

  // The real audit results have arrived — close the run, which clears the
  // timeout, releases the dedupe slot and flips the dashboard card out of its
  // loading state. finishRun only advances a run that is still in flight, so
  // a result arriving after a cancel cannot resurrect it.
  const finalStatus = auditFailed ? 'failed' : 'completed';

  // Which model actually served the run. With fallback chains configured
  // (Ultra:free -> Super:free -> a paid Kimi), a free-tier 429 silently
  // escalates to a billable model, so this is recorded to make that visible
  // rather than leaving it to show up on an invoice.
  const reportedModel = payload.token_usage?.model
    || results.find(r => r?.token_usage?.model)?.token_usage?.model
    || null;

  const finishOpts = {
    auditId: firstAuditId,
    // `error` first, then `summary`. A failing worker puts the reason in
    // `error` and leaves `summary` empty, so reading summary alone stored the
    // generic fallback and threw away the detail — run 21 was rejected with ten
    // specific contradictions and the dashboard showed "reported a failed
    // audit", leaving no way to tell a real fabrication from a checker bug.
    error: auditFailed
      ? (payload.error || payload.summary || 'The worker reported a failed audit with no reason given')
      : null,
    actualModel: reportedModel
  };

  // payload.run_id is the run id we send to OpenClaw as [run_id:N]. When it
  // comes back the match is exact and none of the guesswork below applies.
  let closedRun = null;
  let orphanRun = null;

  if (payload.run_id) {
    // The run says which skill we asked for; the payload says which one ran.
    // When they disagree, OpenClaw resolved our trigger message to a different
    // skill — "seo geo" was read as geographic SEO and served by the local
    // skill on 2026-08-04, closing run #11 as a completed geo audit when no geo
    // audit existed. Skill selection there is the model reading a reference
    // table, not a lookup, so this will recur with any confusable pair.
    //
    // The audit itself is kept — it is real work and the tokens are spent — but
    // the run is failed rather than completed, so the card reports the truth and
    // the skill stays due instead of looking freshly audited for 30 days.
    const requestedRun = getRun(payload.run_id);
    if (requestedRun && requestedRun.agent_type !== payload.audit_type) {
      const mismatch =
        `Skill mismatch: '${requestedRun.agent_type}' was requested but OpenClaw returned a ` +
        `'${payload.audit_type}' audit (stored as #${firstAuditId}). The trigger message was ` +
        `resolved to the wrong skill; '${requestedRun.agent_type}' has NOT been audited.`;
      console.warn(`[OPENCLAW] ${mismatch}`);
      closedRun = finishRun(payload.run_id, 'failed', { ...finishOpts, error: mismatch });
    } else {
      closedRun = finishRun(payload.run_id, finalStatus, finishOpts);
    }
  } else {
    // No run_id: this result identifies itself only by client + audit type.
    // A cancelled run is still out there working (OpenClaw cannot abort), so
    // give any outstanding cancelled run first claim before assuming this
    // belongs to whatever is in flight now — otherwise a stale result closes
    // a live run and the card reports done while the job is still going.
    orphanRun = claimOrphanedCancelledRun(payload.client_id, payload.audit_type, firstAuditId);
    if (!orphanRun) {
      closedRun = finishActiveRunFor(payload.client_id, payload.audit_type, finalStatus, finishOpts);
    }
  }

  if (orphanRun) {
    console.log(`[OPENCLAW] create_seo_audit for client ${payload.client_id}/${payload.audit_type} attributed to cancelled run #${orphanRun.id}; audit stored, in-flight runs untouched.`);
  } else if (!closedRun) {
    // Nothing matched: OpenClaw pushed an audit we never triggered (a
    // scheduled run). The audit rows are kept either way — the tokens were
    // already spent, so discarding the data would waste them twice.
    console.log(`[OPENCLAW] create_seo_audit for client ${payload.client_id}/${payload.audit_type} had no matching run (untracked).`);
  }

  import('../../server.js').then(({ broadcastEvent }) => {
    // finishRun already broadcast the status for tracked runs. An orphan
    // result must NOT broadcast one at all: the card belongs to whatever is
    // in flight now, and a 'completed' here would wrongly clear it.
    if (!closedRun && !orphanRun) {
      broadcastEvent('seo_agent_status', {
        clientId: payload.client_id,
        agentType: payload.audit_type,
        status: finalStatus,
        untracked: true
      });
    }
    broadcastEvent('seo_audit_created', { clientId: payload.client_id, agentType: payload.audit_type });
  }).catch(err => console.error('[OPENCLAW] Broadcast seo_audit_created failed:', err));

  return {
    success: true,
    summary: auditFailed
      ? `SEO Audit (${payload.audit_type}) reported failure: ${payload.summary || 'no summary provided'}`
      : `SEO Audit (${payload.audit_type}) completed with ${totalAuditsCreated} per-URL result(s).`
  };
}
