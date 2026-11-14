/**
 * Night SEO (master plan Phase 6). The bots start each step; this file is the
 * server's half of it.
 *
 *   01:15 IST  Tanner: queueNightAudits() — every SEO-on client's skills that are past
 *              their card's cadence (the SEO Monitor's "Cadence"), all of them
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

/** Where a not_code finding's work happens; kept in step with manualTasks.js WORKER_AREAS. */
const WORKER_AREAS = ['offsite', 'gbp', 'google', 'content', 'ad_account', 'business', 'other'];
import { startAgentRun } from './agentRunner.js';
import { getActiveRunsForClient } from './agentRuns.js';
import { unavailableReason, resolveAuditScore } from '../routes/seo.js';

export const NIGHT_FIXES_PER_CLIENT = 8;
// How many open findings the night sort looks at per client. 40 left a day of
// running many cards half sorted (41 waiting after 2026-11-10); sorting is one
// read-only Claude call (40 took 46 s), so this only grows that step. The fixes
// themselves stay at NIGHT_FIXES_PER_CLIENT.
export const TRIAGE_LIMIT = 100;

// The card's cadence decides what runs: every skill past its stale_after_days
// is queued (9999 = on demand, never queued). The only things that hold a due
// card back are the ones that hold back its Run button — no data source
// (unavailableReason, e.g. DataForSEO skills until the login is in .env), an
// unhealthy skill, a run already in flight — plus the client's budget cap.
// There used to be a fixed skip list here (full, flow, backlinks, ...) and a
// 3-per-night cap; both left cards reading STALE with nothing ever running them.
const OPEN_BATCH = ['queued', 'running', 'ready', 'deploy_queued', 'deploying'];

// Findings from both fleets share one fix batch per client: they land in the
// same repo and go live with the same Deploy. An SEO finding keeps its numeric
// id; an ads finding travels as 'ads-<id>' (to the worker, in the report, in
// the routes), so the two tables' ids never collide.
const REC_TABLES = { seo: 'seo_recommendations', ads: 'ads_recommendations' };
export const recKey = (fleet, id) => (fleet === 'ads' ? `ads-${id}` : id);
export function parseRecKey(key) {
  const m = /^ads-(\d+)$/.exec(String(key));
  if (m) return { fleet: 'ads', table: REC_TABLES.ads, id: Number(m[1]) };
  const n = Number(String(key).replace(/^seo-/, ''));
  return Number.isInteger(n) && n > 0 ? { fleet: 'seo', table: REC_TABLES.seo, id: n } : null;
}
const TABLES = Object.values(REC_TABLES);
/** Runs a statement on both tables and adds up the changes or counts. */
const sumBoth = (sql, ...params) => TABLES.reduce((n, t) => n + (db.prepare(sql.replaceAll('{recs}', t)).get(...params)?.n || 0), 0);
const runBoth = (sql, ...params) => TABLES.forEach((t) => db.prepare(sql.replaceAll('{recs}', t)).run(...params));
// An ads finding goes to the worker when it is website code, or not sorted yet
// (from before cards set `kind`); the worker calls the others not_code.
const ADS_CANDIDATE = "(r.kind = 'site_code' OR r.kind IS NULL)";
// What a night batch looks at: findings never sorted, ones 007 pressed "Fix
// tonight" on, and ones sorted safe on an earlier night that didn't make that
// night's 8 fixes. Without the last, a safe finding past the cap was never
// picked up again (11 waiting, some since 2026-11-03). They are sorted again,
// which also catches any that an earlier fix has since done.
const NIGHT_CANDIDATE = "(r.fix_triage IS NULL OR r.fix_triage = 'safe' OR r.fix_approved = 1)";
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** Which fleets' findings the night worker takes for a client: enabled for the client and on Auto. */
function fixFleets(client) {
  const f = [];
  if (client.seo_enabled && getMode('seo') === 'auto') f.push('seo');
  if (client.ads_enabled && getMode('ads') === 'auto') f.push('ads');
  return f;
}

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
    .filter((r) => !active.has(r.audit_type))
    .map((r) => {
      const ageDays = r.last_run ? (now - new Date(`${r.last_run.replace(' ', 'T')}Z`).getTime()) / 86400000 : Infinity;
      return { ...r, overdue_days: ageDays - r.stale_after_days };
    })
    .filter((r) => r.overdue_days >= 0)
    .filter((r) => !unavailableReason(r.audit_type, clientId))
    .sort((a, b) => b.overdue_days - a.overdue_days);
}

