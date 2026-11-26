/**
 * The shared framework for the new monitors (Brain and Outbound now;
 * Conversion and Lifecycle next): cards, what each needs before it can run,
 * runs, and recommendations. One set of tables for all of them, instead of a
 * copy per monitor like seo_audits / ads_audits.
 *
 *   Outbound tab → POST /api/clients/:id/growth/run/:card → queueGrowthRun
 *     (refused, with the list, while anything the card needs is missing)
 *   Mac connector → scripts/growth_worker.mjs → claim_growth_runs: each job
 *     carries the Brain as .agents/product-marketing.md and the facts its
 *     skill needs → claude with the marketing-skills plugin →
 *     submit_growth_result / fail_growth_run
 *   Proposals (Brain sections, learnings) wait for a person to apply them.
 *
 * A run is started by an admin pressing Run, which is the approval: nothing
 * here queues itself yet.
 */

import db from '../../database.js';
import { getBrain, saveBrain, renderBrainMarkdown, missingSections, BRAIN_SECTIONS } from './clientBrain.js';
import { getOutboundSettings, listSuppression, addLeadsFromRun, leadStats, serializeLead, MAX_PROSPECTS_PER_RUN } from './coldOutbound.js';

export const STALE_RUN_MINUTES = 45;
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const PLUGIN = 'marketing-skills';
const OUTBOUND_GROUPS = ['b2b_saas', 'b2b_services', 'ecommerce'];
const sectionLabel = Object.fromEntries(BRAIN_SECTIONS.map((s) => [s.key, s.label]));

/**
 * The cards. `needs` lists requirement keys checked by requirement(); a card
 * runs only when all are met. `groups` limits which client groups see it.
 */
export const CARDS = [
  {
    key: 'brain_build', monitor: 'brain', label: 'Build or refresh the Brain', skills: ['product-marketing', 'customer-research'],
    stale_after_days: 90, needs: ['plugin', 'website'],
    about: 'Reads the website and what is already saved, and proposes each Brain section and the claims it can back with a source. Nothing changes until someone applies it.',
  },
  {
    key: 'competitor_research', monitor: 'brain', label: 'Competitor profiles', skills: ['competitor-profiling'],
    stale_after_days: 30, needs: ['plugin', 'website', 'brain:product_overview', 'brain:target_audience'],
    about: 'Dated, sourced profiles of the main competitors, proposed as the Competitors section.',
  },
  {
    key: 'outbound_prospects', monitor: 'outbound', label: 'Find prospects and draft emails', skills: ['prospecting', 'cold-email'],
    stale_after_days: 7, groups: OUTBOUND_GROUPS,
    needs: ['flag:outbound', 'plugin', 'website', 'brain:product_overview', 'brain:target_audience', 'brain:pains', 'brain:proof_points',
      'claims', 'ob:sender_name', 'ob:sending_domains', 'ob:offer', 'ob:booking', 'ob:reply_owner_email', 'ob:postal_address', 'ob:target_countries'],
    about: 'Finds companies that fit the ideal customer, with a source for each, and drafts a short sequence for one person at each. Every lead waits for approval.',
  },
  {
    key: 'outbound_replies', monitor: 'outbound', label: 'Suggest replies', skills: ['cold-email'],
    stale_after_days: 9999, groups: OUTBOUND_GROUPS, needs: ['flag:outbound', 'plugin', 'replies_waiting'],
    about: 'Sorts each reply and drafts an answer for a person to send. Never replies by itself.',
  },
  {
    key: 'outbound_retro', monitor: 'outbound', label: 'Weekly review', skills: ['cold-email', 'marketing-loops'],
    stale_after_days: 7, groups: OUTBOUND_GROUPS, needs: ['flag:outbound', 'plugin', 'contacted:20'],
    about: 'Reads the week\'s numbers and replies, checks the stop rules (bounces over 2%, replies under 1% after 300 sends), and proposes learnings for the Brain.',
  },
  {
    key: 'outbound_deliverability', monitor: 'outbound', label: 'Sending domain check', skills: [],
    stale_after_days: 7, groups: OUTBOUND_GROUPS, needs: ['flag:outbound', 'ob:sending_domains'],
    about: 'Checks each sending domain\'s MX, SPF and DMARC records. No AI, no tokens.',
  },
];
const CARD = Object.fromEntries(CARDS.map((c) => [c.key, c]));
export const MONITORS = ['brain', 'outbound'];

