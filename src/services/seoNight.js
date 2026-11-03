/**
 * Night SEO (master plan Phase 6). The bots start each step; this file is the
 * server's half of it.
 *
 *   01:15 IST  Tanner: queueNightAudits() — each SEO-on client's overdue skills, 3 at most
 *   03:30 IST  Boothroyd: queueSeoFixes() — one fix batch per client with a site repo
 *              → the Mac's seo_fix_worker sorts the open recommendations, closes the ones
 *                already done in the code, fixes the safe ones on a branch, and reports
 *                back (claim / triage / submit below). A client's batch waits until that
 *                client's night audits have finished, so it works on their findings.
 *   morning    007 reads nightReport() in the SEO Monitor and presses Deploy or Discard
 *              → the Mac's deploy_worker pushes and deploys per the repo's manifest
 *
 * Both queue steps do nothing unless the SEO fleet is on Auto. Nothing reaches a
 * live site without the Deploy button; the decision is in the vault:
 * Companies/Hyphening/Decisions/SEO night autonomy and one-click deploy.md.
 */

import db from '../../database.js';
import { getMode } from './automationMode.js';
import { startAgentRun } from './agentRunner.js';
import { getActiveRunsForClient } from './agentRuns.js';
import { unavailableReason, skillStateFor, resolveAuditScore } from '../routes/seo.js';

export const NIGHT_SKILLS_PER_CLIENT = 3;
export const NIGHT_FIXES_PER_CLIENT = 8;
const TRIAGE_LIMIT = 40;

// Never queued at night. 'full' repeats the single skills; 'flow' is a 90-day
// planning pass; the backlink and DataForSEO skills have no data source yet
// (no Moz, Bing or DataForSEO key), so they would only report the outage.
const NIGHT_SKIP = new Set(['full', 'flow', 'backlinks', 'backlink_gap', 'dataforseo', 'maps']);
const OPEN_BATCH = ['queued', 'running', 'ready', 'deploy_queued', 'deploying'];

/** The IST date a night belongs to (01:15 on the 4th → '2026-11-04'). */
export function istDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function overBudget(clientId) {
  const budget = db.prepare('SELECT * FROM token_budgets WHERE client_id = ?').get(clientId);
  if (!budget || budget.hard_stop !== 1) return false;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const spent = db.prepare(`
    SELECT COALESCE(SUM(estimated_cost_usd + external_api_cost_usd), 0) AS total
    FROM token_usage_log WHERE client_id = ? AND created_at >= ?
  `).get(clientId, start.toISOString()).total;
  return spent >= budget.monthly_budget_usd;
}

/**
 * A client's overdue skills, most overdue first (never run counts as most).
 * The same gates as the Run button: unavailable or unhealthy skills and runs
 * already in flight are left out.
 */
export function dueSkills(clientId) {
  const active = getActiveRunsForClient(clientId);
  const rows = db.prepare(`
    SELECT c.audit_type, c.stale_after_days,
           (SELECT MAX(created_at) FROM seo_audits a
             WHERE a.client_id = ? AND a.audit_type = c.audit_type AND a.is_competitor = 0) AS last_run
    FROM agent_run_config c
    WHERE c.stale_after_days < 9999
  `).all(clientId);
  const now = Date.now();
  return rows
    .filter((r) => !NIGHT_SKIP.has(r.audit_type) && !active.has(r.audit_type))
    .map((r) => {
      const ageDays = r.last_run ? (now - new Date(`${r.last_run.replace(' ', 'T')}Z`).getTime()) / 86400000 : Infinity;
      return { ...r, overdue_days: ageDays - r.stale_after_days };
    })
    .filter((r) => r.overdue_days >= 0)
    .filter((r) => !unavailableReason(r.audit_type, clientId))
    .filter((r) => { const s = skillStateFor(r.audit_type); return !s.enforced || s.ok; })
    .sort((a, b) => b.overdue_days - a.overdue_days);
}

