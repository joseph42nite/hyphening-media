/**
 * Manual or auto, per fleet.
 *
 * Read by the scheduler before every unattended run, so a fleet set to manual
 * does nothing on its own no matter what cron entries exist. Stored rather than
 * read from env so it can be flipped from the dashboard without a redeploy.
 */

import db from '../../database.js';

export const MODES = ['manual', 'auto'];

export function getMode(scope) {
  const row = db.prepare('SELECT mode FROM automation_modes WHERE scope = ?').get(scope);
  // A missing row is manual, not auto: failing closed is the safe default for
  // anything that spends money.
  return row?.mode === 'auto' ? 'auto' : 'manual';
}

export function setMode(scope, mode) {
  if (!MODES.includes(mode)) throw new Error(`Invalid automation mode: ${mode}`);
  db.prepare(`
    INSERT INTO automation_modes (scope, mode, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(scope) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
  `).run(scope, mode);
  return getMode(scope);
}