const parse = (s, fallback) => {
  if (s == null) return fallback;
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
};
const minutesSince = (t) => {
  if (!t) return null;
  const ms = Date.parse(`${String(t).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z'}`);
  return Number.isFinite(ms) ? (Date.now() - ms) / 60000 : null;
};

function cardConfig(key) {
  const row = db.prepare('SELECT * FROM growth_card_config WHERE card_key = ?').get(key);
  const c = CARD[key];
  return {
    stale_after_days: row?.stale_after_days ?? c.stale_after_days,
    model: row?.default_model || DEFAULT_MODEL,
    enabled: row ? !!row.enabled : true,
  };
}

const pluginInstalled = () => {
  try { return !!db.prepare('SELECT installed_version FROM plugin_status WHERE plugin = ?').get(PLUGIN)?.installed_version; } catch { return false; }
};

/** One requirement: null when met, else { key, label, where }. */
function requirement(key, ctx) {
  const { client, brain, ob } = ctx;
  const brainWhere = 'Onboarding → Brain';
  const obWhere = 'Onboarding → Outbound setup';
  if (key === 'plugin') return pluginInstalled() ? null : { key, label: 'The marketing-skills plugin is not installed on the Mac yet', where: 'SEO Monitor → plugins (after Q\'s review)' };
  if (key === 'website') return client.website_url ? null : { key, label: 'Website URL', where: 'Clients → Edit' };
  if (key === 'flag:outbound') return client.outbound_enabled ? null : { key, label: 'Outbound is switched off for this client', where: 'Clients → Outbound switch' };
  if (key === 'claims') return brain.claims.length ? null : { key, label: 'At least one approved claim, with its source', where: brainWhere };
  if (key.startsWith('brain:')) {
    const k = key.slice(6);
    return missingSections(brain, [k]).length ? { key, label: `Brain: ${sectionLabel[k] || k}`, where: brainWhere } : null;
  }
  if (key.startsWith('ob:')) {
    const k = key.slice(3);
    const label = {
      sender_name: 'Who the emails come from', sending_domains: 'Sending domains (not the main website domain)',
      offer: 'The offer or ask in the first email', booking: 'How prospects book a meeting',
      reply_owner_email: 'Who handles replies (email)', postal_address: 'Postal address for the email footer',
      target_countries: 'Countries to target',
    }[k] || k;
    let ok;
    if (k === 'booking') ok = !!ob.booking_method && (ob.booking_method !== 'booking_link' || !!ob.booking_url);
    else if (Array.isArray(ob[k])) ok = ob[k].length > 0;
    else ok = !!ob[k];
    return ok ? null : { key, label: `Outbound setup: ${label}`, where: obWhere };
  }
  if (key === 'replies_waiting') {
    const n = db.prepare("SELECT COUNT(*) n FROM outbound_leads WHERE client_id = ? AND status IN ('replied', 'positive')").get(client.id).n;
    return n ? null : { key, label: 'No replies waiting', where: 'Replies arrive from the sending tool, or mark one on a lead' };
  }
  if (key.startsWith('contacted:')) {
    const need = parseInt(key.split(':')[1], 10);
    const have = leadStats(client.id).contacted;
    return have >= need ? null : { key, label: `At least ${need} contacted prospects (${have} so far)`, where: 'Outbound → leads' };
  }
  return { key, label: key, where: '' };
}

function context(clientId) {
  const client = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return null;
  return { client, brain: getBrain(clientId), ob: getOutboundSettings(clientId) };
}

/** Why the card can't be used for this client at all (not just missing data), or null. */
function unavailable(card, client) {
  if (!['marketing', 'both'].includes(client.client_type)) return 'Only for marketing clients';
  if (card.groups && !client.client_group) return 'Set the client group first (Clients → Edit)';
  if (card.groups && !card.groups.includes(client.client_group)) {
    return client.client_group === 'healthcare'
      ? 'Not for healthcare clients: NMC and Dental Council rules forbid soliciting patients'
      : `Not used for ${client.client_group.replace(/_/g, ' ')} clients`;
  }
  return null;
}

function shapeRun(r) {
  if (!r) return null;
  return { ...r, result: parse(r.result, null) };
}

