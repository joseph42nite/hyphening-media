import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { startAgentRun } from '../services/agentRunner.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/approval/pending
 * Lists all pending agent trigger requests
 */
router.get('/pending', authorize('admin'), (req, res) => {
  try {
    const pending = db.prepare(`
      SELECT p.*, c.name AS client_name
      FROM openclaw_pending_actions p
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at DESC
    `).all();

    // Parse JSON action payloads for display
    const mapped = pending.map(row => {
      let parsed = {};
      try {
        parsed = JSON.parse(row.action_payload);
      } catch (e) {
        parsed = { error: 'Invalid payload JSON' };
      }
      return { ...row, action_payload: parsed };
    });

    res.json({ pending: mapped });
  } catch (err) {
    console.error('[APPROVAL] Pending fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/approval/history
 * Lists resolved/historical actions
 */
router.get('/history', authorize('admin'), (req, res) => {
  try {
    const history = db.prepare(`
      SELECT p.*, c.name AS client_name, u.email AS requester_email
      FROM openclaw_pending_actions p
      LEFT JOIN crm_clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.requested_by = u.id
      WHERE p.status IN ('accepted', 'rejected', 'auto_approved')
      ORDER BY p.resolved_at DESC, p.created_at DESC
      LIMIT 50
    `).all();

    // Parse JSON action payloads for display
    const mapped = history.map(row => {
      let parsed = {};
      try {
        parsed = JSON.parse(row.action_payload);
      } catch (e) {
        parsed = { error: 'Invalid payload JSON' };
      }
      return { ...row, action_payload: parsed };
    });

    res.json({ history: mapped });
  } catch (err) {
    console.error('[APPROVAL] History fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/approval/:actionId/approve
 * Approves a pending request and spawns the runner
 */
router.post('/:actionId/approve', authorize('admin'), (req, res) => {
  try {
    const actionId = req.params.actionId;
    const action = db.prepare('SELECT * FROM openclaw_pending_actions WHERE id = ? AND status = ?').get(actionId, 'pending');
    if (!action) return res.status(404).json({ error: 'Pending action not found' });

    let payload = {};
    try {
      payload = JSON.parse(action.action_payload);
    } catch (e) {
      return res.status(400).json({ error: 'Malformed payload data' });
    }

    // Claim the in-flight slot first — approving the same request twice, or
    // approving one while an identical run is already going, must not spawn
    // a second billable job.
    const { run, conflict } = startAgentRun({
      clientId: action.client_id,
      agentType: payload.agentType,
      model: payload.model,
      requestedBy: payload.requested_by_email,
      pendingActionId: Number(actionId)
    });

    if (conflict) {
      return res.status(409).json({
        error: 'already_running',
        runId: conflict.id,
        message: `'${payload.agentType}' is already ${conflict.status} for this client (run #${conflict.id}). Approve again once it finishes, or cancel it from the queue.`
      });
    }

    // Mark as accepted
    db.prepare('UPDATE openclaw_pending_actions SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
      .run('accepted', req.user.email, new Date().toISOString(), actionId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'openclaw_action_approved',
      entityType: 'openclaw_action',
      entityId: actionId,
      diff: { agentType: payload.agentType, model: payload.model, client_id: action.client_id, runId: run.id }
    });

    res.json({ success: true, runId: run.id, message: 'Action successfully approved and executed.' });
  } catch (err) {
    console.error('[APPROVAL] Approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/approval/:actionId/reject
 * Rejects a pending request
 */
router.post('/:actionId/reject', authorize('admin'), (req, res) => {
  try {
    const actionId = req.params.actionId;
    const action = db.prepare('SELECT * FROM openclaw_pending_actions WHERE id = ? AND status = ?').get(actionId, 'pending');
    if (!action) return res.status(404).json({ error: 'Pending action not found' });

    // Mark as rejected
    db.prepare('UPDATE openclaw_pending_actions SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
      .run('rejected', req.user.email, new Date().toISOString(), actionId);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'openclaw_action_rejected',
      entityType: 'openclaw_action',
      entityId: actionId
    });

    res.json({ success: true, message: 'Action successfully rejected and cancelled.' });
  } catch (err) {
    console.error('[APPROVAL] Reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
