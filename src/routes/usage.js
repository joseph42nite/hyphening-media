import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/usage/summary
 * Aggregate usage spend metrics filterable by client, agent, staff, and date ranges.
 */
router.get('/summary', authorize('admin'), (req, res) => {
  try {
    const { client_id, agent_type, triggered_by, from, to } = req.query;
    
    let query = `
      SELECT 
        t.client_id, 
        c.name AS client_name,
        t.agent_type,
        t.model,
        t.triggered_by,
        SUM(t.input_tokens) AS input_tokens,
        SUM(t.output_tokens) AS output_tokens,
        SUM(t.estimated_cost_usd) AS estimated_cost_usd,
        SUM(t.external_api_cost_usd) AS external_api_cost_usd,
        (SUM(t.estimated_cost_usd) + SUM(t.external_api_cost_usd)) AS total_cost_usd,
        COUNT(t.id) as run_count
      FROM token_usage_log t
      LEFT JOIN crm_clients c ON t.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (client_id) {
      query += ' AND t.client_id = ?';
      params.push(client_id);
    }
    if (agent_type) {
      query += ' AND t.agent_type = ?';
      params.push(agent_type);
    }
    if (triggered_by) {
      query += ' AND t.triggered_by = ?';
      params.push(triggered_by);
    }
    if (from) {
      query += ' AND t.created_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND t.created_at <= ?';
      params.push(to);
    }

    query += ' GROUP BY t.client_id, t.agent_type, t.model, t.triggered_by';

    const summary = db.prepare(query).all(...params);
    res.json({ summary });
  } catch (err) {
    console.error('[USAGE] Fetch summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/usage/budget/:clientId
 * Return budget status for a given client
 */
router.get('/budget/:clientId', authorize('admin'), (req, res) => {
  try {
    const clientId = req.params.clientId;
    
    // Find budget limits
    let budget = db.prepare('SELECT * FROM token_budgets WHERE client_id = ?').get(clientId);
    if (!budget) {
      // Create a default budget row
      db.prepare('INSERT INTO token_budgets (client_id, monthly_budget_usd, alert_threshold_pct, hard_stop) VALUES (?, 50.0, 80, 0)').run(clientId);
      budget = { client_id: clientId, monthly_budget_usd: 50.0, alert_threshold_pct: 80, hard_stop: 0 };
    }

    // Get current month's spent cost
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0,0,0,0);
    const isoMonthStart = currentMonthStart.toISOString();

    const spent = db.prepare(`
      SELECT 
        COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
        COALESCE(SUM(external_api_cost_usd), 0) AS external_api_cost_usd,
        COALESCE(SUM(estimated_cost_usd + external_api_cost_usd), 0) AS total_cost_usd
      FROM token_usage_log
      WHERE client_id = ? AND created_at >= ?
    `).get(clientId, isoMonthStart);

    res.json({
      budget,
      spent: {
        estimated_cost_usd: spent.estimated_cost_usd,
        external_api_cost_usd: spent.external_api_cost_usd,
        total_cost_usd: spent.total_cost_usd,
        month: currentMonthStart.toISOString().slice(0, 7)
      }
    });
  } catch (err) {
    console.error('[USAGE] Fetch client budget error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/usage/budget/:clientId
 * Updates client budget caps and hard stop logic
 */
router.patch('/budget/:clientId', authorize('admin'), (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { monthly_budget_usd, alert_threshold_pct, hard_stop } = req.body;

    const budget = db.prepare('SELECT * FROM token_budgets WHERE client_id = ?').get(clientId);
    if (!budget) {
      db.prepare('INSERT INTO token_budgets (client_id, monthly_budget_usd, alert_threshold_pct, hard_stop) VALUES (?, ?, ?, ?)')
        .run(clientId, monthly_budget_usd ?? 50.0, alert_threshold_pct ?? 80, hard_stop ?? 0);
    } else {
      db.prepare(`
        UPDATE token_budgets 
        SET monthly_budget_usd = COALESCE(?, monthly_budget_usd),
            alert_threshold_pct = COALESCE(?, alert_threshold_pct),
            hard_stop = COALESCE(?, hard_stop)
        WHERE client_id = ?
      `).run(monthly_budget_usd, alert_threshold_pct, hard_stop, clientId);
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_budget',
      entityType: 'client_budget',
      entityId: clientId,
      diff: { monthly_budget_usd, alert_threshold_pct, hard_stop }
    });

    res.json({ success: true, message: 'Client token budget updated successfully.' });
  } catch (err) {
    console.error('[USAGE] Update client budget error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