/** Every card for one client and monitor: status, what's missing, the last run. */
export function cardsFor(clientId, monitor) {
  const ctx = context(clientId);
  if (!ctx) return null;
  return CARDS.filter((c) => !monitor || c.monitor === monitor).map((c) => {
    const cfg = cardConfig(c.key);
    const reason = !cfg.enabled ? 'Switched off' : unavailable(c, ctx.client);
    const missing = reason ? [] : c.needs.map((k) => requirement(k, ctx)).filter(Boolean);
    const runs = db.prepare('SELECT * FROM growth_runs WHERE client_id = ? AND card_key = ? ORDER BY id DESC LIMIT 5').all(clientId, c.key).map(shapeRun);
    const live = runs.find((r) => ['queued', 'running'].includes(r.status)) || null;
    const lastDone = runs.find((r) => r.status === 'done') || null;
    const age = lastDone ? minutesSince(lastDone.finished_at) / 1440 : null;
    return {
      key: c.key, monitor: c.monitor, label: c.label, about: c.about, skills: c.skills,
      stale_after_days: cfg.stale_after_days,
      unavailable: reason, missing, ready: !reason && !missing.length,
      live_run: live, last_run: runs.find((r) => r !== live) || null, last_done: lastDone,
      due: !reason && cfg.stale_after_days < 9999 && (age == null || age >= cfg.stale_after_days),
    };
  });
}

export function queueGrowthRun(clientId, cardKey, by = 'admin') {
  const card = CARD[cardKey];
  if (!card) return { status: 404, error: 'Unknown card' };
  const status = cardsFor(clientId, card.monitor)?.find((c) => c.key === cardKey);
  if (!status) return { status: 404, error: 'Client not found' };
  if (status.unavailable) return { status: 409, error: status.unavailable };
  if (status.missing.length) return { status: 409, error: `Add before running: ${status.missing.map((m) => m.label).join('; ')}`, missing: status.missing };
  if (status.live_run) return { status: 409, error: `Already ${status.live_run.status}` };
  const r = db.prepare('INSERT INTO growth_runs (client_id, card_key, monitor, requested_by, model) VALUES (?, ?, ?, ?, ?)')
    .run(clientId, cardKey, card.monitor, String(by).slice(0, 80), cardConfig(cardKey).model);
  return { status: 200, run: shapeRun(db.prepare('SELECT * FROM growth_runs WHERE id = ?').get(r.lastInsertRowid)) };
}

export function cancelGrowthRun(clientId, runId) {
  const r = db.prepare("UPDATE growth_runs SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND client_id = ? AND status = 'queued'").run(runId, clientId);
  return r.changes ? { status: 200 } : { status: 409, error: 'Only a queued run can be cancelled' };
}

export function getGrowthRun(clientId, runId) {
  return shapeRun(db.prepare('SELECT * FROM growth_runs WHERE id = ? AND client_id = ?').get(runId, clientId));
}

// ------------------------------------------------------------ worker

function failStaleRuns() {
  db.prepare(`
    UPDATE growth_runs SET status = 'failed', error = 'The worker stopped before finishing (timed out). Run it again.', finished_at = datetime('now')
    WHERE status = 'running' AND started_at < datetime('now', ?)
  `).run(`-${STALE_RUN_MINUTES} minutes`);
}

/** What one run's worker needs: the card, the Brain as markdown, and the card's facts. */
function jobFor(run) {
  const card = CARD[run.card_key];
  const client = db.prepare('SELECT id, name, website_url, client_group FROM crm_clients WHERE id = ?').get(run.client_id);
  const job = {
    run_id: run.id, card_key: run.card_key, monitor: run.monitor, skills: card.skills, model: run.model || DEFAULT_MODEL,
    client, brain_markdown: renderBrainMarkdown(run.client_id), brain: getBrain(run.client_id),
  };
  if (run.monitor === 'outbound') {
    const ob = getOutboundSettings(run.client_id);
    job.outbound = ob;
    job.stats = leadStats(run.client_id);
  }
  if (run.card_key === 'outbound_prospects') {
    const ob = job.outbound;
    job.wanted = Math.min(ob.weekly_new_prospects || 30, MAX_PROSPECTS_PER_RUN);
    job.suppression = listSuppression(run.client_id).map((s) => s.value);
    job.known_domains = db.prepare('SELECT DISTINCT domain FROM outbound_leads WHERE client_id = ? AND domain IS NOT NULL ORDER BY id DESC LIMIT 3000').all(run.client_id).map((r) => r.domain);
    job.rejected_examples = db.prepare("SELECT company, why_prospect FROM outbound_leads WHERE client_id = ? AND status = 'rejected' ORDER BY id DESC LIMIT 15").all(run.client_id);
  }
  if (run.card_key === 'outbound_replies') {
    job.replies = db.prepare("SELECT * FROM outbound_leads WHERE client_id = ? AND status IN ('replied', 'positive') ORDER BY last_event_at DESC LIMIT 25").all(run.client_id)
      .map(serializeLead).map((l) => ({ lead_id: l.id, company: l.company, contact_name: l.contact_name, contact_title: l.contact_title, status: l.status, reply: l.reply_note, sequence: l.sequence }));
  }
  if (run.card_key === 'outbound_retro') {
    job.recent_events = db.prepare("SELECT type, detail, occurred_at FROM outbound_events WHERE client_id = ? AND occurred_at >= datetime('now', '-14 days') ORDER BY id DESC LIMIT 200").all(run.client_id);
    job.recent_replies = db.prepare("SELECT company, contact_title, status, reply_note FROM outbound_leads WHERE client_id = ? AND reply_note IS NOT NULL ORDER BY last_event_at DESC LIMIT 30").all(run.client_id);
  }
  return job;
}

