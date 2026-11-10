/**
 * Backlink outreach (vault: Companies/Hyphening/SOPs/Backlink outreach.md).
 *
 *   Boothroyd's weekly routine → queueOutreachRuns() → the Mac's outreach_worker
 *   claims each run with the client's competitors and open follow-ups, gathers
 *   candidates from DataForSEO, has Claude check each page and draft the email,
 *   and submits prospects (submitOutreachResults) or the reason it couldn't
 *   (failOutreachRun). 007 approves in the SEO Monitor's Outreach section; the
 *   assigned staff member copies the email or opens it in Gmail, sends it, and
 *   marks it sent. Nothing is emailed by the portal.
 *
 * Every run records whether DataForSEO worked, so a missing login or an empty
 * balance shows up in the SEO Monitor and the morning brief, not as silence.
 */

import db from '../../database.js';
import { addBlogTopics } from './blogRuns.js';
import { outreachGapCandidates } from './backlinkGap.js';

export const PROSPECTS_PER_RUN = 15;
export const FOLLOW_UP_AFTER_DAYS = 5;
const MAX_FOLLOW_UPS = 1;
const FAILURE_KINDS = ['dataforseo_missing', 'dataforseo_auth', 'dataforseo_funds', 'other'];

const FAILURE_TEXT = {
  dataforseo_missing: 'DataForSEO is not set up: add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the Mac\'s hyphening-media .env',
  dataforseo_auth: 'DataForSEO rejected the login: check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on the Mac',
  dataforseo_funds: 'DataForSEO is out of balance or the payment failed: top up at app.dataforseo.com',
};

// ------------------------------------------------------------- settings

export function getSetting(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value ?? null;
}

export function setSetting(key, value, by) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(key, value, by || null);
}

/** Internal staff CC'd on outreach emails: a cleaned, comma-separated list. */
export function outreachCc() {
  return (getSetting('outreach_cc') || '').split(',').map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+$/.test(s));
}

// ------------------------------------------------------------ runs (Mac)

/** Boothroyd's weekly start: one run per SEO-on client with nothing already queued or running. */
export function queueOutreachRuns({ by = 'agent', clientId = null } = {}) {
  const clients = db.prepare(`
    SELECT id, name, website_url FROM crm_clients
    WHERE is_active = 1 AND seo_enabled = 1 ${clientId ? 'AND id = ?' : ''} ORDER BY id
  `).all(...(clientId ? [clientId] : []));
  const queued = [];
  const skipped = [];
  for (const c of clients) {
    if (!c.website_url) { skipped.push({ client_name: c.name, reason: 'no website URL' }); continue; }
    const busy = db.prepare("SELECT 1 FROM outreach_runs WHERE client_id = ? AND status IN ('queued', 'running')").get(c.id);
    if (busy) { skipped.push({ client_name: c.name, reason: 'a run is already queued' }); continue; }
    const run = db.prepare('INSERT INTO outreach_runs (client_id, requested_by) VALUES (?, ?)').run(c.id, by);
    queued.push({ run_id: run.lastInsertRowid, client_id: c.id, client_name: c.name });
  }
  return { queued, skipped };
}

/** The worker takes every queued run with what it needs to work on. */
export function claimOutreachRuns(worker = 'mac') {
  const claim = db.transaction(() => {
    const runs = db.prepare("SELECT * FROM outreach_runs WHERE status = 'queued' ORDER BY id").all();
    for (const r of runs) {
      db.prepare("UPDATE outreach_runs SET status = 'running', started_at = datetime('now'), error = ? WHERE id = ?").run(`claimed by ${worker}`, r.id);
    }
    return runs;
  });
  return claim().map((r) => {
    const client = db.prepare('SELECT id, name, website_url, blog_compliance_profile FROM crm_clients WHERE id = ?').get(r.client_id);
    // Already known pages are skipped, so a weekly run only brings new ones.
    const knownPages = db.prepare('SELECT page_url FROM outreach_prospects WHERE client_id = ?').all(r.client_id).map((p) => p.page_url);
    return {
      run_id: r.id,
      client,
      competitors: db.prepare("SELECT domain, label FROM client_competitors WHERE client_id = ? AND status = 'approved' ORDER BY domain").all(r.client_id),
      known_pages: knownPages,
      // Blog, resource and community domains from the latest backlink gap
      // report against each approved competitor (src/services/backlinkGap.js).
      gap_candidates: outreachGapCandidates(r.client_id, knownPages),
      planned_topics: db.prepare("SELECT id, topic FROM blog_topics WHERE client_id = ? AND status IN ('planned', 'queued')").all(r.client_id),
      follow_ups: db.prepare(`
        SELECT id, page_url, site_domain, contact_name, email_subject, email_body FROM outreach_prospects
        WHERE client_id = ? AND status = 'sent' AND follow_up_count < ? AND sent_at <= datetime('now', ?)
      `).all(r.client_id, MAX_FOLLOW_UPS, `-${FOLLOW_UP_AFTER_DAYS} days`),
      to_verify: db.prepare(`
        SELECT id, live_url FROM outreach_prospects
        WHERE client_id = ? AND status = 'won' AND live_url IS NOT NULL
          AND (link_verified_at IS NULL OR link_verified_at <= datetime('now', '-7 days'))
      `).all(r.client_id),
      max_prospects: PROSPECTS_PER_RUN,
    };
  });
}

