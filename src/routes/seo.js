import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { cancelRun, getActiveRunsForClient, getRun, listQueue, broadcastRunLog } from '../services/agentRuns.js';
import { startAgentRun, abortOpenClawRun, isAbortSupported } from '../services/agentRunner.js';

const IN_FLIGHT_FOR_ABORT = ['queued', 'running'];

// Skills that cannot produce a real result, and why. Authoritative — the
// trigger route rejects these, and /seo/agents/status reports the reason so the
// dashboard can render it rather than keeping a second copy of this list.
//
// Rewritten 2026-08-04 when audits moved from OpenClaw to the claude-seo plugin
// running on the local worker. All 25 skills are now installed, so the previous
// "no skill exists" entries are gone; what remains is skills whose external
// dependency is genuinely absent. That distinction matters — a skill with no
// data source does not fail, it writes a plausible-looking audit from training
// knowledge, which is how a fabricated Critical recommendation reaches a client.
//
// Mirrors UNAVAILABLE_SKILLS in SeoMonitorTab.jsx; keep the two in sync.
const UNAVAILABLE_SKILLS = new Map([
  // Installed, but the MCP server that supplies their data is not configured.
  ['dataforseo', 'Requires the DataForSEO MCP server, which is not configured'],
  ['maps', 'Requires the DataForSEO MCP server, which is not configured'],
  ['image_gen', 'Requires the nanobanana MCP image tool, which is not configured'],
  // 'google' was unblocked 2026-08-04: the worker reports tier 0, so PageSpeed,
  // CrUX and CrUX History return real field data. Search Console, Indexing and
  // GA4 still need a service account, and facts.mjs records that per run so the
  // report states them as unavailable instead of estimating.
  //
  // Installed and working, but compares against a stored baseline. Running it
  // before one exists reports every element as new rather than as drift.
  ['drift', 'Needs a stored baseline first — capture one before comparing'],
]);

// Each skill writes a different one of the ten score columns on seo_audits.
// Prefer the column matching the audit type, then the generic health_score,
// then whatever is populated — otherwise a real score reads as no score.
// Mirrors getAuditScore in SeoMonitorTab.jsx; keep the two in sync.
const SCORE_COLUMN_BY_TYPE = {
  technical: 'technical_score',
  content: 'content_score',
  content_brief: 'content_score',
  schema: 'schema_score',
  geo: 'geo_score',
  local: 'local_score',
  backlinks: 'backlinks_score',
  sxo: 'sxo_score',
  full: 'health_score',
};

const ALL_SCORE_COLUMNS = [
  'health_score', 'technical_score', 'content_score', 'on_page_score',
  'schema_score', 'performance_score', 'geo_score', 'backlinks_score',
  'local_score', 'sxo_score', 'audit_score',
];

/**
 * Our audit type -> OpenClaw's skill name. Mirrors the trigger phrase built in
 * openclaw_seo_runner.js: underscores become hyphens, and 'full' is 'seo-audit'
 * on their side.
 */
function skillNameForAuditType(agentType) {
  return agentType === 'full' ? 'seo-audit' : `seo-${agentType.replace(/_/g, '-')}`;
}

/**
 * What OpenClaw last reported about the skill backing this audit type.
 *
 * `enforced` is false until an inventory has been received at all, so a fresh
 * install does not have every agent disabled by an empty table.
 */
function skillStateFor(agentType) {
  const skillName = skillNameForAuditType(agentType);
  const anyReport = db.prepare('SELECT COUNT(*) AS n FROM openclaw_skills').get().n > 0;
  if (!anyReport) return { enforced: false, ok: true, skillName };

  const row = db.prepare('SELECT * FROM openclaw_skills WHERE name = ?').get(skillName);
  if (!row) {
    return {
      enforced: true, ok: false, skillName,
      reason: `OpenClaw has no skill named '${skillName}' installed`,
      reportedAt: null,
    };
  }
  if (!row.healthy) {
    const why = !row.frontmatter_parsed
      ? `'${skillName}' has unreadable frontmatter, so OpenClaw cannot discover it${row.frontmatter_error ? ` (${row.frontmatter_error})` : ''}`
      : `'${skillName}' has a byte-order mark before its frontmatter, which prevents discovery`;
    return { enforced: true, ok: false, skillName, reason: why, reportedAt: row.reported_at };
  }
  return { enforced: true, ok: true, skillName, reportedAt: row.reported_at };
}

