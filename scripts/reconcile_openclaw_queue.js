/**
 * One-off reconciliation for the seo-audit-queue-poller era.
 *
 * Until 2026-07-28, OpenClaw ran a cron that polled GET /api/openclaw/pending
 * for auto_approved run_seo_agent rows and executed them — while the dashboard
 * trigger that created those rows had ALREADY called the hook gateway directly
 * in the same request. Every admin trigger therefore ran twice.
 *
 * The poller also never marked what it processed as resolved, so rows stayed
 * at auto_approved with a null resolved_at and could be picked up again on a
 * later cycle. That is the state this script cleans up.
 *
 * The endpoint no longer serves these rows, so nothing can act on them now.
 * This just stops them misreporting as outstanding work in the approval views.
 *
 * Also corrects agent_run_config to name the model that actually serves these
 * runs. OpenClaw confirmed 2026-07-28 that every skill runs
 * agent.defaults.model.primary and that SKILL.md cannot set a runtime model —
 * so the per-skill values we stored ('kimi', 'deepseek-v4-flash', and briefly
 * a Nemotron id) never routed anything. They are display values, and they were
 * displaying models that never ran.
 *
 * Usage (dry run first — makes no changes):
 *   node scripts/reconcile_openclaw_queue.js
 *   node scripts/reconcile_openclaw_queue.js --apply
 */

import db from '../database.js';

const APPLY = process.argv.includes('--apply');

// The single model every SEO skill actually runs on, per openclaw.json:
//   "agent.defaults.model.primary": "openrouter/deepseek/deepseek-v4-flash"
// Update this only when that value changes — not when a SKILL.md changes.
const ACTUAL_MODEL = 'openrouter/deepseek/deepseek-v4-flash';

function main() {
  console.log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN (pass --apply to commit) ===');
  console.log();

  // 1. Stale auto_approved run_seo_agent rows left behind by the poller.
  const stale = db.prepare(`
    SELECT id, client_id, requested_by, created_at
    FROM openclaw_pending_actions
    WHERE action_type = 'run_seo_agent' AND status = 'auto_approved' AND resolved_at IS NULL
    ORDER BY id
  `).all();

  console.log(`Stale auto_approved run_seo_agent rows: ${stale.length}`);
  if (stale.length) {
    console.log(`  id range: ${stale[0].id}..${stale[stale.length - 1].id}`);
    console.log(`  created:  ${stale[0].created_at} .. ${stale[stale.length - 1].created_at}`);
  }

  // 2. agent_run_config rows naming a model that never actually runs.
  const wrongModel = db.prepare(`
    SELECT audit_type, default_model FROM agent_run_config WHERE default_model != ?
  `).all(ACTUAL_MODEL);

  console.log();
  console.log(`agent_run_config rows naming a model that does not serve them: ${wrongModel.length}`);
  for (const row of wrongModel) {
    console.log(`  ${row.audit_type}: ${row.default_model} -> ${ACTUAL_MODEL}`);
  }

  if (!APPLY) {
    console.log();
    console.log('Nothing changed. Re-run with --apply to commit.');
    return;
  }

  const tx = db.transaction(() => {
    if (stale.length) {
      db.prepare(`
        UPDATE openclaw_pending_actions
        SET status = 'accepted',
            resolved_by = 'system:queue-reconciliation',
            resolved_at = datetime('now')
        WHERE action_type = 'run_seo_agent' AND status = 'auto_approved' AND resolved_at IS NULL
      `).run();
    }

    db.prepare('UPDATE agent_run_config SET default_model = ? WHERE default_model != ?')
      .run(ACTUAL_MODEL, ACTUAL_MODEL);
  });

  tx();

  console.log();
  console.log(`Resolved ${stale.length} stale pending action(s).`);
  console.log(`Corrected ${wrongModel.length} agent_run_config row(s) to ${ACTUAL_MODEL}.`);
}

main();
