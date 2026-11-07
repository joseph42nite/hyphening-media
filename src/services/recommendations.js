/**
 * Retiring recommendations a newer run of the same check has replaced.
 *
 * Neither fleet did this, so every re-run added its findings on top of the
 * last run's: DentAlchemy had 106 open ads recommendations after three monitor
 * runs and one fleet run, most of them the same "fix attribution" item filed
 * again. A run's findings are its whole current view, so when the same check
 * runs again its earlier OPEN items are retired.
 *
 * Only items still untouched are retired: anything a person moved on (in
 * progress, completed, turned into a task) or the SEO night pipeline picked up
 * (ready to deploy, needs 007, fix failed) is left exactly as it is. Retired
 * items become 'ignored' with superseded_by_audit_id naming the run that
 * replaced them, so the trail survives and nothing reads as dismissed by hand.
 *
 * Shared by the SEO and ads audit webhooks.
 */

import db from '../../database.js';

/** Which earlier audits count as "the same check", per fleet. */
const SAME_CHECK = {
  ads: {
    recs: 'ads_recommendations',
    audits: 'ads_audits',
    match: 'a.agent_type = ?',
    extra: '',
  },
  seo: {
    recs: 'seo_recommendations',
    audits: 'seo_audits',
    // Same skill on the same page of the same site, and own-site vs competitor
    // kept apart: a competitor audit must never retire the client's own items.
    match: 'a.audit_type = ? AND COALESCE(a.page_url, a.url) = ? AND COALESCE(a.is_competitor, 0) = ?',
    // An item already in a night fix batch belongs to that batch.
    extra: 'AND fix_batch_id IS NULL',
  },
};

/**
 * Retires the open, untouched items from earlier audits of the same check.
 * `params` fill SAME_CHECK[fleet].match in order. Returns how many were retired.
 */
export function supersedeOpenRecommendations(fleet, { clientId, newAuditId, params }) {
  const cfg = SAME_CHECK[fleet];
  if (!cfg) throw new Error(`Unknown fleet: ${fleet}`);
  return db.prepare(`
    UPDATE ${cfg.recs}
    SET status = 'ignored', superseded_by_audit_id = ?
    WHERE client_id = ? AND status = 'open' AND kanban_task_id IS NULL ${cfg.extra}
      AND audit_id != ?
      AND audit_id IN (
        SELECT a.id FROM ${cfg.audits} a
        WHERE a.client_id = ? AND a.id < ? AND ${cfg.match}
      )
  `).run(newAuditId, clientId, newAuditId, clientId, newAuditId, ...params).changes;
}