/** Tanner, 01:15 IST: queue each SEO-on client's overdue skills. */
export function queueNightAudits({ by = 'agent', clientId = null } = {}) {
  if (getMode('seo') !== 'auto') return { queued: [], skipped: [{ reason: 'SEO fleet is on Manual' }] };
  const clients = db.prepare(`
    SELECT id, name, website_url FROM crm_clients
    WHERE is_active = 1 AND seo_enabled = 1 ${clientId ? 'AND id = ?' : ''} ORDER BY id
  `).all(...(clientId ? [clientId] : []));

  const queued = [];
  const skipped = [];
  for (const client of clients) {
    if (!client.website_url) { skipped.push({ client_name: client.name, reason: 'no website URL' }); continue; }
    if (overBudget(client.id)) { skipped.push({ client_name: client.name, reason: 'monthly budget cap reached' }); continue; }
    const due = dueSkills(client.id).slice(0, NIGHT_SKILLS_PER_CLIENT);
    if (due.length === 0) { skipped.push({ client_name: client.name, reason: 'nothing overdue' }); continue; }
    for (const skill of due) {
      const conf = db.prepare('SELECT * FROM agent_run_config WHERE audit_type = ?').get(skill.audit_type);
      const { run, conflict } = startAgentRun({
        clientId: client.id, agentType: skill.audit_type, model: conf.default_model,
        requestedBy: `night:${by}`, agentId: conf.agent_id || null,
      });
      if (run) queued.push({ run_id: run.id, client_id: client.id, client_name: client.name, agent_type: skill.audit_type });
      else if (conflict) skipped.push({ client_name: client.name, reason: `${skill.audit_type} already ${conflict.status}` });
    }
  }
  return { queued, skipped };
}

/** Boothroyd, 03:30 IST: one fix batch per SEO-on client that has a site repo on the Mac. */
export function queueSeoFixes({ by = 'agent', clientId = null } = {}) {
  if (getMode('seo') !== 'auto') return { queued: [], skipped: [{ reason: 'SEO fleet is on Manual' }] };
  const clients = db.prepare(`
    SELECT id, name, repo_path FROM crm_clients
    WHERE is_active = 1 AND seo_enabled = 1 ${clientId ? 'AND id = ?' : ''} ORDER BY id
  `).all(...(clientId ? [clientId] : []));

  const queued = [];
  const skipped = [];
  const night = istDate();
  for (const client of clients) {
    if (!client.repo_path) { skipped.push({ client_name: client.name, reason: 'no site repo set (audits only)' }); continue; }
    // Open, or a failed deploy whose fixes are still waiting for Retry deploy.
    const open = db.prepare(`
      SELECT b.id, b.status FROM seo_fix_batches b WHERE b.client_id = ? AND (
        b.status IN (${OPEN_BATCH.map(() => '?').join(',')})
        OR (b.status = 'deploy_failed' AND EXISTS (SELECT 1 FROM seo_recommendations r WHERE r.fix_batch_id = b.id AND r.status = 'ready_to_deploy'))
      ) ORDER BY b.id DESC LIMIT 1
    `).get(client.id, ...OPEN_BATCH);
    if (open) {
      skipped.push({ client_name: client.name, reason: ['ready', 'deploy_failed'].includes(open.status) ? 'last night\'s fixes are waiting for Deploy or Discard' : `a batch is already ${open.status}` });
      continue;
    }
    const candidates = db.prepare(`
      SELECT COUNT(*) AS n FROM seo_recommendations
      WHERE client_id = ? AND status = 'open' AND (fix_triage IS NULL OR fix_approved = 1)
    `).get(client.id).n;
    if (candidates === 0) { skipped.push({ client_name: client.name, reason: 'no new recommendations to look at' }); continue; }
    const res = db.prepare(`
      INSERT INTO seo_fix_batches (client_id, night, status, requested_by) VALUES (?, ?, 'queued', ?)
    `).run(client.id, night, by);
    queued.push({ batch_id: res.lastInsertRowid, client_id: client.id, client_name: client.name, candidates });
  }
  return { queued, skipped };
}

// ----------------------------------------------------------- fix worker side

