/**
 * Marketing Ops Center — OpenClaw Knowledge Service
 * Database wrapper for self-improving operational knowledge.
 */

import db from '../../database.js';

/**
 * Get operational knowledge by key.
 * @param {string} key - The knowledge key
 * @returns {Object|null} Parsed JSON content, or null if not found
 */
export function getKnowledge(key) {
  const row = db.prepare('SELECT * FROM openclaw_operational_knowledge WHERE key = ?').get(key);
  if (!row) return null;

  try {
    return {
      key: row.key,
      type: row.knowledge_type,
      content: JSON.parse(row.content),
      updated_at: row.updated_at,
    };
  } catch {
    return {
      key: row.key,
      type: row.knowledge_type,
      content: row.content,
      updated_at: row.updated_at,
    };
  }
}

/**
 * Upsert operational knowledge.
 * @param {string} key - The knowledge key
 * @param {string} type - Knowledge type (e.g. 'client_preference', 'editor_speed', 'metric_threshold')
 * @param {Object} contentJson - The knowledge content as a JSON-serializable object
 */
export function updateKnowledge(key, type, contentJson) {
  db.prepare(`
    INSERT INTO openclaw_operational_knowledge (key, knowledge_type, content)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      knowledge_type = excluded.knowledge_type,
      content = excluded.content,
      updated_at = datetime('now')
  `).run(key, type, JSON.stringify(contentJson));
}

/**
 * List all knowledge entries.
 * @param {string} [type] - Optional filter by knowledge_type
 */
export function listKnowledge(type) {
  let query = 'SELECT * FROM openclaw_operational_knowledge';
  const params = [];

  if (type) {
    query += ' WHERE knowledge_type = ?';
    params.push(type);
  }

  query += ' ORDER BY updated_at DESC';
  
  return db.prepare(query).all(...params).map(row => ({
    key: row.key,
    type: row.knowledge_type,
    content: (() => { try { return JSON.parse(row.content); } catch { return row.content; } })(),
    updated_at: row.updated_at,
  }));
}