const str = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));

/**
 * The worker's results for one run:
 * { run_id, prospects: [...], follow_ups: [{ id, subject, body }], verified: [{ id, live }],
 *   own_broken: [{ dead_url, linking_pages: [...], redirect_to }], stats: {...}, cost_usd }
 */
export function submitOutreachResults(payload) {
  const run = db.prepare('SELECT * FROM outreach_runs WHERE id = ?').get(payload?.run_id);
  if (!run) return { success: false, summary: `Outreach run #${payload?.run_id} not found` };
  if (run.status !== 'running') return { success: false, summary: `Outreach run #${run.id} is ${run.status}, not running` };
  const cc = outreachCc().join(', ') || null;
  let added = 0;

  const apply = db.transaction(() => {
    for (const p of Array.isArray(payload.prospects) ? payload.prospects : []) {
      if (!['broken_link', 'competitor_gap', 'mention'].includes(p?.kind) || !/^https?:\/\//.test(p?.page_url || '')) continue;
      if (!p.email_subject || !p.email_body) continue;
      let topicId = null;
      if (!p.our_url && p.proposed_topic) {
        const r = addBlogTopics(run.client_id, [{ topic: String(p.proposed_topic).slice(0, 300), notes: `From backlink outreach: ${p.page_url}` }], 'outreach');
        topicId = r.ids?.[0] ?? null;
      }
      const res = db.prepare(`
        INSERT OR IGNORE INTO outreach_prospects (client_id, kind, site_domain, page_url, page_title, dead_url, competitor_domain,
          domain_rank, our_url, blog_topic_id, reason, contact_name, contact_email, contact_url, email_subject, email_body, email_cc, run_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(run.client_id, p.kind, str(p.site_domain, 200) || new URL(p.page_url).hostname, str(p.page_url, 1000), str(p.page_title, 300),
        str(p.dead_url, 1000), str(p.competitor_domain, 200), Number.isFinite(p.domain_rank) ? Math.round(p.domain_rank) : null,
        str(p.our_url, 1000), topicId, str(p.reason, 500), str(p.contact_name, 200), str(p.contact_email, 200), str(p.contact_url, 1000),
        str(p.email_subject, 300), str(p.email_body, 6000), cc, run.id);
      added += res.changes;
    }
    for (const f of Array.isArray(payload.follow_ups) ? payload.follow_ups : []) {
      if (!f?.subject || !f?.body) continue;
      db.prepare(`
        UPDATE outreach_prospects SET status = 'follow_up_to_approve', email_subject = ?, email_body = ?, updated_at = datetime('now')
        WHERE id = ? AND client_id = ? AND status = 'sent'
      `).run(str(f.subject, 300), str(f.body, 6000), f.id, run.client_id);
    }
    for (const v of Array.isArray(payload.verified) ? payload.verified : []) {
      if (v?.live) db.prepare("UPDATE outreach_prospects SET link_verified_at = datetime('now') WHERE id = ? AND client_id = ?").run(v.id, run.client_id);
      else db.prepare("UPDATE outreach_prospects SET reply_note = trim(coalesce(reply_note, '') || ' · Link not found on ' || date('now')) WHERE id = ? AND client_id = ?").run(v.id, run.client_id);
    }
    addOwnBrokenRecommendations(run, payload.own_broken);
    db.prepare(`
      UPDATE outreach_runs SET status = 'done', failure_kind = NULL, error = NULL, stats = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify({ ...(payload.stats || {}), prospects_added: added }), Number(payload.cost_usd) || 0, run.id);
  });
  apply();
  return { success: true, summary: `Outreach run #${run.id}: ${added} new prospect(s)` };
}

/**
 * Other sites linking to the client's own dead pages: an internal fix (a 301
 * redirect), never outreach and never shown to the client. They join the
 * night SEO queue as recommendations of a 'backlinks' audit.
 */
function addOwnBrokenRecommendations(run, ownBroken) {
  const items = (Array.isArray(ownBroken) ? ownBroken : []).filter((o) => /^https?:\/\//.test(o?.dead_url || ''));
  if (!items.length) return;
  const client = db.prepare('SELECT website_url FROM crm_clients WHERE id = ?').get(run.client_id);
  const audit = db.prepare(`
    INSERT INTO seo_audits (client_id, audit_type, url, report_json) VALUES (?, 'backlinks', ?, ?)
  `).run(run.client_id, client.website_url, JSON.stringify({ source: 'outreach_run', run_id: run.id, own_broken: items }));
  for (const o of items) {
    const exists = db.prepare(`
      SELECT 1 FROM seo_recommendations WHERE client_id = ? AND metric = 'Broken backlink target' AND page_url = ? AND status NOT IN ('completed', 'ignored')
    `).get(run.client_id, o.dead_url);
    if (exists) continue;
    const linking = (o.linking_pages || []).slice(0, 5);
    db.prepare(`
      INSERT INTO seo_recommendations (audit_id, client_id, priority, metric, issue, action_required, page_url)
      VALUES (?, ?, 'Medium', 'Broken backlink target', ?, ?, ?)
    `).run(audit.lastInsertRowid, run.client_id,
      `${linking.length || 'Some'} other site(s) link to ${o.dead_url}, which no longer loads${linking.length ? ` (e.g. ${linking.join(', ')})` : ''}.`,
      o.redirect_to ? `Add a 301 redirect from ${new URL(o.dead_url).pathname} to ${o.redirect_to}.` : `Add a 301 redirect from ${new URL(o.dead_url).pathname} to the closest live page.`,
      o.dead_url);
  }
}

/** The worker couldn't finish: { run_id, failure_kind, error }. */
export function failOutreachRun(payload) {
  const run = db.prepare('SELECT * FROM outreach_runs WHERE id = ?').get(payload?.run_id);
  if (!run) return { success: false, summary: `Outreach run #${payload?.run_id} not found` };
  const kind = FAILURE_KINDS.includes(payload.failure_kind) ? payload.failure_kind : 'other';
  db.prepare(`
    UPDATE outreach_runs SET status = 'failed', failure_kind = ?, error = ?, stats = ?, cost_usd = ?, finished_at = datetime('now') WHERE id = ?
  `).run(kind, str(payload.error, 1000) || FAILURE_TEXT[kind] || 'unknown error', JSON.stringify(payload.stats || {}), Number(payload.cost_usd) || 0, run.id);
  return { success: true, summary: `Outreach run #${run.id} failed: ${kind}` };
}

/** Whether DataForSEO worked on the latest finished run: what the SEO Monitor and the brief show. */
export function dataForSeoStatus() {
  const last = db.prepare("SELECT * FROM outreach_runs WHERE status IN ('done', 'failed') ORDER BY id DESC LIMIT 1").get();
  if (!last) return { state: 'never', message: 'No outreach run yet' };
  if (last.status === 'done') return { state: 'ok', at: last.finished_at, message: `Worked on the last run (${last.finished_at} UTC)` };
  const state = last.failure_kind === 'other' ? 'failed' : last.failure_kind.replace('dataforseo_', '');
  return { state, at: last.finished_at, message: last.error || FAILURE_TEXT[last.failure_kind] || 'The last run failed', failure_kind: last.failure_kind };
}

// ------------------------------------------------------------ the portal

const PROSPECT_FIELDS = `p.*, c.name AS client_name, u.name AS assignee_name, u.email AS assignee_email`;

/** Admins see everything; anyone else only what is assigned to them. */
export function outreachReport(user) {
  const admin = ['admin', 'super_admin'].includes(user.role);
  const rows = db.prepare(`
    SELECT ${PROSPECT_FIELDS} FROM outreach_prospects p
    JOIN crm_clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.assigned_to
    WHERE p.status <> 'rejected' ${admin ? '' : 'AND p.assigned_to = ?'}
    ORDER BY CASE p.status WHEN 'to_approve' THEN 0 WHEN 'follow_up_to_approve' THEN 1 WHEN 'to_send' THEN 2 WHEN 'follow_up_to_send' THEN 3 ELSE 4 END,
             p.domain_rank DESC, p.id DESC
    LIMIT 500
  `).all(...(admin ? [] : [user.id]));
  const runs = db.prepare(`
    SELECT r.*, c.name AS client_name FROM outreach_runs r JOIN crm_clients c ON c.id = r.client_id
    WHERE r.id IN (SELECT MAX(id) FROM outreach_runs GROUP BY client_id) ORDER BY c.name
  `).all().map((r) => ({ ...r, stats: safeJson(r.stats) }));
  return {
    admin,
    dataforseo: dataForSeoStatus(),
    cc: outreachCc(),
    runs,
    prospects: rows,
    staff: admin ? db.prepare("SELECT id, name, email FROM users WHERE is_active = 1 AND role <> 'api_readonly' ORDER BY name").all() : [],
  };
}

const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const getProspect = (id) => db.prepare(`SELECT ${PROSPECT_FIELDS} FROM outreach_prospects p JOIN crm_clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.assigned_to WHERE p.id = ?`).get(id);

/** 007 approves (with any edits) and assigns: { assigned_to, email_subject, email_body, email_cc, our_url, contact_email }. */
export function approveProspect(id, edits, user) {
  const p = getProspect(id);
  if (!p) return { status: 404, error: 'Prospect not found' };
  if (!['to_approve', 'follow_up_to_approve'].includes(p.status)) return { status: 409, error: `This prospect is ${p.status}` };
  const assignee = parseInt(edits?.assigned_to, 10) || p.assigned_to;
  if (!assignee || !db.prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1').get(assignee)) {
    return { status: 400, error: 'Choose who sends it' };
  }
  const subject = str(edits?.email_subject ?? p.email_subject, 300);
  const body = str(edits?.email_body ?? p.email_body, 6000);
  if (!subject || !body) return { status: 400, error: 'The email needs a subject and a body' };
  db.prepare(`
    UPDATE outreach_prospects SET status = ?, assigned_to = ?, email_subject = ?, email_body = ?, email_cc = ?, our_url = ?,
      contact_email = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(p.status === 'to_approve' ? 'to_send' : 'follow_up_to_send', assignee, subject, body,
    str(edits?.email_cc ?? p.email_cc, 1000), str(edits?.our_url ?? p.our_url, 1000), str(edits?.contact_email ?? p.contact_email, 200),
    user.email, p.id);
  return { status: 200, prospect: getProspect(p.id) };
}

export function rejectProspect(id) {
  const res = db.prepare(`
    UPDATE outreach_prospects SET status = CASE status WHEN 'follow_up_to_approve' THEN 'lost' ELSE 'rejected' END, updated_at = datetime('now')
    WHERE id = ? AND status IN ('to_approve', 'follow_up_to_approve')
  `).run(id);
  return res.changes ? { status: 200 } : { status: 409, error: 'Only prospects waiting for approval can be rejected' };
}

const mayAct = (p, user) => ['admin', 'super_admin'].includes(user.role) || p.assigned_to === user.id;

/** The staff member sent it from Gmail. */
export function markSent(id, user) {
  const p = getProspect(id);
  if (!p) return { status: 404, error: 'Prospect not found' };
  if (!mayAct(p, user)) return { status: 403, error: 'This email is assigned to someone else' };
  if (!['to_send', 'follow_up_to_send'].includes(p.status)) return { status: 409, error: `This prospect is ${p.status}` };
  db.prepare(`
    UPDATE outreach_prospects SET status = 'sent', sent_at = datetime('now'),
      follow_up_count = follow_up_count + CASE status WHEN 'follow_up_to_send' THEN 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?
  `).run(p.id);
  return { status: 200 };
}

/** { outcome: replied|won|lost, live_url?, note? } */
export function markOutcome(id, { outcome, live_url, note } = {}, user) {
  const p = getProspect(id);
  if (!p) return { status: 404, error: 'Prospect not found' };
  if (!mayAct(p, user)) return { status: 403, error: 'This email is assigned to someone else' };
  if (!['replied', 'won', 'lost'].includes(outcome)) return { status: 400, error: 'Outcome must be replied, won or lost' };
  if (!['sent', 'replied', 'won', 'follow_up_to_approve'].includes(p.status)) return { status: 409, error: `This prospect is ${p.status}` };
  if (outcome === 'won' && !/^https?:\/\//.test(live_url || '')) return { status: 400, error: 'Add the page where the link is live' };
  db.prepare(`
    UPDATE outreach_prospects SET status = ?, live_url = COALESCE(?, live_url), reply_note = COALESCE(?, reply_note), updated_at = datetime('now') WHERE id = ?
  `).run(outcome, str(live_url, 1000), str(note, 500), p.id);
  return { status: 200 };
}

// ------------------------------------------------------------ the brief

export function outreachSummaryText() {
  const dfs = dataForSeoStatus();
  const count = (status) => db.prepare('SELECT COUNT(*) AS n FROM outreach_prospects WHERE status = ?').get(status).n;
  const lines = [
    `Outreach: ${count('to_approve') + count('follow_up_to_approve')} to approve · ${count('to_send') + count('follow_up_to_send')} to send · ${count('sent')} waiting for a reply · ${count('won')} won`,
    dfs.state === 'ok' || dfs.state === 'never'
      ? `DataForSEO: ${dfs.message}`
      : `DataForSEO PROBLEM: ${dfs.message}`,
  ];
  return lines.join('\n');
}