/** The fix worker takes every queued batch, with what it needs to work on. */
export function claimSeoFixBatches(worker = 'mac') {
  const claim = db.transaction(() => {
    // A client whose skills are still queued or running waits: its fixes should
    // be sorted against tonight's findings, and two Claude runs on the same
    // repo at once is how 2026-11-03's local and cluster runs failed.
    const batches = db.prepare(`
      SELECT * FROM seo_fix_batches b WHERE b.status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM seo_agent_runs r WHERE r.client_id = b.client_id AND r.status IN ('queued', 'running'))
      ORDER BY b.id
    `).all();
    for (const b of batches) {
      db.prepare("UPDATE seo_fix_batches SET status = 'running', started_at = datetime('now'), updated_at = datetime('now'), log = ? WHERE id = ?")
        .run(`claimed by ${worker}`, b.id);
    }
    return batches;
  });
  return claim().map((b) => {
    const client = db.prepare('SELECT id, name, website_url, repo_path, blog_compliance_profile FROM crm_clients WHERE id = ?').get(b.client_id);
    const candidates = db.prepare(`
      SELECT r.id, r.priority, r.metric, r.issue, r.action_required, r.observation, r.page_url, r.fix_approved, r.fix_triage,
             a.audit_type
      FROM seo_recommendations r JOIN seo_audits a ON a.id = r.audit_id
      WHERE r.client_id = ? AND r.status = 'open' AND (r.fix_triage IS NULL OR r.fix_approved = 1)
      ORDER BY r.fix_approved DESC,
               CASE r.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, r.id DESC
      LIMIT ?
    `).all(b.client_id, TRIAGE_LIMIT);
    return { batch_id: b.id, night: b.night, client, candidates, max_fixes: NIGHT_FIXES_PER_CLIENT };
  });
}

/** The worker's sort of each candidate: { batch_id, results: [{ id, triage, reason }] }. */
export function submitSeoTriage(payload) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(payload?.batch_id);
  if (!batch) return { success: false, summary: `Fix batch #${payload?.batch_id} not found` };
  if (!Array.isArray(payload.results)) return { success: false, summary: 'results must be a list' };
  let n = 0;
  const apply = db.transaction(() => {
    for (const r of payload.results) {
      if (!['safe', 'needs_007', 'not_code', 'already_done'].includes(r?.triage)) continue;
      const rec = db.prepare("SELECT id, fix_approved FROM seo_recommendations WHERE id = ? AND client_id = ? AND status = 'open'").get(r.id, batch.client_id);
      if (!rec) continue;
      // 007's "Fix tonight" outranks the sort.
      const triage = rec.fix_approved && r.triage !== 'already_done' ? 'safe' : r.triage;
      // already_done: the code already does it (often a fix pushed earlier that
      // nobody marked). Closed here, with what the worker found as the note.
      const status = triage === 'needs_007' ? 'needs_007' : triage === 'already_done' ? 'completed' : 'open';
      db.prepare(`
        UPDATE seo_recommendations SET fix_triage = ?, fix_reason = ?, status = ?, fix_batch_id = ?,
          fix_approved = CASE WHEN ? = 'completed' THEN 0 ELSE fix_approved END,
          fixed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE fixed_at END
        WHERE id = ?
      `).run(triage, String(r.reason || '').slice(0, 400), status, batch.id, status, status, rec.id);
      n++;
    }
  });
  apply();
  return { success: true, summary: `Sorted ${n} recommendation(s) for batch #${batch.id}` };
}

/**
 * The night's result for one client:
 * { batch_id, status: ready|empty|failed, branch?, base_commit?, error?, fixes: [{ rec_id, ok, commit?, summary?, diff?, error? }] }
 */