/**
 * External data source each skill genuinely depends on.
 *
 * Only skills that are useless without a specific source are listed. `technical`
 * reads PageSpeed but still produces real findings from the crawl alone, so it
 * is absent — a missing source there degrades the report rather than voiding it.
 */
const REQUIRED_CAPABILITY = {
  backlinks: { family: 'backlink_apis', sources: ['moz', 'bing', 'dataforseo'], label: 'a backlink data source (Moz, Bing Webmaster, or DataForSEO)' },
  google: { family: 'google_apis', sources: ['psi', 'crux', 'gsc', 'ga4'], label: 'the Google APIs' },
};

/**
 * Whether this audit ran without the data it needed.
 *
 * Returns a human-readable reason, or null when the run had what it required.
 * Audits stored before capabilities were recorded return null rather than being
 * assumed broken — absence of evidence is not evidence of an outage.
 */
function detectDataGap(auditType, audit) {
  const required = REQUIRED_CAPABILITY[auditType];
  if (!required || !audit?.report_json) return null;

  let parsed;
  try {
    parsed = typeof audit.report_json === 'string' ? JSON.parse(audit.report_json) : audit.report_json;
  } catch { return null; }

  const capabilities = parsed?.capabilities?.[required.family];
  if (!capabilities || !Array.isArray(capabilities.available)) return null;

  const hasAny = required.sources.some(s => capabilities.available.includes(s));
  if (hasAny) return null;

  return `Ran without ${required.label}, so this audit reports the outage rather than the site.`;
}

function resolveAuditScore(audit) {
  if (!audit) return null;
  const preferred = SCORE_COLUMN_BY_TYPE[audit.audit_type];
  if (preferred && audit[preferred] != null) return audit[preferred];
  if (audit.health_score != null) return audit.health_score;
  // audit_score is the fallback for the ~15 audit types with no dedicated
  // column — sitemap, hreflang, cluster, ecommerce, and others. Found when the
  // sitemap skill's score was extracted correctly and then silently dropped
  // because nothing matched it.
  if (audit.audit_score != null) return audit.audit_score;
  for (const col of ALL_SCORE_COLUMNS) {
    if (audit[col] != null) return audit[col];
  }
  return null;
}

const router = Router({ mergeParams: true });
router.use(authenticate);

/**
 * GET /api/clients/:id/seo/audits
 * List client audits
 */
