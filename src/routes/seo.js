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
  // 'google' ran unblocked from 2026-08-04: the worker reports tier 0, so
  // PageSpeed, CrUX and CrUX History return real field data. Search Console,
  // Indexing and GA4 still need a service account, and facts.mjs records that
  // per run so the report states them as unavailable instead of estimating.
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
  'local_score', 'sxo_score',
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

function resolveAuditScore(audit) {
  if (!audit) return null;
  const preferred = SCORE_COLUMN_BY_TYPE[audit.audit_type];
  if (preferred && audit[preferred] != null) return audit[preferred];
  if (audit.health_score != null) return audit.health_score;
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
    let query = 'SELECT * FROM seo_audits WHERE client_id = ?';
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
      // Selects every score column — content_score, sxo_score, geo_score and
      // performance_score were previously omitted, so skills writing those
      // showed no score on their card no matter what the audit contained.
      const lastAudit = db.prepare(`
        SELECT id, created_at, audit_type, health_score, technical_score, content_score,
               on_page_score, schema_score, performance_score, geo_score,
               backlinks_score, local_score, sxo_score
        FROM seo_audits
        WHERE client_id = ? AND audit_type = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(client.id, conf.audit_type);

      let freshness = 'never_run';
      let ageDays = null;
      let lastRunAt = null;
      let score = null;

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

    res.json({ agents: statusMap });
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
        WHERE client_id = ? AND audit_type = ?
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
      // Put in pending action queue
      const actionResult = db.prepare(`
        INSERT INTO openclaw_pending_actions (client_id, action_type, action_payload, requested_by, requested_role, status)
        VALUES (?, 'run_seo_agent', ?, ?, ?, 'pending')
      `).run(clientId, payload, req.user.id, userRole);

      logAction({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: 'openclaw_staged',
        entityType: 'openclaw_action',
        entityId: actionResult.lastInsertRowid,
        diff: { agentType, client: client.name, status: 'pending' }
      });

      // Notify SSE clients that a request needs review
      if (req.app.get('broadcastEvent')) {
        req.app.get('broadcastEvent')('pending_action_created', {
          actionId: actionResult.lastInsertRowid,
          clientName: client.name,
          agentType,
          requestedBy: req.user.email
        });
      }

      return res.json({
        status: 'pending_approval',
        message: `Your run request for ${agentType} has been queued and is waiting for administrator approval.`,
        actionId: actionResult.lastInsertRowid
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
