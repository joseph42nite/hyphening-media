/**
 * Ads Monitor API.
 *
 * The paid-media counterpart to routes/seo.js, and deliberately a third its
 * length. Most of what makes the SEO route long is deciding whether a skill's
 * external data source is reachable — a question answered there by reading
 * capabilities out of past audit reports, because the answer lived on another
 * machine. Here the data is local: adsFacts.js knows exactly which sections it
 * could build for a client, so availability is a set membership test rather
 * than an inference, and there is no second copy of the rules for the frontend
 * to drift away from.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { buildFactPack, checkRequirements, currentMonth } from '../services/adsFacts.js';
import {
  createRun, cancelRun, getActiveRunsForClient, listQueue,
} from '../services/adsRuns.js';

// Each agent owns one score column; the rest read the fallback. Same shape as
// the SEO route's map, and for the same reason: a creative score and a pacing
// score must not compete for one cell.
const SCORE_COLUMN_BY_TYPE = {
  audit: 'health_score',
  monitor: 'health_score',
  math: 'efficiency_score',
  budget: 'efficiency_score',
  optimize: 'efficiency_score',
  google: 'efficiency_score',
  meta: 'efficiency_score',
  youtube: 'efficiency_score',
  attribution: 'lead_quality_score',
  server_side_tracking: 'lead_quality_score',
  landing: 'landing_score',
  creative: 'creative_score',
  plan: 'pacing_score',
  report: 'roas_score',
};

const ALL_SCORE_COLUMNS = [
  'health_score', 'efficiency_score', 'lead_quality_score', 'funnel_score',
  'creative_score', 'landing_score', 'pacing_score', 'roas_score', 'audit_score',
];

function resolveScore(audit) {
  if (!audit) return null;
  const preferred = SCORE_COLUMN_BY_TYPE[audit.agent_type];
  if (preferred && audit[preferred] != null) return audit[preferred];
  if (audit.audit_score != null) return audit.audit_score;
  for (const col of ALL_SCORE_COLUMNS) if (audit[col] != null) return audit[col];
  return null;
}

/** Human sentence for a set of missing fact-pack sections. */
function blockedMessage(missing, gaps) {
  const reasons = missing.map(key => {
    const gap = gaps.find(g => g.section === key);
    return gap ? gap.reason : `Missing data: ${key}`;
  });
  // Deduplicated: two missing sections often share one cause (no campaigns
  // recorded), and saying it twice reads as two separate problems.
  return [...new Set(reasons)].join(' ');
}

/** Every ad platform this client has ever recorded spend on.
 *
 *  Ever, not this month. A Google card should not blink out because last month
 *  happened to be Meta-only — the account has Google history to audit either
 *  way, and a card that appears and disappears with the calendar teaches people
 *  to distrust the fleet. */
function platformsEverRun(clientId) {
  const rows = db.prepare(
    'SELECT DISTINCT platform FROM marketing_ad_campaigns WHERE client_id = ? AND platform IS NOT NULL'
  ).all(clientId);
  return new Set(rows.map(r => r.platform));
}

/**
 * Why this card cannot run, or null if it can. The single place both the
 * trigger route and the dashboard ask.
 *
 * Ordered cheapest and most permanent first: a capability this installation
 * does not have outranks data it happens to be missing this month, because the
 * second can fix itself and the first cannot. Reporting the data gap on a
 * statically blocked card would send someone off to add campaign rows that
 * would change nothing.
 */
function blockReason(conf, available, gaps, platforms) {
  if (conf.static_block) return conf.static_block;
  if (conf.platform && !platforms.has(conf.platform)) {
    return `No ${conf.platform} spend has ever been recorded for this client.`;
  }
  const requirement = checkRequirements(conf, available);
  if (!requirement.ok) return blockedMessage(requirement.missing, gaps);
  return null;
}

const router = Router({ mergeParams: true });
router.use(authenticate);

/**
 * GET /api/clients/:id/ads/agents/status
 *
 * The fleet, as the dashboard draws it: every agent with its freshness, its
 * last score, whether it can run at all and why not.
 *
 * The fact pack is built once for the whole request rather than per agent.
 * Twelve agents asking the same five questions of the same tables is twelve
 * times the work for one answer.
 */
