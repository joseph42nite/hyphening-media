import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { registerPendingAudit } from '../services/pendingAudits.js';
import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router({ mergeParams: true });
router.use(authenticate);

// Helper to spawn agent runner asynchronously
function spawnAgent(clientId, agentType, model, requestedBy) {
  const runnerPath = path.resolve(__dirname, '../../openclaw_seo_runner.js');
  const args = [
    runnerPath,
    '--clientId', clientId,
    '--skill', agentType,
    '--model', model,
    '--triggeredBy', requestedBy
  ];

  console.log(`[SEO ROUTE] Spawning: node ${args.join(' ')}`);

  import('../../server.js').then(({ broadcastEvent }) => {
    // Notify frontend agent is now running
    broadcastEvent('seo_agent_status', {
      clientId,
      agentType,
      status: 'running'
    });

    const child = spawn(process.execPath || 'node', args, {
      cwd: path.resolve(__dirname, '../..')
    });

    let stdoutBuffer = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          broadcastEvent('seo_agent_log', {
            clientId,
            agentType,
            log: line
          });
        }
      }
    });

    let stderrBuffer = '';
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          broadcastEvent('seo_agent_log', {
            clientId,
            agentType,
            log: `[ERROR] ${line}`
          });
        }
      }
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim()) {
        broadcastEvent('seo_agent_log', {
          clientId,
          agentType,
          log: stdoutBuffer
        });
      }
      if (stderrBuffer.trim()) {
        broadcastEvent('seo_agent_log', {
          clientId,
          agentType,
          log: `[ERROR] ${stderrBuffer}`
        });
      }

      if (code === 0) {
        // Trigger hand-off succeeded — the actual audit is still running on
        // OpenClaw's side. Stay in 'running' and wait for the
        // create_seo_audit webhook to mark completion; fall back to
        // 'failed' if OpenClaw never reports back.
        broadcastEvent('seo_agent_log', {
          clientId,
          agentType,
          log: '[SYSTEM] Trigger accepted by OpenClaw. Awaiting audit results...'
        });
        registerPendingAudit(clientId, agentType, () => {
          broadcastEvent('seo_agent_log', {
            clientId,
            agentType,
            log: '[TIMEOUT] No audit result received from OpenClaw within 15 minutes.'
          });
          broadcastEvent('seo_agent_status', {
            clientId,
            agentType,
            status: 'failed'
          });
        });
      } else {
        broadcastEvent('seo_agent_status', {
          clientId,
          agentType,
          status: 'failed'
        });
      }
    });

    child.on('error', (err) => {
      console.error(`[SEO ROUTE] Spawning runner failed for ${agentType}:`, err);
      broadcastEvent('seo_agent_log', {
        clientId,
        agentType,
        log: `[SYSTEM ERROR] Failed to spawn agent: ${err.message}`
      });
      broadcastEvent('seo_agent_status', {
        clientId,
        agentType,
        status: 'failed'
      });
    });
  }).catch(err => {
    console.error(`[SEO ROUTE] Failed to import broadcastEvent:`, err);
  });
}

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
    const statusMap = [];

    for (const conf of configs) {
      // Find last successful audit
      const lastAudit = db.prepare(`
        SELECT id, created_at, health_score, technical_score, backlinks_score, local_score, on_page_score, schema_score
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
        score = lastAudit.health_score ?? lastAudit.technical_score ?? lastAudit.backlinks_score ?? lastAudit.local_score ?? lastAudit.on_page_score ?? lastAudit.schema_score ?? null;
      }

      statusMap.push({
        agentType: conf.audit_type,
        staleAfterDays: conf.stale_after_days,
        defaultModel: conf.default_model,
        freshness,
        ageDays,
        lastRunAt,
        score
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

    const selectedModel = model || conf.default_model;

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

      // Trigger runner asynchronously
      spawnAgent(client.id, agentType, selectedModel, req.user.email);

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
        actionId: actionResult.lastInsertRowid
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

export default router;