export function claimGrowthRuns(worker = 'mac', limit = 3) {
  failStaleRuns();
  const claimed = db.transaction(() => {
    const rows = db.prepare("SELECT * FROM growth_runs WHERE status = 'queued' ORDER BY id LIMIT ?").all(Math.min(Math.max(limit, 1), 5));
    for (const r of rows) {
      db.prepare("UPDATE growth_runs SET status = 'running', started_at = datetime('now'), log = ? WHERE id = ?").run(`claimed by ${String(worker).slice(0, 80)}`, r.id);
    }
    return rows;
  })();
  return claimed.filter((r) => CARD[r.card_key]).map(jobFor);
}

export function growthRunLog({ run_id, log } = {}) {
  const run = db.prepare('SELECT id, status FROM growth_runs WHERE id = ?').get(run_id);
  if (!run) return { success: false, summary: `Growth run #${run_id} not found` };
  if (run.status !== 'running') return { success: false, summary: `Growth run #${run.id} is ${run.status}` };
  db.prepare("UPDATE growth_runs SET log = substr(coalesce(log, '') || char(10) || ?, -12000) WHERE id = ?").run(String(log || '').slice(0, 1500), run.id);
  return { success: true, summary: 'logged' };
}

function addRecommendations(run, recs) {
  const insert = db.prepare('INSERT INTO growth_recommendations (run_id, client_id, monitor, card_key, title, detail, priority) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let n = 0;
  for (const r of (Array.isArray(recs) ? recs : []).slice(0, 30)) {
    const title = String(r?.title || '').trim().slice(0, 200);
    if (!title) continue;
    insert.run(run.id, run.client_id, run.monitor, run.card_key, title, r?.detail ? String(r.detail).slice(0, 4000) : null,
      ['high', 'medium', 'low'].includes(r?.priority) ? r.priority : 'medium');
    n++;
  }
  return n;
}

/** { run_id, summary, result, cost_usd, model } from the worker. */
export function submitGrowthResult(payload = {}) {
  const run = db.prepare('SELECT * FROM growth_runs WHERE id = ?').get(payload.run_id);
  if (!run) return { success: false, summary: `Growth run #${payload.run_id} not found` };
  if (run.status !== 'running') return { success: false, summary: `Growth run #${run.id} is ${run.status}, not running` };
  const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
  let note = '';
  db.transaction(() => {
    if (run.card_key === 'outbound_prospects') {
      const r = addLeadsFromRun(run.client_id, run.id, result.leads);
      result.added = r.added;
      result.skipped = r.skipped;
      delete result.leads; // stored as leads; the run keeps the counts
      note = ` · ${r.added} lead(s) to approve, ${r.skipped.length} skipped`;
    }
    if (run.card_key === 'outbound_replies') {
      const drafts = (Array.isArray(result.drafts) ? result.drafts : []).slice(0, 25);
      addRecommendations(run, drafts.map((d) => ({
        title: `Reply to ${d.company || `lead #${d.lead_id}`}${d.category ? ` (${d.category})` : ''}`,
        detail: [d.suggested_reply, d.next_step && `Next: ${d.next_step}`].filter(Boolean).join('\n\n'),
        priority: d.category === 'positive' || d.category === 'meeting' ? 'high' : 'medium',
      })));
      note = ` · ${drafts.length} reply draft(s)`;
    }
    const n = addRecommendations(run, result.recommendations);
    if (n) note += ` · ${n} recommendation(s)`;
    db.prepare(`UPDATE growth_runs SET status = 'done', summary = ?, result = ?, cost_usd = ?, model = coalesce(?, model), finished_at = datetime('now') WHERE id = ?`)
      .run(String(payload.summary || '').slice(0, 2000) || null, JSON.stringify(result).slice(0, 400000),
        Number.isFinite(Number(payload.cost_usd)) ? Number(payload.cost_usd) : null, payload.model ? String(payload.model).slice(0, 80) : null, run.id);
  })();
  return { success: true, summary: `${run.card_key} #${run.id} done${note}` };
}

export function failGrowthRun({ run_id, error } = {}) {
  const run = db.prepare('SELECT * FROM growth_runs WHERE id = ?').get(run_id);
  if (!run) return { success: false, summary: `Growth run #${run_id} not found` };
  if (!['queued', 'running'].includes(run.status)) return { success: false, summary: `Growth run #${run.id} is already ${run.status}` };
  db.prepare("UPDATE growth_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(String(error || 'unknown error').slice(0, 1000), run.id);
  return { success: true, summary: `${run.card_key} #${run.id} failed` };
}

// ------------------------------------------------------------ proposals

/**
 * Put a finished run's proposal into the Brain. Brain sections: only the keys
 * asked for, or by default only sections that are empty now, so nothing a
 * person wrote is overwritten without them choosing it. Claims and learnings
 * are added, never replaced.
 */
export function applyGrowthRun(clientId, runId, { keys } = {}, by = 'staff') {
  const run = getGrowthRun(clientId, runId);
  if (!run) return { status: 404, error: 'Run not found' };
  if (run.status !== 'done') return { status: 409, error: `The run is ${run.status}` };
  const proposal = run.result || {};
  const brain = getBrain(clientId);
  const sections = {};
  const proposed = { ...(proposal.sections || {}) };
  if (run.card_key === 'competitor_research' && proposal.competitors_section) proposed.competitors = proposal.competitors_section;
  const want = Array.isArray(keys) && keys.length ? keys : Object.keys(proposed).filter((k) => missingSections(brain, [k]).length);
  for (const k of want) if (proposed[k]) sections[k] = proposed[k];

  const have = new Set(brain.claims.map((c) => c.claim.toLowerCase()));
  const newClaims = (Array.isArray(proposal.claims) ? proposal.claims : []).filter((c) => c?.claim && c?.source && !have.has(String(c.claim).toLowerCase()));
  const newLearnings = Array.isArray(proposal.learnings) ? proposal.learnings : [];
  if (!Object.keys(sections).length && !newClaims.length && !newLearnings.length) return { status: 409, error: 'Nothing new to apply (sections already filled: pick them to overwrite)' };

  const saved = saveBrain(clientId, {
    sections,
    ...(newClaims.length ? { claims: [...brain.claims, ...newClaims] } : {}),
    ...(newLearnings.length ? { learnings: [...brain.learnings, ...newLearnings] } : {}),
  }, { by, note: `applied ${run.card_key} run #${run.id}` });
  if (saved.status !== 200) return saved;
  db.prepare("UPDATE growth_runs SET applied_at = datetime('now'), applied_by = ? WHERE id = ?").run(String(by).slice(0, 80), run.id);
  return { status: 200, brain: saved.brain, applied: { sections: Object.keys(sections), claims: newClaims.length, learnings: newLearnings.length } };
}

export function listRecommendations(clientId, { monitor, status = 'open' } = {}) {
  const where = ['client_id = ?'];
  const params = [clientId];
  if (monitor) { where.push('monitor = ?'); params.push(monitor); }
  if (status) { where.push('status = ?'); params.push(status); }
  return db.prepare(`SELECT * FROM growth_recommendations WHERE ${where.join(' AND ')} ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC LIMIT 200`).all(...params);
}

export function setRecommendationStatus(clientId, id, status) {
  if (!['open', 'done', 'dismissed'].includes(status)) return { status: 400, error: 'status must be open, done or dismissed' };
  const r = db.prepare("UPDATE growth_recommendations SET status = ?, updated_at = datetime('now') WHERE id = ? AND client_id = ?").run(status, id, clientId);
  return r.changes ? { status: 200 } : { status: 404, error: 'Not found' };
}

/** One line per marketing client with outbound on, for the morning brief. */
export function outboundSummaryLines() {
  const rows = db.prepare("SELECT id, name FROM crm_clients WHERE is_active = 1 AND client_type IN ('marketing', 'both') AND outbound_enabled = 1 ORDER BY id").all();
  return rows.map((c) => {
    const s = leadStats(c.id);
    const waiting = s.by_status.to_approve;
    const replies = s.by_status.replied + s.by_status.positive;
    return `${c.name}: ${waiting} to approve, ${replies} replies waiting, ${s.meetings} meetings${s.reply_rate != null ? `, reply rate ${s.reply_rate}%` : ''}`;
  });
}
