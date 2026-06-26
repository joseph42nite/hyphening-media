/**
 * Marketing Ops Center — Kanban Task Routes
 * Full task lifecycle: CRUD, status machine, assignment, attribution.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { notifyAdmin, notifyAssignee } from '../services/telegram.js';

const router = Router();

router.use(authenticate);

// Valid status transitions
const STATUS_TRANSITIONS = {
  backlog: ['todo', 'in_progress', 'delivered'],
  todo: ['in_progress', 'backlog', 'delivered'],
  in_progress: ['delivered', 'todo', 'backlog'],
  delivered: ['in_progress', 'todo', 'backlog'],
};

/**
 * GET /api/tasks
 * List tasks with optional filters.
 */
router.get('/', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const { status, client_id, assigned_to, priority } = req.query;
    let query = `
      SELECT t.*, 
        c.name as client_name,
        f.name as freelancer_name,
        u.name as created_by_name,
        (SELECT id FROM marketing_content_tracker WHERE kanban_task_id = t.id) as content_id
      FROM kanban_tasks t
      LEFT JOIN crm_clients c ON t.client_id = c.id
      LEFT JOIN users f ON t.assigned_to = f.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'ops_video_editor') {
      query += " AND t.assigned_to = ? AND t.task_type = 'video'";
      params.push(req.user.id);
    } else {
      if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(parseInt(assigned_to)); }
    }
    if (status) { query += ' AND t.status = ?'; params.push(status); }
    if (client_id) { query += ' AND t.client_id = ?'; params.push(parseInt(client_id)); }
    if (priority) { query += ' AND t.priority = ?'; params.push(priority); }

    query += ' ORDER BY t.updated_at DESC';
    res.json({ tasks: db.prepare(query).all(...params) });
  } catch (err) {
    console.error('[TASKS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks/:id
 */
router.get('/:id', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*, c.name as client_name, f.name as freelancer_name,
        (SELECT id FROM marketing_content_tracker WHERE kanban_task_id = t.id) as content_id
      FROM kanban_tasks t
      LEFT JOIN crm_clients c ON t.client_id = c.id
      LEFT JOIN users f ON t.assigned_to = f.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    if (req.user.role === 'ops_video_editor' && task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: task not assigned to you' });
    }
    
    res.json(task);
  } catch (err) {
    console.error('[TASKS] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks
 */
router.post('/', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const { client_id, title, description, priority, task_type, assigned_to, due_date, drive_link } = req.body;

    if (!title) return res.status(400).json({ error: 'Task title is required' });

    const result = db.prepare(`
      INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, assigned_to, due_date, drive_link, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_id || null, title, description || null,
      priority || 'medium', task_type || 'video',
      assigned_to || null, due_date || null, drive_link || null,
      req.user.id
    );

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'create',
      entityType: 'task',
      entityId: result.lastInsertRowid,
      diff: { title, client_id, assigned_to },
      ip: req.ip,
    });

    // Send Telegram notifications
    try {
      let assigneeName = 'Unassigned';
      let assigneeRole = null;
      if (assigned_to) {
        const user = db.prepare('SELECT name, role FROM users WHERE id = ?').get(assigned_to);
        if (user) {
          assigneeName = user.name;
          assigneeRole = user.role;
        }
      }

      notifyAdmin(`➕ *New Task Created*\n\n` +
        `*Task:* ${title}\n` +
        `*Type:* ${task_type || 'video'}\n` +
        `*Priority:* ${priority || 'medium'}\n` +
        `*Assignee:* ${assigneeName}\n` +
        `*Due Date:* ${due_date || 'N/A'}`);

      if (assigned_to && assigneeRole) {
        notifyAssignee(assigneeRole, `📋 *New Task Assigned*\n\n` +
          `*Task:* ${title}\n` +
          `*Priority:* ${priority || 'medium'}\n` +
          `*Due Date:* ${due_date || 'N/A'}\n` +
          `*Description:* ${description || 'No description provided'}`);
      }
    } catch (telegramErr) {
      console.error('[TELEGRAM] Notification error during task creation:', telegramErr.message);
    }

    const newTask = db.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newTask);
  } catch (err) {
    console.error('[TASKS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task fields (not status — use /status endpoint for that).
 */
router.patch('/:id', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allowedFields = ['title', 'description', 'priority', 'task_type', 'assigned_to', 'due_date', 'drive_link', 'client_id'];
    const updates = {};
    const diff = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        diff[field] = { from: task[field], to: req.body[field] };
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE kanban_tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'update',
      entityType: 'task',
      entityId: parseInt(req.params.id),
      diff,
      ip: req.ip,
    });

    // Send Telegram assignment notification
    try {
      if (req.body.assigned_to !== undefined && req.body.assigned_to !== task.assigned_to && req.body.assigned_to !== null) {
        const user = db.prepare('SELECT name, role FROM users WHERE id = ?').get(req.body.assigned_to);
        if (user) {
          notifyAssignee(user.role, `📋 *New Task Assigned*\n\n` +
            `*Task:* ${updates.title || task.title}\n` +
            `*Priority:* ${updates.priority || task.priority || 'medium'}\n` +
            `*Due Date:* ${updates.due_date || task.due_date || 'N/A'}\n` +
            `*Description:* ${updates.description || task.description || 'No description provided'}`);
        }
      }
    } catch (telegramErr) {
      console.error('[TELEGRAM] Notification error during task update:', telegramErr.message);
    }

    res.json(db.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(req.params.id));
  } catch (err) {
    console.error('[TASKS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/status
 * Transition task to a new status (enforces state machine).
 */
const statusHandler = (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'New status is required' });

    const allowed = STATUS_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${task.status}' to '${status}'`,
        allowed_transitions: allowed || [],
      });
    }

    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };

    // If status is updated to 'todo' and task has a past due date, update due date to today
    if (status === 'todo' && task.due_date) {
      const todayStr = new Date().toLocaleDateString('en-CA');
      if (task.due_date < todayStr) {
        updates.due_date = todayStr;
      }
    }

    // Mark completion
    if (status === 'delivered') {
      updates.completed_at = new Date().toISOString();
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE kanban_tasks SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    // Sync status change back to marketing content tracker if linked
    const contentRow = db.prepare('SELECT id, status FROM marketing_content_tracker WHERE kanban_task_id = ?').get(req.params.id);
    if (contentRow) {
      if (status === 'delivered') {
        db.prepare("UPDATE marketing_content_tracker SET status = 'Posted', updated_at = datetime('now') WHERE id = ?").run(contentRow.id);
      } else {
        if (contentRow.status === 'Posted') {
          db.prepare("UPDATE marketing_content_tracker SET status = 'Pending', updated_at = datetime('now') WHERE id = ?").run(contentRow.id);
        }
      }
    }

    logAction({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'status_change',
      entityType: 'task',
      entityId: parseInt(req.params.id),
      diff: { status: { from: task.status, to: status } },
      ip: req.ip,
    });

    res.json(db.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(req.params.id));
  } catch (err) {
    console.error('[TASKS] Status change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

router.post('/:id/status', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), statusHandler);
router.patch('/:id/status', authorize('admin', 'ops_video_editor', 'ops_social_media_manager'), statusHandler);

/**
 * GET /api/tasks/attribution/report
 * Freelancer attribution report — tasks completed per freelancer.
 */
router.get('/attribution/report', authorize('admin'), (req, res) => {
  try {
    const report = db.prepare(`
      SELECT 
        f.id as freelancer_id,
        f.name as freelancer_name,
        f.role as specialization,
        COUNT(t.id) as total_tasks,
        SUM(CASE WHEN t.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(t.revision_count) as total_revisions,
        ROUND(AVG(t.revision_count), 1) as avg_revisions
      FROM users f
      LEFT JOIN kanban_tasks t ON f.id = t.assigned_to
      WHERE f.is_active = 1
      GROUP BY f.id
      ORDER BY delivered DESC
    `).all();

    res.json({ attribution: report });
  } catch (err) {
    console.error('[TASKS] Attribution error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
