/**
 * Marketing Ops Center — Audit Logger
 * Records all mutations for compliance and debugging.
 */

import db from '../../database.js';

const insertLog = db.prepare(`
  INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, diff, ip_address)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Log an auditable action.
 * @param {Object} params
 * @param {number} params.actorId - User ID performing the action
 * @param {string} params.actorEmail - User email
 * @param {string} params.action - e.g. 'create', 'update', 'delete', 'login'
 * @param {string} params.entityType - e.g. 'client', 'task', 'freelancer'
 * @param {number} params.entityId - ID of the affected entity
 * @param {Object} [params.diff] - JSON-serializable diff of changes
 * @param {string} [params.ip] - Client IP address
 */
export function logAction({ actorId, actorEmail, action, entityType, entityId, diff, ip }) {
  try {
    insertLog.run(
      actorId || null,
      actorEmail || null,
      action,
      entityType,
      entityId || null,
      diff ? JSON.stringify(diff) : null,
      ip || null
    );
  } catch (err) {
    // Never let audit logging crash the request
    console.error('[AUDIT] Failed to log action:', err.message);
  }
}

/**
 * Get audit logs with filtering.
 */
export function getAuditLogs({ entityType, entityId, actorId, limit = 50, offset = 0 } = {}) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (entityType) {
    query += ' AND entity_type = ?';
    params.push(entityType);
  }
  if (entityId) {
    query += ' AND entity_id = ?';
    params.push(entityId);
  }
  if (actorId) {
    query += ' AND actor_id = ?';
    params.push(actorId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}