router.get('/:id/seo/audits', (req, res) => {
  try {
    const { type } = req.query;
    // Competitor audits are research, not the client's own results, so they
    // stay out of the default list. ?competitors=1 opts into them.
    const includeCompetitors = req.query.competitors === '1';
    let query = includeCompetitors
      ? 'SELECT * FROM seo_audits WHERE client_id = ?'
      : 'SELECT * FROM seo_audits WHERE client_id = ? AND is_competitor = 0';
    const params = [req.params.id];
    
    if (type) {
      query += ' AND audit_type = ?';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC';
    
    const audits = db.prepare(query).all(...params);
    res.json({ audits });
  } catch (err) {
    console.error('[SEO ROUTE] Audits fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/seo/audits/:auditId
 * Get audit detail + recommendations
 */
router.get('/:id/seo/audits/:auditId', (req, res) => {
  try {
    const audit = db.prepare('SELECT * FROM seo_audits WHERE id = ? AND client_id = ?').get(req.params.auditId, req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    
    const recommendations = db.prepare('SELECT * FROM seo_recommendations WHERE audit_id = ?').all(req.params.auditId);
    res.json({ audit, recommendations });
  } catch (err) {
    console.error('[SEO ROUTE] Audit detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/seo/agents/status
 * Returns freshness status and score details for each agent
 */
router.get('/:id/seo/agents/status', (req, res) => {
  try {
    const client = db.prepare('SELECT id FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const configs = db.prepare('SELECT * FROM agent_run_config').all();
    // In-flight runs come from the DB rather than the client's own memory, so
    // a card still reads "Running" after a refresh instead of offering a
    // second, duplicate Run button.
    const activeRuns = getActiveRunsForClient(client.id);
    const statusMap = [];

    for (const conf of configs) {
      // Selects every score column, including audit_score — the fallback for
      // audit types with no dedicated column. Omitting any of these means a
      // real score reads as no score on the card, silently, which is how
      // sitemap's score was lost for one full audit before this existed.
      const lastAudit = db.prepare(`
        SELECT id, created_at, audit_type, health_score, technical_score, content_score,
               on_page_score, schema_score, performance_score, geo_score,
               backlinks_score, local_score, sxo_score, audit_score
        FROM seo_audits
        WHERE client_id = ? AND audit_type = ? AND is_competitor = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(client.id, conf.audit_type);

      let freshness = 'never_run';
      let ageDays = null;
      let lastRunAt = null;
      let score = null;
      let dataGap = null;

      if (lastAudit) {
        lastRunAt = lastAudit.created_at;
        const lastDate = new Date(lastAudit.created_at);
        const diffMs = Date.now() - lastDate.getTime();
        ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (ageDays < conf.stale_after_days) {
          freshness = 'fresh';
        } else {
          freshness = 'stale';
        }

        // A run that completed without its data source is not a fresh audit —
        // it is a report about an outage. The backlinks card read FRESH while
        // all five of its findings were "Moz access denied", "Bing access
        // denied", "referring domain data gap": nothing was learned about the
        // client's actual link profile, and the badge stopped asking for a
        // re-run. Age alone cannot see that distinction, so the audit's
        // recorded capabilities are checked too.
        dataGap = detectDataGap(conf.audit_type, lastAudit);
        if (dataGap) freshness = 'stale';

        // Map score based on agent
        score = resolveAuditScore(lastAudit);
      }

      const activeRun = activeRuns.get(conf.audit_type) || null;

      statusMap.push({
        agentType: conf.audit_type,
        staleAfterDays: conf.stale_after_days,
        defaultModel: conf.default_model,
        freshness,
        ageDays,
        lastRunAt,
        score,
        dataGap,
        activeRun: activeRun && {
          id: activeRun.id,
          status: activeRun.status,
          createdAt: activeRun.created_at,
          startedAt: activeRun.started_at,
          requestedBy: activeRun.requested_by,
          openclawRunId: activeRun.openclaw_run_id
        }
      });
    }

    // What this client is missing before its audits can use every data source.
    // Surfaced so whoever manages SEO can see the gap and fix it, rather than
    // discovering it as an empty section in a report ten minutes after
    // triggering a run — which is how five google audits produced nothing.
    const clientRow = db.prepare(
      'SELECT gsc_property, ga4_property_id, contact_phone, website_url FROM crm_clients WHERE id = ?'
    ).get(req.params.id);

    const setupGaps = [];
    if (!clientRow?.website_url) {
      setupGaps.push({
        field: 'website_url',
        severity: 'blocking',
        label: 'No website URL',
        detail: 'Nothing can be audited without it. Add it on the client record.',
      });
    }
    if (!clientRow?.gsc_property) {
      setupGaps.push({
        field: 'gsc_property',
        severity: 'limiting',
        label: 'Search Console not linked',
        detail: 'No clicks, impressions, position or indexation data. Verify the site in Search Console, grant the service account access, then store the property.',
      });
    }
    if (!clientRow?.ga4_property_id) {
      setupGaps.push({
        field: 'ga4_property_id',
        severity: 'limiting',
        label: 'GA4 not linked',
        detail: 'No organic traffic, sessions or landing-page data. Add the service account as a Viewer in GA4, then store the numeric property ID.',
      });
    }
    if (!clientRow?.contact_phone) {
      setupGaps.push({
        field: 'contact_phone',
        severity: 'limiting',
        label: 'No contact phone',
        detail: 'Local SEO audits check NAP consistency, which needs a phone number on the client record.',
      });
    }

    res.json({ agents: statusMap, setupGaps });
  } catch (err) {
    console.error('[SEO ROUTE] Status status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/seo/trigger/:agentType
 * Submit an agent run request
 */
router.post('/:id/seo/trigger/:agentType', (req, res) => {
  try {
    const { force, model } = req.body;
    const agentType = req.params.agentType;
    const clientId = req.params.id;

    const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.website_url) return res.status(400).json({ error: 'Client website URL is not configured' });

    // Look up config
    const conf = db.prepare('SELECT * FROM agent_run_config WHERE audit_type = ?').get(agentType);
    if (!conf) return res.status(400).json({ error: `Unknown agent type: ${agentType}` });

    // Refuse skills OpenClaw cannot actually serve. This was previously
    // enforced only in SeoMonitorTab, which meant it guarded the buttons and
    // nothing else — a direct API call, a stale tab or a scheduled run went
    // straight through.
    //
    // Not merely wasteful. OpenClaw confirmed 2026-08-03 that a run with no
    // matching skill does not fail: the model answers from training knowledge,
    // completes the workflow and POSTs a create_seo_audit anyway. The result is
    // a fabricated audit row, indistinguishable from a real one, which then
    // feeds the freshness gate and the client's report.
    const unavailable = UNAVAILABLE_SKILLS.get(agentType);
    if (unavailable) {
      return res.status(400).json({
        error: 'skill_unavailable',
        agentType,
        message: `'${agentType}' cannot be run: ${unavailable}`
      });
    }

    // Refuse a skill OpenClaw has reported as broken or absent.
    //
    // Only enforced once an inventory has actually been received — before the
    // first report we know nothing, and blocking on an empty table would
    // disable every agent. Skipped entirely in that case.
    const skillState = skillStateFor(agentType);
    if (skillState.enforced && !skillState.ok) {
      return res.status(400).json({
        error: 'skill_unhealthy',
        agentType,
        skill: skillState.skillName,
        message: `'${agentType}' cannot be run: ${skillState.reason} (as of OpenClaw's inventory at ${skillState.reportedAt}).`
      });
    }

    const selectedModel = model || conf.default_model;

    // 0. Already in flight? Bail before spending anything. This is checked
    // ahead of the freshness gate because freshness is derived from completed
    // audits — a run queued 2 minutes ago has produced none yet, so freshness
    // would wave a duplicate straight through.
    const inFlight = getActiveRunsForClient(clientId).get(agentType);
    if (inFlight) {
      return res.status(409).json({
        error: 'already_running',
        status: inFlight.status,
        runId: inFlight.id,
        startedAt: inFlight.started_at || inFlight.created_at,
        message: `'${agentType}' is already ${inFlight.status} for this client (run #${inFlight.id}). Cancel it from the queue if you want to re-run it.`
      });
    }

    // 1. Check budget cap
    const budget = db.prepare('SELECT * FROM token_budgets WHERE client_id = ?').get(clientId);
    if (budget && budget.hard_stop === 1) {
      // Calculate current month's spent cost
      const currentMonthStart = new Date();
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0,0,0,0);
      const isoMonthStart = currentMonthStart.toISOString();

      const usageResult = db.prepare(`
        SELECT COALESCE(SUM(estimated_cost_usd + external_api_cost_usd), 0) as totalCost
        FROM token_usage_log
        WHERE client_id = ? AND created_at >= ?
      `).get(clientId, isoMonthStart);

      if (usageResult.totalCost >= budget.monthly_budget_usd) {
        return res.status(403).json({
          error: 'Budget Limit Exceeded',
          message: `This client has spent $${usageResult.totalCost.toFixed(2)} this month, exceeding their hard budget cap of $${budget.monthly_budget_usd.toFixed(2)}.`
        });
      }
    }

    // 2. Freshness check
    if (!force) {
      const lastAudit = db.prepare(`
        SELECT created_at FROM seo_audits
        WHERE client_id = ? AND audit_type = ? AND is_competitor = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(clientId, agentType);

      if (lastAudit) {
        const lastDate = new Date(lastAudit.created_at);
        const ageDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays < conf.stale_after_days) {
          return res.json({
            requiresConfirmation: true,
            lastRunAgeDays: ageDays,
            staleAfterDays: conf.stale_after_days,
            message: `This agent was already run ${ageDays} days ago and is still fresh. Do you want to run it anyway?`
          });
        }
      }
    }

    // 3. Staging and Execution
    const userRole = req.user.role;
    const payload = JSON.stringify({
      agentType,
      url: client.website_url,
      model: selectedModel,
      requested_by_email: req.user.email
    });

    if (userRole === 'admin' || userRole === 'super_admin') {
      // Auto-approved
      const actionResult = db.prepare(`
        INSERT INTO openclaw_pending_actions (client_id, action_type, action_payload, requested_by, requested_role, status)
        VALUES (?, 'run_seo_agent', ?, ?, ?, 'auto_approved')
      `).run(clientId, payload, req.user.id, userRole);

      // Claim the in-flight slot, then spawn. If two clicks race past the
      // check above, the partial unique index lets exactly one through.
      const { run, conflict } = startAgentRun({
        clientId: client.id,
        agentType,
        model: selectedModel,
        requestedBy: req.user.email,
        pendingActionId: actionResult.lastInsertRowid,
        // Per-skill routing: conf.agent_id names the OpenClaw agent, and the
        // agent determines the model. req.body.agentId allows a one-off
        // override for comparing two agents on the same skill.
        agentId: req.body.agentId || conf.agent_id || null
      });

      if (conflict) {
        return res.status(409).json({
          error: 'already_running',
          status: conflict.status,
          runId: conflict.id,
          startedAt: conflict.started_at || conflict.created_at,
          message: `'${agentType}' is already ${conflict.status} for this client (run #${conflict.id}).`
        });
      }

      logAction({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: 'openclaw_auto_approved',
        entityType: 'openclaw_action',
        entityId: actionResult.lastInsertRowid,
        diff: { agentType, client: client.name, status: 'auto_approved' }
      });

      return res.json({
        status: 'auto_approved',
        message: `Trigger request for ${agentType} auto-approved and queued.`,
        actionId: actionResult.lastInsertRowid,
        runId: run.id
      });
    } else {
      // Non-admins cannot start a run.
      //
      // This used to stage a 'pending' row for an admin to approve in the
      // Approval Center. That tab is gone — every SEO run in the system's
      // history was requested by an admin and none ever needed approving — so
      // staging one now would leave the request sitting unapprovable for ever
      // while telling the requester it was queued. Refusing outright is the
      // honest behaviour; flip this to auto-approve if SMMs should be able to
      // spend tokens directly.
      return res.status(403).json({
        error: 'approval_required',
        message: `Running '${agentType}' costs tokens, so it is limited to admins. Ask an admin to run it.`
      });
    }

  } catch (err) {
    console.error('[SEO ROUTE] Trigger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/seo/recommendations/:recId/convert-task
 * Converts an SEO audit recommendation into a Kanban Task card.
 */
router.post('/:id/seo/recommendations/:recId/convert-task', (req, res) => {
  try {
    const { assigned_to, due_date, priority } = req.body;
    const clientId = req.params.id;
    const recId = req.params.recId;

    const rec = db.prepare('SELECT * FROM seo_recommendations WHERE id = ? AND client_id = ?').get(recId, clientId);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });

    // Insert task card
    const title = `[SEO Recommendation] - Fix ${rec.metric}`;
    const description = `### Issue:\n${rec.issue}\n\n### Action Required:\n${rec.action_required}\n\n### Observation:\n${rec.observation || 'N/A'}`;

    const taskResult = db.prepare(`
      INSERT INTO kanban_tasks (client_id, title, description, status, priority, task_type, assigned_to, due_date, created_by)
      VALUES (?, ?, ?, 'todo', ?, 'other', ?, ?, ?)
    `).run(
      clientId,
      title,
      description,
      priority || 'medium',
      assigned_to || null,
      due_date || null,
      req.user.id
    );

    const taskId = taskResult.lastInsertRowid;

    // Link task and update recommendation status to in_progress
    db.prepare(`
      UPDATE seo_recommendations
      SET kanban_task_id = ?, status = 'in_progress'
      WHERE id = ?
    `).run(taskId, recId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'convert_to_task',
      entityType: 'seo_recommendation',
      entityId: recId,
      diff: { taskId, status: 'in_progress' }
    });

    res.json({
      success: true,
      message: 'Recommendation successfully converted and linked to Kanban task.',
      taskId
    });

  } catch (err) {
    console.error('[SEO ROUTE] Convert recommendation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id/seo/recommendations/:recId
 * Update recommendation status directly
 */
router.patch('/:id/seo/recommendations/:recId', (req, res) => {
  try {
    const { status } = req.body;
    const recId = req.params.recId;
    const clientId = req.params.id;

    const allowed = ['open', 'in_progress', 'completed', 'ignored'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const rec = db.prepare('SELECT * FROM seo_recommendations WHERE id = ? AND client_id = ?').get(recId, clientId);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });

    db.prepare('UPDATE seo_recommendations SET status = ? WHERE id = ?').run(status, recId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_status',
      entityType: 'seo_recommendation',
      entityId: recId,
      diff: { from: rec.status, to: status }
    });

    res.json({ success: true, status });
  } catch (err) {
    console.error('[SEO ROUTE] Update recommendation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/seo/competitors
 * Tracked competitors plus their latest audit score per skill, for comparison.
 */
router.get('/:id/seo/competitors', (req, res) => {
  try {
    const clientId = req.params.id;
    const competitors = db.prepare(`
      SELECT * FROM client_competitors WHERE client_id = ? ORDER BY status, domain
    `).all(clientId);

    // Latest competitor audit per (domain, audit_type), so the comparison view
    // shows current standing rather than every historical run.
    const audits = db.prepare(`
      SELECT a.* FROM seo_audits a
      WHERE a.client_id = ? AND a.is_competitor = 1
      ORDER BY a.created_at DESC
    `).all(clientId);

    const byDomain = {};
    for (const audit of audits) {
      let host;
      try { host = new URL(audit.target_url || audit.url).hostname.replace(/^www\./, ''); }
      catch { continue; }
      byDomain[host] ??= {};
      // First seen wins: the query is newest-first, so this keeps the latest.
      byDomain[host][audit.audit_type] ??= {
        auditId: audit.id,
        score: resolveAuditScore(audit),
        createdAt: audit.created_at,
      };
    }

    // The client's own latest scores, to compare against.
    const ownAudits = db.prepare(`
      SELECT * FROM seo_audits
      WHERE client_id = ? AND is_competitor = 0
      ORDER BY created_at DESC
    `).all(clientId);
    const own = {};
    for (const audit of ownAudits) {
      own[audit.audit_type] ??= {
        auditId: audit.id,
        score: resolveAuditScore(audit),
        createdAt: audit.created_at,
      };
    }

    res.json({
      competitors: competitors.map(c => ({
        ...c,
        scores: byDomain[c.domain.replace(/^www\./, '')] || {},
      })),
      own,
    });
  } catch (err) {
    console.error('[SEO ROUTE] Competitors fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/clients/:id/seo/competitors/:competitorId
 * Approve, reject, or relabel a competitor.
 *
 * Discovery proposes; this is where a human decides. A rejected row is kept
 * rather than deleted so discovery can skip re-proposing the same directory
 * or aggregator on every run.
 */
router.patch('/:id/seo/competitors/:competitorId', (req, res) => {
  try {
    const { status, label, notes } = req.body;
    const allowed = ['discovered', 'approved', 'rejected'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const existing = db.prepare(
      'SELECT * FROM client_competitors WHERE id = ? AND client_id = ?'
    ).get(req.params.competitorId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Competitor not found' });

    db.prepare(`
      UPDATE client_competitors
      SET status = COALESCE(?, status),
          label = COALESCE(?, label),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status ?? null, label ?? null, notes ?? null, req.params.competitorId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_competitor',
      entityType: 'client_competitor',
      entityId: Number(req.params.competitorId),
      diff: { domain: existing.domain, status: status ?? existing.status },
    });

    res.json({ competitor: db.prepare('SELECT * FROM client_competitors WHERE id = ?').get(req.params.competitorId) });
  } catch (err) {
    console.error('[SEO ROUTE] Competitor update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/seo/competitors
 * Add a competitor by hand, already approved.
 */
router.post('/:id/seo/competitors', (req, res) => {
  try {
    const { url, label } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    let parsed;
    try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`); }
    catch { return res.status(400).json({ error: 'url is not a valid URL' }); }

    const domain = parsed.hostname.replace(/^www\./, '');
    const client = db.prepare('SELECT website_url FROM crm_clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Auditing the client's own site as its own competitor would sit in the
    // comparison view claiming they are behind themselves.
    try {
      if (new URL(client.website_url).hostname.replace(/^www\./, '') === domain) {
        return res.status(400).json({ error: 'That is this client\'s own site, not a competitor' });
      }
    } catch { /* client has no valid website_url; nothing to clash with */ }

    const result = db.prepare(`
      INSERT INTO client_competitors (client_id, domain, url, label, status)
      VALUES (?, ?, ?, ?, 'approved')
      ON CONFLICT(client_id, domain) DO UPDATE SET
        status = 'approved', label = COALESCE(excluded.label, label), updated_at = datetime('now')
    `).run(req.params.id, domain, parsed.origin, label || null);

    res.json({ competitor: db.prepare('SELECT * FROM client_competitors WHERE client_id = ? AND domain = ?').get(req.params.id, domain), created: result.changes > 0 });
  } catch (err) {
    console.error('[SEO ROUTE] Competitor create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/seo/competitors/:competitorId/audit/:agentType
 * Queue an audit against a competitor's URL.
 *
 * Only approved competitors can be audited — a discovered-but-unreviewed row
 * is a suggestion, and auditing one costs ten minutes and real tokens on a site
 * nobody has confirmed is actually a competitor.
 */
router.post('/:id/seo/competitors/:competitorId/audit/:agentType', (req, res) => {
  try {
    const agentType = req.params.agentType;
    const competitor = db.prepare(
      'SELECT * FROM client_competitors WHERE id = ? AND client_id = ?'
    ).get(req.params.competitorId, req.params.id);
    if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
    if (competitor.status !== 'approved') {
      return res.status(400).json({
        error: 'not_approved',
        message: `'${competitor.domain}' is still ${competitor.status}. Approve it before auditing.`,
      });
    }

    const unavailable = UNAVAILABLE_SKILLS.get(agentType);
    if (unavailable) {
      return res.status(400).json({ error: 'skill_unavailable', message: `'${agentType}' cannot be run: ${unavailable}` });
    }

    // Skills that read Search Console or GA4 cannot work on a domain we do not
    // own, so they would produce a report whose most valuable sections are all
    // "unavailable" — ten minutes and real tokens for very little.
    if (agentType === 'google') {
      return res.status(400).json({
        error: 'not_applicable',
        message: 'The google skill reads Search Console and GA4, which need ownership of the domain. It cannot audit a competitor.',
      });
    }

    const existing = db.prepare(`
      SELECT id FROM seo_agent_runs
      WHERE client_id = ? AND agent_type = ? AND target_url = ? AND status IN ('queued','running')
    `).get(req.params.id, agentType, competitor.url);
    if (existing) {
      return res.status(409).json({ error: 'already_running', message: `Run #${existing.id} is already auditing ${competitor.domain} for '${agentType}'.` });
    }

    const result = db.prepare(`
      INSERT INTO seo_agent_runs (client_id, agent_type, status, requested_by, target_url, is_competitor, created_at)
      VALUES (?, ?, 'queued', ?, ?, 1, datetime('now'))
    `).run(req.params.id, agentType, req.user.email, competitor.url);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'trigger_competitor_audit',
      entityType: 'seo_agent_run',
      entityId: Number(result.lastInsertRowid),
      diff: { agentType, competitor: competitor.domain },
    });

    res.json({
      status: 'queued',
      runId: result.lastInsertRowid,
      message: `Queued '${agentType}' against ${competitor.domain}.`,
    });
  } catch (err) {
    console.error('[SEO ROUTE] Competitor audit trigger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Client-agnostic queue routes, mounted at /api/seo.
 * The dashboard reads these to answer "what is OpenClaw actually working on
 * right now?" — the question that used to be unanswerable, which is how
 * duplicate jobs got queued in the first place.
 */
export const queueRouter = Router();
queueRouter.use(authenticate);

/**
 * GET /api/seo/skills
 * What OpenClaw last reported it has installed, plus the diff against what we
 * expect. Drives the skill-health panel and explains a skill_unhealthy refusal.
 */
queueRouter.get('/skills', (req, res) => {
  try {
    const report = db.prepare(
      'SELECT * FROM openclaw_skill_reports ORDER BY id DESC LIMIT 1'
    ).get();

    if (!report) {
      return res.json({
        reported: false,
        message: 'OpenClaw has not reported a skill inventory yet. Skill health checks are not being enforced.',
        skills: [],
      });
    }

    const skills = db.prepare('SELECT * FROM openclaw_skills ORDER BY name ASC').all();

    // Which audit types the dashboard can actually run, decided by the same
    // rule the trigger route applies, so the UI cannot disagree with it.
    const configured = db.prepare('SELECT audit_type FROM agent_run_config').all();
    const byAuditType = {};
    for (const { audit_type } of configured) {
      const state = skillStateFor(audit_type);
      byAuditType[audit_type] = {
        skill: state.skillName,
        ok: state.ok,
        reason: state.reason || null,
        blockedLocally: UNAVAILABLE_SKILLS.get(audit_type) || null,
      };
    }

    res.json({
      reported: true,
      reportedAt: report.reported_at,
      trigger: report.trigger,
      runnerModel: report.runner_model,
      skillCount: report.skill_count,
      unhealthyCount: report.unhealthy_count,
      missingSkills: JSON.parse(report.missing_skills || '[]'),
      unexpectedSkills: JSON.parse(report.unexpected_skills || '[]'),
      skills,
      byAuditType,
    });
  } catch (err) {
    console.error('[SEO ROUTE] Skill inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/seo/queue
 * Everything in flight across all clients, plus recent finished runs.
 */
queueRouter.get('/queue', (req, res) => {
  try {
    const recentLimit = Math.min(parseInt(req.query.recentLimit, 10) || 20, 100);
    const { active, recent } = listQueue({ recentLimit });
    // Drives the dashboard wording: without a real abort, cancelling frees the
    // slot but saves nothing, and saying otherwise would be a lie.
    res.json({ active, recent, abortSupported: isAbortSupported() });
  } catch (err) {
    console.error('[SEO ROUTE] Queue fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/seo/runs/:runId/cancel
 * Releases our queue slot and stops waiting for the result. This does not
 * interrupt work already running inside OpenClaw — see the OpenClaw asks in
 * the README for the gateway capability that would make it a true cancel.
 */
queueRouter.post('/runs/:runId/cancel', async (req, res) => {
  try {
    // Ask OpenClaw to stop the work first, while the run is still in flight.
    // If that isn't configured or fails, the cancel still proceeds — freeing
    // the slot must never depend on the gateway being reachable.
    const target = getRun(req.params.runId);
    let abort = { ok: false, reason: 'not_configured' };
    if (target && IN_FLIGHT_FOR_ABORT.includes(target.status)) {
      abort = await abortOpenClawRun(target);
      if (abort.ok) {
        broadcastRunLog(target, '[SYSTEM] OpenClaw confirmed the run was aborted. Token spend stopped.');
      } else if (abort.reason !== 'not_configured') {
        broadcastRunLog(target, `[SYSTEM] Abort request to OpenClaw failed (${abort.reason}). Freeing the slot anyway; the job may still be running.`);
      }
    }

    const { run, error } = cancelRun(req.params.runId, req.user.email);

    if (error === 'not_found') return res.status(404).json({ error: 'Run not found' });
    if (error === 'not_in_flight') return res.status(409).json({ error: 'Run has already finished', status: run.status });

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'seo_run_cancelled',
      entityType: 'seo_agent_run',
      entityId: run.id,
      diff: { agentType: run.agent_type, clientId: run.client_id, openclawRunId: run.openclaw_run_id, aborted: abort.ok }
    });

    res.json({
      success: true,
      run,
      aborted: abort.ok,
      message: abort.ok
        ? 'Run aborted inside OpenClaw and cancelled here. Token spend stopped.'
        : 'Run cancelled and the queue slot freed. OpenClaw was not interrupted, so this job keeps running until it finishes on its own.'
    });
  } catch (err) {
    console.error('[SEO ROUTE] Cancel run error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