export function submitSeoFixBatch(payload) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(payload?.batch_id);
  if (!batch) return { success: false, summary: `Fix batch #${payload?.batch_id} not found` };
  if (batch.status !== 'running') return { success: false, summary: `Fix batch #${batch.id} is ${batch.status}, not running` };
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  const ok = fixes.filter((f) => f.ok && f.commit);
  const status = payload.status === 'failed' ? 'failed' : ok.length ? 'ready' : 'empty';

  const apply = db.transaction(() => {
    for (const f of fixes) {
      const rec = db.prepare('SELECT id FROM seo_recommendations WHERE id = ? AND client_id = ?').get(f.rec_id, batch.client_id);
      if (!rec) continue;
      if (f.ok && f.commit && status === 'ready') {
        db.prepare(`
          UPDATE seo_recommendations SET status = 'ready_to_deploy', fix_commit = ?, fix_summary = ?, fix_diff = ?,
            fix_error = NULL, fix_batch_id = ?, fix_approved = 0, fixed_at = datetime('now') WHERE id = ?
        `).run(String(f.commit).slice(0, 64), String(f.summary || '').slice(0, 2000), String(f.diff || '').slice(0, 20000), batch.id, rec.id);
      } else {
        db.prepare(`
          UPDATE seo_recommendations SET status = 'fix_failed', fix_error = ?, fix_summary = ?, fix_batch_id = ?, fix_approved = 0 WHERE id = ?
        `).run(String(f.error || 'the fix did not pass the checks').slice(0, 1000), String(f.summary || '').slice(0, 2000), batch.id, rec.id);
      }
    }
    const needs = db.prepare("SELECT COUNT(*) AS n FROM seo_recommendations WHERE client_id = ? AND status = 'needs_007'").get(batch.client_id).n;
    const done = db.prepare("SELECT COUNT(*) AS n FROM seo_recommendations WHERE fix_batch_id = ? AND fix_triage = 'already_done'").get(batch.id).n;
    const failed = fixes.length - ok.length;
    const summary = status === 'failed'
      ? `Fixes did not run: ${String(payload.error || 'unknown error').slice(0, 200)}`
      : `${ok.length} fix(es) ready${failed ? ` · ${failed} failed` : ''}${done ? ` · ${done} already done` : ''}${needs ? ` · ${needs} need you` : ''}`;
    db.prepare(`
      UPDATE seo_fix_batches SET status = ?, branch = ?, base_commit = ?, summary = ?, error = ?,
        finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(status, payload.branch || null, payload.base_commit || null, summary, payload.error ? String(payload.error).slice(0, 1000) : null, batch.id);
  });
  apply();
  return { success: true, summary: `Fix batch #${batch.id}: ${status}` };
}

// ------------------------------------------------------- deploy and discard

const recCount = (batchId, status) => db.prepare('SELECT COUNT(*) AS n FROM seo_recommendations WHERE fix_batch_id = ? AND status = ?').get(batchId, status).n;

/** 007 pressed Deploy. */
export function requestDeploy(batchId, user) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
  if (!batch) return { status: 404, error: 'Fix batch not found' };
  // deploy_failed is retryable when it failed before pushing: its fixes are still ready_to_deploy.
  if (!['ready', 'deploy_failed'].includes(batch.status)) return { status: 409, error: `This batch is ${batch.status}; only ready fixes can be deployed` };
  if (recCount(batch.id, 'ready_to_deploy') === 0) return { status: 409, error: 'No fixes in this batch are waiting to deploy' };
  db.prepare(`
    UPDATE seo_fix_batches SET status = 'deploy_queued', deploy_requested_by = ?, error = NULL, log = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(user?.email || 'admin', batch.id);
  return { status: 200, batch: db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batch.id) };
}

/** 007 pressed Discard: the fixes go back to "needs you" so they aren't redone tonight. */
export function discardBatch(batchId, user) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
  if (!batch) return { status: 404, error: 'Fix batch not found' };
  if (!['ready', 'empty', 'failed', 'deploy_failed'].includes(batch.status)) return { status: 409, error: `This batch is ${batch.status} and can't be discarded` };
  const apply = db.transaction(() => {
    db.prepare(`
      UPDATE seo_recommendations SET status = 'needs_007',
        fix_reason = ?, fix_commit = NULL, fix_diff = NULL
      WHERE fix_batch_id = ? AND status IN ('ready_to_deploy', 'fix_failed')
    `).run(`Discarded by ${user?.email || 'admin'} on ${istDate()}. Press "Fix tonight" to try again.`, batch.id);
    db.prepare("UPDATE seo_fix_batches SET status = 'discarded', updated_at = datetime('now') WHERE id = ?").run(batch.id);
  });
  apply();
  return { status: 200 };
}

/** The deploy worker takes every batch 007 pressed Deploy on. */
export function claimSeoDeploys(worker = 'mac') {
  const claim = db.transaction(() => {
    const batches = db.prepare("SELECT * FROM seo_fix_batches WHERE status = 'deploy_queued' ORDER BY id").all();
    for (const b of batches) {
      db.prepare("UPDATE seo_fix_batches SET status = 'deploying', deploy_started_at = datetime('now'), updated_at = datetime('now'), log = ? WHERE id = ?")
        .run(`claimed by ${worker}`, b.id);
    }
    return batches;
  });
  return claim().map((b) => ({
    batch_id: b.id, branch: b.branch, base_commit: b.base_commit,
    client: db.prepare('SELECT id, name, website_url, repo_path FROM crm_clients WHERE id = ?').get(b.client_id),
    commits: db.prepare("SELECT id AS rec_id, fix_commit AS commit_sha, metric FROM seo_recommendations WHERE fix_batch_id = ? AND status = 'ready_to_deploy' ORDER BY fixed_at, id").all(b.id),
  }));
}

/** { batch_id, status: live|rolled_back|deploy_failed, live_commit?, log?, error? } */
export function finishSeoDeploy(payload) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(payload?.batch_id);
  if (!batch) return { success: false, summary: `Fix batch #${payload?.batch_id} not found` };
  if (batch.status !== 'deploying') return { success: false, summary: `Fix batch #${batch.id} is ${batch.status}, not deploying` };
  const status = ['live', 'rolled_back', 'deploy_failed'].includes(payload.status) ? payload.status : 'deploy_failed';
  const error = payload.error ? String(payload.error).slice(0, 1000) : null;
  const apply = db.transaction(() => {
    if (status === 'live') {
      db.prepare("UPDATE seo_recommendations SET status = 'completed' WHERE fix_batch_id = ? AND status = 'ready_to_deploy'").run(batch.id);
    } else if (!(status === 'deploy_failed' && payload.pushed === false)) {
      // Rolled back, or failed after the push: those fixes are done for.
      // Failed before the push: nothing changed anywhere, so they stay ready
      // and the batch can be retried.
      db.prepare(`
        UPDATE seo_recommendations SET status = 'fix_failed', fix_error = ? WHERE fix_batch_id = ? AND status = 'ready_to_deploy'
      `).run(`${status === 'rolled_back' ? 'Deploy rolled back' : 'Deploy failed'}: ${error || 'see the deploy log'}`, batch.id);
    }
    db.prepare(`
      UPDATE seo_fix_batches SET status = ?, live_commit = ?, log = ?, error = ?, deploy_finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(status, payload.live_commit || null, String(payload.log || '').slice(-20000), error, batch.id);
  });
  apply();
  return { success: true, summary: `Fix batch #${batch.id}: ${status}` };
}

// ------------------------------------------------------- one recommendation

/** "Fix tonight": 007 lets the night worker make a change outside the safe list (or retry a failed one). */
export function approveFixTonight(recId, user) {
  const rec = db.prepare('SELECT * FROM seo_recommendations WHERE id = ?').get(recId);
  if (!rec) return { status: 404, error: 'Recommendation not found' };
  if (!['needs_007', 'fix_failed', 'open'].includes(rec.status)) return { status: 409, error: `This recommendation is ${rec.status}` };
  db.prepare(`
    UPDATE seo_recommendations SET status = 'open', fix_approved = 1, fix_triage = 'safe', fix_error = NULL,
      fix_reason = ? WHERE id = ?
  `).run(`Approved for tonight by ${user?.email || 'admin'}`, rec.id);
  return { status: 200 };
}

export function ignoreRecommendation(recId) {
  const res = db.prepare("UPDATE seo_recommendations SET status = 'ignored', fix_approved = 0 WHERE id = ? AND status <> 'completed'").run(recId);
  return res.changes ? { status: 200 } : { status: 404, error: 'Recommendation not found or already completed' };
}

// ----------------------------------------------------------- morning report

const parseTime = (t) => (t ? new Date(`${t.replace(' ', 'T')}${t.endsWith('Z') ? '' : 'Z'}`) : null);

/**
 * The SEO Monitor's "Last night": per SEO-on client, the skills that ran at
 * night with their score against the previous run, and the latest fix batch
 * with its fixes, what needs 007 and what failed.
 */
export function nightReport({ hours = 30 } = {}) {
  const clients = db.prepare(`
    SELECT id, name, repo_path FROM crm_clients WHERE is_active = 1 AND seo_enabled = 1 ORDER BY name
  `).all();
  const recFields = 'id, priority, metric, issue, action_required, page_url, status, fix_triage, fix_reason, fix_summary, fix_diff, fix_commit, fix_error, fix_batch_id, fix_approved';

  const rows = clients.map((c) => {
    const runs = db.prepare(`
      SELECT id, agent_type, status, audit_id, error, created_at, finished_at FROM seo_agent_runs
      WHERE client_id = ? AND requested_by LIKE 'night:%' AND created_at >= datetime('now', ?) ORDER BY id
    `).all(c.id, `-${hours} hours`).map((r) => {
      const audit = r.audit_id ? db.prepare('SELECT * FROM seo_audits WHERE id = ?').get(r.audit_id) : null;
      const prev = audit ? db.prepare(`
        SELECT * FROM seo_audits WHERE client_id = ? AND audit_type = ? AND is_competitor = 0 AND id < ? ORDER BY id DESC LIMIT 1
      `).get(c.id, r.agent_type, audit.id) : null;
      return { ...r, score: audit ? resolveAuditScore(audit) : null, previous_score: prev ? resolveAuditScore(prev) : null };
    });

    const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(c.id) || null;
    const ready = batch ? db.prepare(`SELECT ${recFields} FROM seo_recommendations WHERE fix_batch_id = ? AND status IN ('ready_to_deploy', 'completed') AND fix_commit IS NOT NULL ORDER BY id`).all(batch.id) : [];
    const failed = batch ? db.prepare(`SELECT ${recFields} FROM seo_recommendations WHERE fix_batch_id = ? AND status = 'fix_failed' ORDER BY id`).all(batch.id) : [];
    const needs = db.prepare(`SELECT ${recFields} FROM seo_recommendations WHERE client_id = ? AND status = 'needs_007' ORDER BY CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id DESC`).all(c.id);
    const tonight = db.prepare("SELECT COUNT(*) AS n FROM seo_recommendations WHERE client_id = ? AND status = 'open' AND fix_approved = 1").get(c.id).n;
    const alreadyDone = batch ? db.prepare(`SELECT ${recFields} FROM seo_recommendations WHERE fix_batch_id = ? AND fix_triage = 'already_done' ORDER BY id`).all(batch.id) : [];

    let setup = null;
    if (!c.repo_path) setup = 'Audits only: no site repo is set for this client';
    else if (batch?.status === 'failed' && /manifest/i.test(batch.error || '')) setup = `Audits only: ${batch.error}`;

    const retryable = batch?.status === 'deploy_failed' && ready.some((f) => f.status === 'ready_to_deploy');
    return {
      client_id: c.id, client_name: c.name, setup, runs, batch, retryable,
      fixes: ready, failed, needs_007: needs, already_done: alreadyDone, approved_for_tonight: tonight,
    };
  });

  const waiting = (r) => r.batch?.status === 'ready' || r.retryable;
  return {
    mode: getMode('seo'),
    totals: {
      fixes_ready: rows.reduce((n, r) => n + (waiting(r) ? r.fixes.filter((f) => f.status === 'ready_to_deploy').length : 0), 0),
      needs_007: rows.reduce((n, r) => n + r.needs_007.length, 0),
      failed: rows.reduce((n, r) => n + (r.batch && parseTime(r.batch.created_at) > new Date(Date.now() - hours * 3600000) ? r.failed.length : 0), 0),
      skills_run: rows.reduce((n, r) => n + r.runs.length, 0),
      already_done: rows.reduce((n, r) => n + (r.batch && parseTime(r.batch.created_at) > new Date(Date.now() - hours * 3600000) ? r.already_done.length : 0), 0),
    },
    clients: rows,
  };
}

/** Short version for the bots and the morning brief. */
export function nightSummaryText() {
  const r = nightReport();
  const lines = [`SEO fleet: ${r.mode}. Fixes ready ${r.totals.fixes_ready} · needs 007 ${r.totals.needs_007} · failed ${r.totals.failed} · skills run ${r.totals.skills_run}`];
  for (const c of r.clients) {
    const runs = c.runs.map((x) => `${x.agent_type} ${x.status}${x.score != null ? ` ${x.previous_score ?? '–'}→${x.score}` : ''}`).join(', ') || 'no night runs';
    lines.push(`- ${c.client_name}: ${runs}; fixes: ${c.batch ? `${c.batch.status} (${c.batch.summary || ''})` : 'none yet'}${c.setup ? ` [${c.setup}]` : ''}`);
  }
  return lines.join('\n');
}
