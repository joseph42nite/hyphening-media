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
 * Also syncs agent_run_config for the five skills moved to Nemotron 3, since
 * that model change was applied per-environment.
 *
 * Usage (dry run first — makes no changes):
 *   node scripts/reconcile_openclaw_queue.js
 *   node scripts/reconcile_openclaw_queue.js --apply
 */

import db from '../database.js';

const APPLY = process.argv.includes('--apply');

const NEMOTRON = 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free';
const NEMOTRON_SKILLS = ['technical', 'schema', 'sitemap', 'images', 'hreflang'];

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

  // 2. agent_run_config rows still pointing at the old model.
  const placeholders = NEMOTRON_SKILLS.map(() => '?').join(',');
  const wrongModel = db.prepare(`
    SELECT audit_type, default_model FROM agent_run_config
    WHERE audit_type IN (${placeholders}) AND default_model != ?
  `).all(...NEMOTRON_SKILLS, NEMOTRON);

  console.log();
  console.log(`agent_run_config rows needing the Nemotron model id: ${wrongModel.length}`);
  for (const row of wrongModel) {
    console.log(`  ${row.audit_type}: ${row.default_model} -> ${NEMOTRON}`);
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

    const updateModel = db.prepare('UPDATE agent_run_config SET default_model = ? WHERE audit_type = ?');
    for (const skill of NEMOTRON_SKILLS) updateModel.run(NEMOTRON, skill);
  });

  tx();

  console.log();
  console.log(`Resolved ${stale.length} stale pending action(s).`);
  console.log(`Synced ${NEMOTRON_SKILLS.length} agent_run_config row(s) to ${NEMOTRON}.`);
}

main();