router.get('/:id/ads/agents/status', (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const built = buildFactPack(clientId, { month: req.query.month || null });
    if (!built) return res.status(404).json({ error: 'Client not found' });

    const { pack, available, gaps } = built;
    const configs = db.prepare('SELECT * FROM ads_agent_config ORDER BY sort_order ASC').all();
    const activeRuns = getActiveRunsForClient(clientId);
    const platforms = platformsEverRun(clientId);

    const lastAuditStmt = db.prepare(`
      SELECT id, created_at, agent_type, period_month, data_gaps, ${ALL_SCORE_COLUMNS.join(', ')}
      FROM ads_audits
      WHERE client_id = ? AND agent_type = ?
      ORDER BY created_at DESC LIMIT 1
    `);
    const openRecsStmt = db.prepare(`
      SELECT COUNT(*) AS n FROM ads_recommendations r
      JOIN ads_audits a ON a.id = r.audit_id
      WHERE r.client_id = ? AND a.agent_type = ? AND r.status = 'open'
    `);

    const agents = configs.map(conf => {
      const last = lastAuditStmt.get(clientId, conf.agent_type);
      const blocked = blockReason(conf, available, gaps, platforms);

      let freshness = 'never_run';
      let ageDays = null;
      if (last) {
        ageDays = Math.floor((Date.now() - new Date(`${last.created_at.replace(' ', 'T')}Z`).getTime()) / 86_400_000);
        freshness = ageDays < conf.stale_after_days ? 'fresh' : 'stale';
      }

      return {
        agentType: conf.agent_type,
        // The claude-ads skill that serves this card. Sent so the dashboard can
        // name it in a tooltip: when a run fails, "ads-google did not report"
        // is something you can go and check, and "google failed" is not.
        skillName: conf.skill_name,
        platform: conf.platform,
        label: conf.label,
        description: conf.description,
        staleAfterDays: conf.stale_after_days,
        defaultModel: conf.default_model,
        freshness,
        ageDays,
        lastRunAt: last?.created_at || null,
        lastAuditId: last?.id || null,
        periodMonth: last?.period_month || null,
        score: resolveScore(last),
        openRecommendations: openRecsStmt.get(clientId, conf.agent_type).n,
        // Decided here and sent, never re-derived in the browser. The SEO
        // dashboard kept its own copy of this rule and it drifted: a skill sat
        // greyed out for weeks after the thing it needed was connected.
        blockedReason: blocked,
        // Distinguishes "add some data" from "configure something, deliberately".
        blockedPermanently: !!conf.static_block,
        missingData: blocked && !conf.static_block ? checkRequirements(conf, available).missing : [],
        activeRun: activeRuns.get(conf.agent_type) ? {
          id: activeRuns.get(conf.agent_type).id,
          status: activeRuns.get(conf.agent_type).status,
          createdAt: activeRuns.get(conf.agent_type).created_at,
          startedAt: activeRuns.get(conf.agent_type).started_at,
          requestedBy: activeRuns.get(conf.agent_type).requested_by,
          triggerSource: activeRuns.get(conf.agent_type).trigger_source,
        } : null,
      };
    });

    res.json({
      agents,
      focusMonth: pack.focus_month,
      monthsAvailable: pack.sections.spend?.months_available || [],
      factsHash: pack.facts_hash,
      // The gaps are the setup checklist. Shown as data the operator can act
      // on rather than discovered as an empty section in a finished report.
      dataGaps: gaps,
      // A headline the tab can show without loading an audit: what this client
      // spent and returned in the focus month.
      snapshot: pack.sections.spend ? {
        month: pack.sections.spend.focus_month,
        spendInr: pack.sections.spend.account.spend_inr,
        leads: pack.sections.spend.account.leads,
        cplInr: pack.sections.spend.account.cpl_inr,
        ctrPct: pack.sections.spend.account.ctr_pct,
        momSpendPct: pack.sections.spend.account.mom?.spend_pct ?? null,
        momCplPct: pack.sections.spend.account.mom?.cpl_pct ?? null,
        qualifiedLeads: pack.sections.leads?.account.qualified ?? null,
        costPerQualifiedLeadInr: pack.sections.cost_per_outcome?.account.cost_per_qualified_lead_inr ?? null,
        roas: pack.sections.revenue?.roas ?? null,
      } : null,
    });
  } catch (err) {
    console.error('[ADS ROUTE] Agent status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id/ads/facts
 *
 * The exact pack the agents run on, rendered for a human.
 *
 * Its purpose is trust. Every number in every ads report traces to this
 * response, so a conclusion that looks wrong can be checked against its inputs
 * without re-running anything or taking the model's word for the arithmetic.
 */
router.get('/:id/ads/facts', (req, res) => {
  try {
    const built = buildFactPack(Number(req.params.id), { month: req.query.month || null });
    if (!built) return res.status(404).json({ error: 'Client not found' });
    res.json({ ...built.pack, available: [...built.available] });
  } catch (err) {
    console.error('[ADS ROUTE] Facts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/clients/:id/ads/trigger/:agentType
 *
 * Queues a run. Three gates, in the order that makes the cheap refusal happen
 * first: the agent must exist, its data must exist, and nothing of its kind may
 * already be in flight.
 */
router.post('/:id/ads/trigger/:agentType', (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { agentType } = req.params;
    const force = req.body?.force === true;

    const conf = db.prepare('SELECT * FROM ads_agent_config WHERE agent_type = ?').get(agentType);
    if (!conf) return res.status(400).json({ error: `Unknown ads agent: ${agentType}` });

    const client = db.prepare('SELECT id, name FROM crm_clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const built = buildFactPack(clientId, { month: req.body?.month || null });
    const blocked = blockReason(conf, built.available, built.gaps, platformsEverRun(clientId));
    if (blocked) {
      // A blocked agent is refused rather than run on an empty pack. This is
      // the whole reason the requirements exist: an agent handed no data does
      // not fail, it answers from training knowledge, and a fabricated
      // "reallocate ₹40,000 to Google" is indistinguishable from a real one.
      return res.status(400).json({
        error: conf.static_block ? 'not_configured' : 'missing_data',
        agentType,
        skillName: conf.skill_name,
        message: blocked,
      });
    }

    const inFlight = getActiveRunsForClient(clientId).get(agentType);
    if (inFlight) {
      return res.status(409).json({
        error: 'already_running',
        status: inFlight.status,
        runId: inFlight.id,
        startedAt: inFlight.started_at || inFlight.created_at,
        message: `'${conf.label}' is already ${inFlight.status} for this client (run #${inFlight.id}). Cancel it from the queue to re-run.`,
      });
    }

    // Freshness confirmation. A re-run costs tokens and usually reaches the
    // same conclusion over the same fact pack, so it asks once — and says so
    // with the hash, which is the actual argument for not re-running.
    if (!force) {
      const last = db.prepare(`
        SELECT id, created_at, facts_hash FROM ads_audits
        WHERE client_id = ? AND agent_type = ? ORDER BY created_at DESC LIMIT 1
      `).get(clientId, agentType);

      if (last) {
        const ageDays = Math.floor((Date.now() - new Date(`${last.created_at.replace(' ', 'T')}Z`).getTime()) / 86_400_000);
        if (ageDays < conf.stale_after_days) {
          return res.status(409).json({
            error: 'still_fresh',
            lastRunAgeDays: ageDays,
            staleAfterDays: conf.stale_after_days,
            // Identical inputs are a stronger reason to skip than age alone.
            sameData: last.facts_hash === built.hash,
            message: last.facts_hash === built.hash
              ? `Ran ${ageDays} day(s) ago on exactly the same numbers — nothing has changed since. Run anyway?`
              : `Ran ${ageDays} day(s) ago and is still fresh, but the underlying data has changed. Run anyway?`,
          });
        }
      }
    }

    const role = req.user.role;
    if (role !== 'admin' && role !== 'super_admin') {
      // Same rule as the SEO fleet: a run spends tokens, so it is an admin
      // action. There is no approval queue to stage into — staging a request
      // nothing can approve would tell the requester it was queued when it
      // was not.
      return res.status(403).json({
        error: 'approval_required',
        message: `Running '${conf.label}' costs tokens, so it is limited to admins. Ask an admin to run it.`,
      });
    }

    const { run, conflict } = createRun({
      clientId,
      agentType,
      periodMonth: built.pack.focus_month,
      model: req.body?.model || conf.default_model,
      requestedBy: req.user.email,
      triggerSource: req.body?.triggerSource === 'scheduled' ? 'scheduled' : 'manual',
    });

    // The index caught a race the check above could not: two clicks that both
    // passed it. Exactly one gets the slot.
    if (conflict) {
      return res.status(409).json({
        error: 'already_running',
        status: conflict.status,
        runId: conflict.id,
        message: `'${conf.label}' is already ${conflict.status} for this client (run #${conflict.id}).`,
      });
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'ads_agent_triggered',
      entityType: 'ads_agent_run',
      entityId: run.id,
      diff: { agentType, client: client.name, month: built.pack.focus_month, factsHash: built.hash },
    });

    res.json({
      status: 'queued',
      runId: run.id,
      agentType,
      periodMonth: run.period_month,
      startedAt: run.created_at,
      message: `'${conf.label}' queued for ${client.name} (${built.pack.focus_month}).`,
    });
  } catch (err) {
    console.error('[ADS ROUTE] Trigger error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/clients/:id/ads/audits — history, newest first. */
router.get('/:id/ads/audits', (req, res) => {
  try {
    const { type, limit } = req.query;
    const rows = type
      ? db.prepare(`SELECT * FROM ads_audits WHERE client_id = ? AND agent_type = ? ORDER BY created_at DESC LIMIT ?`)
          .all(req.params.id, type, Math.min(Number(limit) || 50, 200))
      : db.prepare(`SELECT * FROM ads_audits WHERE client_id = ? ORDER BY created_at DESC LIMIT ?`)
          .all(req.params.id, Math.min(Number(limit) || 50, 200));
    res.json(rows);
  } catch (err) {
    console.error('[ADS ROUTE] Audits error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/clients/:id/ads/audits/:auditId — one audit with its actions. */
router.get('/:id/ads/audits/:auditId', (req, res) => {
  try {
    const audit = db.prepare('SELECT * FROM ads_audits WHERE id = ? AND client_id = ?')
      .get(req.params.auditId, req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const recommendations = db.prepare(`
      SELECT * FROM ads_recommendations WHERE audit_id = ?
      ORDER BY CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id
    `).all(audit.id);

    res.json({ ...audit, recommendations });
  } catch (err) {
    console.error('[ADS ROUTE] Audit detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/clients/:id/ads/recommendations — the open action list across every
 *  agent, which is what "all I have to do is monitor" actually reduces to. */
router.get('/:id/ads/recommendations', (req, res) => {
  try {
    const status = req.query.status || 'open';
    const rows = db.prepare(`
      SELECT r.*, a.agent_type, a.period_month, a.created_at AS audit_created_at
      FROM ads_recommendations r
      JOIN ads_audits a ON a.id = r.audit_id
      WHERE r.client_id = ? AND (? = 'all' OR r.status = ?)
      ORDER BY CASE r.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
               r.created_at DESC
    `).all(req.params.id, status, status);
    res.json(rows);
  } catch (err) {
    console.error('[ADS ROUTE] Recommendations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /api/clients/:id/ads/recommendations/:recId — status only. */
router.patch('/:id/ads/recommendations/:recId', (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'in_progress', 'completed', 'ignored'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const result = db.prepare('UPDATE ads_recommendations SET status = ? WHERE id = ? AND client_id = ?')
      .run(status, req.params.recId, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Recommendation not found' });

    logAction({
      actorId: req.user.id, actorEmail: req.user.email,
      action: 'ads_recommendation_status', entityType: 'ads_recommendation',
      entityId: Number(req.params.recId), diff: { status },
    });
    res.json({ success: true, status });
  } catch (err) {
    console.error('[ADS ROUTE] Recommendation patch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/clients/:id/ads/recommendations/:recId/convert-task
 *  Pushes an action onto the Kanban board, where the team already looks. */
router.post('/:id/ads/recommendations/:recId/convert-task', (req, res) => {
  try {
    const { assigned_to, due_date, priority } = req.body;
    const rec = db.prepare('SELECT * FROM ads_recommendations WHERE id = ? AND client_id = ?')
      .get(req.params.recId, req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });

    const scope = [rec.platform, rec.campaign_name].filter(Boolean).join(' · ');
    const title = `[Ads] ${rec.metric}${scope ? ` — ${scope}` : ''}`;
    const description = [
      `### Issue\n${rec.issue}`,
      `### Action\n${rec.action_required}`,
      rec.observation ? `### Read off\n${rec.observation}` : null,
      rec.expected_impact ? `### Expected impact\n${rec.expected_impact}` : null,
      // Carried onto the card deliberately. The reason to do this can stop
      // being true between the audit and the task being picked up, and the
      // card is where someone finds out.
      rec.failure_check ? `### This is wrong if\n${rec.failure_check}` : null,
    ].filter(Boolean).join('\n\n');

    const task = db.prepare(`
      INSERT INTO kanban_tasks (client_id, title, description, status, priority, task_type, assigned_to, due_date, created_by)
      VALUES (?, ?, ?, 'todo', ?, 'other', ?, ?, ?)
    `).run(req.params.id, title, description, priority || 'medium', assigned_to || null, due_date || null, req.user.id);

    db.prepare('UPDATE ads_recommendations SET kanban_task_id = ?, status = \'in_progress\' WHERE id = ?')
      .run(task.lastInsertRowid, rec.id);

    logAction({
      actorId: req.user.id, actorEmail: req.user.email,
      action: 'convert_to_task', entityType: 'ads_recommendation',
      entityId: rec.id, diff: { taskId: task.lastInsertRowid },
    });

    res.json({ success: true, taskId: task.lastInsertRowid });
  } catch (err) {
    console.error('[ADS ROUTE] Convert task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Client-agnostic queue routes, mounted at /api/ads.
 */
export const queueRouter = Router();
queueRouter.use(authenticate);

/** GET /api/ads/queue — everything in flight across all clients. */
queueRouter.get('/queue', (req, res) => {
  try {
    res.json(listQueue({ recentLimit: Math.min(Number(req.query.recentLimit) || 20, 100) }));
  } catch (err) {
    console.error('[ADS ROUTE] Queue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/ads/runs/:runId/cancel — frees our slot; a claimed run keeps going. */
queueRouter.post('/runs/:runId/cancel', (req, res) => {
  try {
    const result = cancelRun(Number(req.params.runId), req.user.email);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Run not found' });
    if (result.error === 'not_in_flight') {
      return res.status(409).json({ error: 'not_in_flight', status: result.run.status });
    }
    logAction({
      actorId: req.user.id, actorEmail: req.user.email,
      action: 'ads_run_cancelled', entityType: 'ads_agent_run',
      entityId: Number(req.params.runId), diff: { agentType: result.run.agent_type },
    });
    res.json({ success: true, run: result.run });
  } catch (err) {
    console.error('[ADS ROUTE] Cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ads/overview
 *
 * Every client on one screen: what is in flight, what is overdue, what is
 * waiting to be actioned. This is the monitoring surface — the answer to "is
 * anything wrong anywhere?" without opening twelve cards per client.
 */
queueRouter.get('/overview', (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT id, name FROM crm_clients WHERE client_type = 'marketing' ORDER BY name
    `).all();

    const configs = db.prepare('SELECT * FROM ads_agent_config ORDER BY sort_order').all();
    const month = currentMonth();

    const rows = clients.map(client => {
      const built = buildFactPack(client.id);
      const active = getActiveRunsForClient(client.id);

      let due = 0;
      let blocked = 0;
      const platforms = platformsEverRun(client.id);
      for (const conf of configs) {
        if (blockReason(conf, built.available, built.gaps, platforms)) { blocked++; continue; }
        const last = db.prepare(
          'SELECT created_at FROM ads_audits WHERE client_id = ? AND agent_type = ? ORDER BY created_at DESC LIMIT 1'
        ).get(client.id, conf.agent_type);
        if (!last) { due++; continue; }
        const ageDays = Math.floor((Date.now() - new Date(`${last.created_at.replace(' ', 'T')}Z`).getTime()) / 86_400_000);
        if (ageDays >= conf.stale_after_days) due++;
      }

      const openRecs = db.prepare(`
        SELECT priority, COUNT(*) AS n FROM ads_recommendations
        WHERE client_id = ? AND status = 'open' GROUP BY priority
      `).all(client.id);

      const spend = built.pack.sections.spend;
      return {
        clientId: client.id,
        clientName: client.name,
        focusMonth: spend?.focus_month || null,
        // Named explicitly rather than implied by a null month: a client whose
        // latest spend row is two months old looks identical to one with no
        // spend at all on a dashboard that only shows the month.
        spendCurrent: spend ? spend.months_available.includes(month) : false,
        spendInr: spend?.account.spend_inr ?? null,
        leads: spend?.account.leads ?? null,
        cplInr: spend?.account.cpl_inr ?? null,
        momCplPct: spend?.account.mom?.cpl_pct ?? null,
        inFlight: active.size,
        agentsDue: due,
        agentsBlocked: blocked,
        openRecommendations: openRecs.reduce((sum, r) => sum + r.n, 0),
        criticalRecommendations: openRecs.find(r => r.priority === 'Critical')?.n || 0,
      };
    });

    res.json({ month, clients: rows, queue: listQueue({ recentLimit: 10 }) });
  } catch (err) {
    console.error('[ADS ROUTE] Overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