/** Tanner, 01:15 IST: queue every SEO-on client's skills that are past their cadence. */
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
    const due = dueSkills(client.id);
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

/**
 * Boothroyd, 03:30 IST: one fix batch per client that has a site repo on the
 * Mac, taking its SEO findings, its ads website-code findings, or both —
 * whichever fleets are on for the client and on Auto.
 */
export function queueSeoFixes({ by = 'agent', clientId = null } = {}) {
  if (getMode('seo') !== 'auto' && getMode('ads') !== 'auto') return { queued: [], skipped: [{ reason: 'SEO and Ads fleets are on Manual' }] };
  const clients = db.prepare(`
    SELECT id, name, repo_path, seo_enabled, ads_enabled FROM crm_clients
    WHERE is_active = 1 AND (seo_enabled = 1 OR ads_enabled = 1) ${clientId ? 'AND id = ?' : ''} ORDER BY id
  `).all(...(clientId ? [clientId] : []));

  const queued = [];
  const skipped = [];
  const night = istDate();
  for (const client of clients) {
    if (!client.repo_path) { skipped.push({ client_name: client.name, reason: 'no site repo set (audits only)' }); continue; }
    const fleets = fixFleets(client);
    if (!fleets.length) { skipped.push({ client_name: client.name, reason: 'its fleets are on Manual' }); continue; }
    // Open, or a failed deploy whose fixes are still waiting for Retry deploy.
    const open = db.prepare(`
      SELECT b.id, b.status FROM seo_fix_batches b WHERE b.client_id = ? AND (
        b.status IN (${OPEN_BATCH.map(() => '?').join(',')})
        OR (b.status = 'deploy_failed' AND (
          EXISTS (SELECT 1 FROM seo_recommendations r WHERE r.fix_batch_id = b.id AND r.status = 'ready_to_deploy')
          OR EXISTS (SELECT 1 FROM ads_recommendations r WHERE r.fix_batch_id = b.id AND r.status = 'ready_to_deploy')))
      ) ORDER BY b.id DESC LIMIT 1
    `).get(client.id, ...OPEN_BATCH);
    if (open) {
      skipped.push({ client_name: client.name, reason: ['ready', 'deploy_failed'].includes(open.status) ? 'last night\'s fixes are waiting for Deploy or Discard' : `a batch is already ${open.status}` });
      continue;
    }
    const isCandidate = `r.client_id = ? AND r.status = 'open' AND ${NIGHT_CANDIDATE}`;
    const candidates = (fleets.includes('seo') ? db.prepare(`SELECT COUNT(*) AS n FROM seo_recommendations r WHERE ${isCandidate}`).get(client.id).n : 0)
      + (fleets.includes('ads') ? db.prepare(`SELECT COUNT(*) AS n FROM ads_recommendations r WHERE ${isCandidate} AND ${ADS_CANDIDATE}`).get(client.id).n : 0);
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
        AND NOT EXISTS (SELECT 1 FROM ads_agent_runs r WHERE r.client_id = b.client_id AND r.status IN ('queued', 'running'))
      ORDER BY b.id
    `).all();
    for (const b of batches) {
      db.prepare("UPDATE seo_fix_batches SET status = 'running', started_at = datetime('now'), updated_at = datetime('now'), log = ? WHERE id = ?")
        .run(`claimed by ${worker}`, b.id);
    }
    return batches;
  });
  return claim().map((b) => {
    const { seo_enabled: seoOn, ads_enabled: adsOn, ...client } = db.prepare(
      'SELECT id, name, website_url, repo_path, blog_compliance_profile, seo_enabled, ads_enabled FROM crm_clients WHERE id = ?',
    ).get(b.client_id);
    const open = `r.client_id = ? AND r.status = 'open' AND ${NIGHT_CANDIDATE}`;
    const seo = seoOn ? db.prepare(`
      SELECT r.id, r.priority, r.metric, r.issue, r.action_required, r.observation, r.page_url, r.fix_approved, r.fix_triage, r.fix_note,
             a.audit_type
      FROM seo_recommendations r JOIN seo_audits a ON a.id = r.audit_id WHERE ${open} ORDER BY r.id DESC
    `).all(b.client_id).map((r) => ({ ...r, fleet: 'seo' })) : [];
    // Ads findings say "ads <card>" as their audit, and carry the campaign they
    // are about; the worker sorts the unsorted ones like any other.
    const ads = adsOn ? db.prepare(`
      SELECT r.id, r.priority, r.metric, r.issue, r.action_required, r.observation, r.page_url, r.fix_approved, r.fix_triage, r.fix_note,
             'ads ' || a.agent_type AS audit_type, r.campaign_name, r.kind
      FROM ads_recommendations r JOIN ads_audits a ON a.id = r.audit_id WHERE ${open} AND ${ADS_CANDIDATE} ORDER BY r.id DESC
    `).all(b.client_id).map((r) => ({ ...r, id: recKey('ads', r.id), fleet: 'ads' })) : [];
    const candidates = [...seo, ...ads]
      .sort((x, y) => (y.fix_approved - x.fix_approved) || (PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority]))
      .slice(0, TRIAGE_LIMIT);
    // Manual-task groups still open for this client, so a new finding asking for
    // the same thing joins the existing task instead of starting another.
    const groups = [...new Set(TABLES.flatMap((t) => db.prepare(
      `SELECT manual_group FROM ${t} WHERE client_id = ? AND status = 'open' AND manual_group IS NOT NULL`,
    ).all(client.id).map((r) => r.manual_group)))];
    return { batch_id: b.id, night: b.night, client, candidates, groups, max_fixes: NIGHT_FIXES_PER_CLIENT };
  });
}

/** What the night worker may answer for each finding (see seo_fix_worker.mjs triagePrompt). */
const TRIAGES = ['safe', 'needs_007', 'code', 'not_code', 'automatic', 'content', 'already_done'];
const normKeyword = (k) => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
// The worker's name for "the same piece of work" across cards, e.g. 'ga4-internal-filter'.
const groupSlug = (g) => (String(g || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || null);

function setTriage(table, id, { triage, reason, status, batch, area = null, group = null, note = null, by = null }) {
  db.prepare(`
    UPDATE ${table} SET fix_triage = ?, fix_reason = ?, status = ?, fix_batch_id = ?,
      fix_approved = CASE WHEN ? IN ('completed', 'ignored') THEN 0 ELSE fix_approved END,
      fixed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE fixed_at END,
      manual_area = COALESCE(?, manual_area), manual_group = COALESCE(?, manual_group),
      manual_note = COALESCE(?, manual_note), manual_by = COALESCE(?, manual_by),
      manual_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE manual_at END
    WHERE id = ?
  `).run(triage, reason, status, batch, status, status, area, group, note, by, by, id);
}

/** The worker's sort of each candidate: { batch_id, results: [{ id, triage, reason }] }. */
export function submitSeoTriage(payload) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(payload?.batch_id);
  if (!batch) return { success: false, summary: `Fix batch #${payload?.batch_id} not found` };
  if (!Array.isArray(payload.results)) return { success: false, summary: 'results must be a list' };
  let n = 0;
  const apply = db.transaction(() => {
    for (const r of payload.results) {
      if (!TRIAGES.includes(r?.triage)) continue;
      const k = parseRecKey(r.id);
      if (!k) continue;
      const rec = db.prepare(`SELECT id, client_id, fix_approved FROM ${k.table} WHERE id = ? AND client_id = ? AND status = 'open'`).get(k.id, batch.client_id);
      if (!rec) continue;
      const reason = String(r.reason || '').slice(0, 400);
      // 007's "Fix tonight" outranks the sort.
      if (rec.fix_approved && r.triage !== 'already_done') {
        setTriage(k.table, rec.id, { triage: 'safe', reason, status: 'open', batch: batch.id });
        n++;
        continue;
      }
      switch (r.triage) {
        // A site or app change outside the safe list: 007 decides (Fix tonight).
        case 'code':
        case 'needs_007':
          setTriage(k.table, rec.id, { triage: 'needs_007', reason, status: 'needs_007', batch: batch.id });
          break;
        // already_done: the code already does it (often a fix pushed earlier that
        // nobody marked). Closed here, with what the worker found as the note.
        case 'already_done':
          setTriage(k.table, rec.id, { triage: 'already_done', reason, status: 'completed', batch: batch.id });
          break;
        // A re-run, re-check or monitoring a card's cadence or an API already does.
        case 'automatic':
          setTriage(k.table, rec.id, { triage: 'not_code', reason, status: 'ignored', batch: batch.id, area: 'automatic', note: `Covered automatically: ${reason}`, by: 'night worker' });
          break;
        // New content to write: the keyword goes to the Keywords panel, where blog
        // topics come from (007 approves there). Without a keyword it stays manual.
        case 'content': {
          const keyword = normKeyword(r.keyword);
          if (keyword) {
            db.prepare("INSERT OR IGNORE INTO seo_keywords (client_id, keyword, source) VALUES (?, ?, 'audit')").run(rec.client_id, keyword);
            setTriage(k.table, rec.id, { triage: 'not_code', reason, status: 'completed', batch: batch.id, area: 'content', note: `Sent to the Keywords panel as "${keyword}"`, by: 'night worker' });
          } else {
            setTriage(k.table, rec.id, { triage: 'not_code', reason, status: 'open', batch: batch.id, area: 'content', group: groupSlug(r.group) });
          }
          break;
        }
        case 'safe':
          setTriage(k.table, rec.id, { triage: 'safe', reason, status: 'open', batch: batch.id });
          break;
        // Work a person does in an outside account or off the site: Manual tasks.
        default:
          setTriage(k.table, rec.id, {
            triage: 'not_code', reason, status: 'open', batch: batch.id,
            area: WORKER_AREAS.includes(r.area) ? r.area : null, group: groupSlug(r.group),
          });
      }
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
      const k = parseRecKey(f.rec_id);
      const rec = k && db.prepare(`SELECT id, fix_approved FROM ${k.table} WHERE id = ? AND client_id = ?`).get(k.id, batch.client_id);
      if (!rec) continue;
      // The fix changed nothing. Not a failure: either the code already does it
      // (closed as already done), or it can't be done inside the safe list
      // (007 decides, as for any other code change). Something 007 already
      // approved that still couldn't be done stays failed, with the reason.
      const reason = String(f.summary || f.error || '').slice(0, 400);
      if (f.no_change === 'already_done') {
        setTriage(k.table, rec.id, { triage: 'already_done', reason, status: 'completed', batch: batch.id });
        continue;
      }
      if (f.no_change === 'blocked' && !rec.fix_approved) {
        setTriage(k.table, rec.id, { triage: 'needs_007', reason, status: 'needs_007', batch: batch.id });
        continue;
      }
      if (f.ok && f.commit && status === 'ready') {
        db.prepare(`
          UPDATE ${k.table} SET status = 'ready_to_deploy', fix_commit = ?, fix_summary = ?, fix_diff = ?,
            fix_error = NULL, fix_batch_id = ?, fix_approved = 0, fixed_at = datetime('now') WHERE id = ?
        `).run(String(f.commit).slice(0, 64), String(f.summary || '').slice(0, 2000), String(f.diff || '').slice(0, 20000), batch.id, rec.id);
      } else {
        db.prepare(`
          UPDATE ${k.table} SET status = 'fix_failed', fix_error = ?, fix_summary = ?, fix_batch_id = ?, fix_approved = 0 WHERE id = ?
        `).run(String(f.error || 'the fix did not pass the checks').slice(0, 1000), String(f.summary || '').slice(0, 2000), batch.id, rec.id);
      }
    }
    const needs = sumBoth("SELECT COUNT(*) AS n FROM {recs} WHERE client_id = ? AND status = 'needs_007'", batch.client_id);
    const done = sumBoth("SELECT COUNT(*) AS n FROM {recs} WHERE fix_batch_id = ? AND fix_triage = 'already_done'", batch.id);
    const failed = sumBoth("SELECT COUNT(*) AS n FROM {recs} WHERE fix_batch_id = ? AND status = 'fix_failed'", batch.id);
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

const recCount = (batchId, status) => sumBoth('SELECT COUNT(*) AS n FROM {recs} WHERE fix_batch_id = ? AND status = ?', batchId, status);

/** 007 pressed Deploy. */
export function requestDeploy(batchId, user) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
  if (!batch) return { status: 404, error: 'Fix batch not found' };
  // deploy_failed is retryable when it failed before pushing: its fixes are still ready_to_deploy.
  if (!['ready', 'deploy_failed'].includes(batch.status)) return { status: 409, error: `This batch is ${batch.status}; only ready fixes can be deployed` };
  if (recCount(batch.id, 'ready_to_deploy') === 0) return { status: 409, error: 'No fixes in this batch are waiting to deploy' };
  db.prepare(`
    UPDATE seo_fix_batches SET status = 'deploy_queued', deploy_requested_by = ?,
      previous_error = COALESCE(error, previous_error), error = NULL, log = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(user?.email || 'admin', batch.id);
  return { status: 200, batch: db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batch.id) };
}

/** 007 pressed Discard: the fixes go back to "needs you" so they aren't redone tonight. */
export function discardBatch(batchId, user) {
  const batch = db.prepare('SELECT * FROM seo_fix_batches WHERE id = ?').get(batchId);
  if (!batch) return { status: 404, error: 'Fix batch not found' };
  if (!['ready', 'empty', 'failed', 'deploy_failed'].includes(batch.status)) return { status: 409, error: `This batch is ${batch.status} and can't be discarded` };
  const apply = db.transaction(() => {
    runBoth(`
      UPDATE {recs} SET status = 'needs_007',
        fix_reason = ?, fix_commit = NULL, fix_diff = NULL
      WHERE fix_batch_id = ? AND status IN ('ready_to_deploy', 'fix_failed')
    `, `Discarded by ${user?.email || 'admin'} on ${istDate()}. Press "Fix tonight" to try again.`, batch.id);
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
    commits: Object.entries(REC_TABLES)
      .flatMap(([fleet, table]) => db.prepare(`SELECT id, fix_commit AS commit_sha, metric, fixed_at FROM ${table} WHERE fix_batch_id = ? AND status = 'ready_to_deploy'`).all(b.id)
        .map(({ id, fixed_at: at, ...c }) => ({ rec_id: recKey(fleet, id), ...c, at })))
      .sort((x, y) => String(x.at).localeCompare(String(y.at)))
      .map(({ at, ...c }) => c),
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
      runBoth("UPDATE {recs} SET status = 'completed' WHERE fix_batch_id = ? AND status = 'ready_to_deploy'", batch.id);
    } else if (!(status === 'deploy_failed' && payload.pushed === false)) {
      // Rolled back, or failed after the push: those fixes are done for.
      // Failed before the push: nothing changed anywhere, so they stay ready
      // and the batch can be retried.
      runBoth(`
        UPDATE {recs} SET status = 'fix_failed', fix_error = ? WHERE fix_batch_id = ? AND status = 'ready_to_deploy'
      `, `${status === 'rolled_back' ? 'Deploy rolled back' : 'Deploy failed'}: ${error || 'see the deploy log'}`, batch.id);
    }
    db.prepare(`
      UPDATE seo_fix_batches SET status = ?, live_commit = ?, log = ?, error = ?, deploy_finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(status, payload.live_commit || null, String(payload.log || '').slice(-20000), error, batch.id);
  });
  apply();
  return { success: true, summary: `Fix batch #${batch.id}: ${status}` };
}

// ------------------------------------------------------- one recommendation

export const FIX_NOTE_MAX = 1000;

/**
 * "Fix tonight": 007 lets the night worker make a change outside the safe list
 * (or retry a failed one). An optional note says how: it goes into the fix
 * prompt and outranks the recommendation's own wording. No note clears an
 * earlier one, so a retry without a note isn't steered by an old one.
 */
export function approveFixTonight(recId, user, { note = null } = {}) {
  const k = parseRecKey(recId);
  const rec = k && db.prepare(`SELECT * FROM ${k.table} WHERE id = ?`).get(k.id);
  if (!rec) return { status: 404, error: 'Recommendation not found' };
  if (!['needs_007', 'fix_failed', 'open'].includes(rec.status)) return { status: 409, error: `This recommendation is ${rec.status}` };
  if (note != null && typeof note !== 'string') return { status: 400, error: 'note must be text' };
  const text = note?.trim() || null;
  if (text && text.length > FIX_NOTE_MAX) return { status: 400, error: `The note is too long (${text.length} characters, at most ${FIX_NOTE_MAX})` };
  db.prepare(`
    UPDATE ${k.table} SET status = 'open', fix_approved = 1, fix_triage = 'safe', fix_error = NULL,
      fix_reason = ?, fix_note = ? WHERE id = ?
  `).run(`Approved for tonight by ${user?.email || 'admin'}`, text, rec.id);
  return { status: 200, note: text };
}

export function ignoreRecommendation(recId) {
  const k = parseRecKey(recId);
  const res = k ? db.prepare(`UPDATE ${k.table} SET status = 'ignored', fix_approved = 0 WHERE id = ? AND status <> 'completed'`).run(k.id) : { changes: 0 };
  return res.changes ? { status: 200 } : { status: 404, error: 'Recommendation not found or already completed' };
}

// ----------------------------------------------------------- morning report

const parseTime = (t) => (t ? new Date(`${t.replace(' ', 'T')}${t.endsWith('Z') ? '' : 'Z'}`) : null);

/**
 * The Site changes report, shown in the SEO and Ads Monitors: per client with
 * SEO or ads on, the SEO skills that ran at night with their score against the
 * previous run, and the latest fix batch with its fixes, what needs 007 and
 * what failed — SEO and ads findings together, each tagged with its `fleet`.
 */
export function nightReport({ hours = 30 } = {}) {
  const clients = db.prepare(`
    SELECT id, name, repo_path, seo_enabled, ads_enabled FROM crm_clients
    WHERE is_active = 1 AND (seo_enabled = 1 OR ads_enabled = 1) ORDER BY name
  `).all();
  const recFields = 'id, priority, metric, issue, action_required, page_url, status, fix_triage, fix_reason, fix_summary, fix_diff, fix_commit, fix_error, fix_batch_id, fix_approved, fix_note';
  // One query on both tables; ads ids become 'ads-<id>'.
  const recs = (where, ...params) => Object.entries(REC_TABLES)
    .flatMap(([fleet, table]) => db.prepare(`SELECT ${recFields} FROM ${table} WHERE ${where}`).all(...params)
      .map((r) => ({ ...r, id: recKey(fleet, r.id), fleet })));
  const byPriority = (list) => list.sort((x, y) => (PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority]));

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
    const ready = batch ? recs("fix_batch_id = ? AND status IN ('ready_to_deploy', 'completed') AND fix_commit IS NOT NULL", batch.id) : [];
    const failed = batch ? recs("fix_batch_id = ? AND status = 'fix_failed'", batch.id) : [];
    const needs = byPriority(recs("client_id = ? AND status = 'needs_007'", c.id));
    const tonight = byPriority(recs("client_id = ? AND status = 'open' AND fix_approved = 1", c.id));
    const alreadyDone = batch ? recs("fix_batch_id = ? AND fix_triage = 'already_done'", batch.id) : [];

    let setup = null;
    if (!c.repo_path) setup = 'Audits only: no site repo is set for this client, so website fixes can\'t be made';
    else if (batch?.status === 'failed' && /manifest/i.test(batch.error || '')) setup = `Audits only: ${batch.error}`;

    const retryable = batch?.status === 'deploy_failed' && ready.some((f) => f.status === 'ready_to_deploy');
    return {
      client_id: c.id, client_name: c.name, seo_enabled: !!c.seo_enabled, ads_enabled: !!c.ads_enabled, setup, runs, batch, retryable,
      fixes: ready, failed, needs_007: needs, already_done: alreadyDone, approved_for_tonight: tonight.length, tonight,
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
