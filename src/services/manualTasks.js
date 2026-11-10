/**
 * Manual tasks: every open SEO or ads finding a person has to do by hand, in
 * one list per client. Nothing is copied; this reads the findings tables.
 *
 * What counts as manual:
 *   SEO   the night worker sorted it "not_code" (off the site: backlinks,
 *         Business Profile, Search Console, content...), or "needs_007" (a site
 *         change it won't make without your OK).
 *   Ads   the card marked it ad-account or business work (kind), the night
 *         worker sorted it "not_code", or it is "needs_007".
 * Findings a newer audit of the same card replaced (superseded) are left out.
 *
 * Owners are staff emails from MANUAL_TASK_ASSIGNEES (comma-separated).
 */

import db from '../../database.js';
import { parseRecKey, recKey } from './seoNight.js';

export const AREAS = [
  { key: 'site', label: 'Site changes that need your OK' },
  { key: 'offsite', label: 'Backlinks & off-site' },
  { key: 'gbp', label: 'Google Business Profile' },
  { key: 'google', label: 'Search Console & analytics' },
  { key: 'content', label: 'Content' },
  { key: 'ad_account', label: 'Ad account' },
  { key: 'business', label: 'Business' },
  { key: 'other', label: 'Other' },
];
/** Areas the night worker may give a not_code finding. */
export const WORKER_AREAS = ['offsite', 'gbp', 'google', 'content', 'ad_account', 'business', 'other'];
// ('automatic' is also stored as an area, on findings the night sort closed itself; they are never open here.)

// A not_code finding sorted before the worker named an area gets one from the
// card that found it.
const AREA_BY_CARD = {
  backlinks: 'offsite', backlink_gap: 'offsite', competitor_pages: 'offsite',
  maps: 'gbp', local: 'gbp',
  google: 'google',
  content: 'content', content_brief: 'content', cluster: 'content', plan: 'content', programmatic: 'content', flow: 'content', geo: 'content',
};

export function assignees() {
  const raw = process.env.MANUAL_TASK_ASSIGNEES || 'omkar@hypheningmedia.com,social@hypheningmedia.com';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function areaFor(rec, fleet) {
  if (rec.status === 'needs_007') return 'site';
  if (WORKER_AREAS.includes(rec.manual_area)) return rec.manual_area;
  if (fleet === 'ads' && (rec.kind === 'ad_account' || rec.kind === 'business')) return rec.kind;
  if (fleet === 'ads') return 'ad_account';
  return AREA_BY_CARD[rec.card] || 'other';
}

const SEO_MANUAL = "r.superseded_by_audit_id IS NULL AND (r.status = 'needs_007' OR (r.status = 'open' AND r.fix_triage = 'not_code'))";
const ADS_MANUAL = "r.superseded_by_audit_id IS NULL AND (r.status = 'needs_007' OR (r.status = 'open' AND (r.fix_triage = 'not_code' OR r.kind IN ('ad_account', 'business'))))";
const FIELDS = 'r.id, r.client_id, r.priority, r.metric, r.issue, r.action_required, r.observation, r.page_url, r.status, r.fix_reason, r.manual_area, r.manual_group, r.assigned_to, r.created_at';
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function rows(clientId) {
  const where = clientId ? 'AND r.client_id = ?' : '';
  const args = clientId ? [clientId] : [];
  const seo = db.prepare(`
    SELECT ${FIELDS}, a.audit_type AS card FROM seo_recommendations r
    JOIN seo_audits a ON a.id = r.audit_id WHERE ${SEO_MANUAL} ${where}
  `).all(...args).map((r) => ({ ...r, fleet: 'seo' }));
  const ads = db.prepare(`
    SELECT ${FIELDS}, r.kind, r.campaign_name, r.platform, a.agent_type AS card FROM ads_recommendations r
    JOIN ads_audits a ON a.id = r.audit_id WHERE ${ADS_MANUAL} ${where}
  `).all(...args).map((r) => ({ ...r, fleet: 'ads' }));
  return [...seo, ...ads];
}

/**
 * The tab's data for one client: tasks grouped by area, most urgent first.
 * Findings the night worker put in the same group (the same work raised by
 * several cards) show as one task: the most urgent one, with every card listed.
 */
export function listManualTasks(clientId) {
  const single = rows(clientId).map((r) => ({
    key: String(recKey(r.fleet, r.id)),
    fleet: r.fleet,
    card: r.fleet === 'ads' ? `ads ${r.card}` : r.card,
    area: areaFor(r, r.fleet),
    group: r.manual_group || null,
    priority: r.priority,
    issue: r.issue,
    steps: r.action_required,
    observation: r.observation,
    why_manual: r.fix_reason,
    page_url: r.page_url || null,
    campaign: r.campaign_name || null,
    platform: r.platform || null,
    assigned_to: r.assigned_to || null,
    status: r.status,
    created_at: r.created_at,
  })).sort(byUrgency);

  const tasks = [];
  const byGroup = new Map();
  for (const t of single) {
    const id = t.group && t.area !== 'site' ? `${t.fleet}:${t.group}` : null;
    if (id && byGroup.has(id)) {
      const lead = byGroup.get(id);
      lead.keys.push(t.key);
      if (!lead.cards.includes(t.card)) lead.cards.push(t.card);
      lead.assigned_to = lead.assigned_to || t.assigned_to;
      continue;
    }
    const task = { ...t, keys: [t.key], cards: [t.card] };
    if (id) byGroup.set(id, task);
    tasks.push(task);
  }
  const areas = AREAS.map((a) => ({ ...a, tasks: tasks.filter((t) => t.area === a.key) })).filter((a) => a.tasks.length);
  return { areas, total: tasks.length, findings: single.length, assignees: assignees() };
}

function byUrgency(a, b) {
  return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || b.created_at.localeCompare(a.created_at);
}

/** Open manual tasks, overall or for one client: { total, high } (High includes Critical). Merged repeats count once. */
export function countManualTasks(clientId = null) {
  const seen = new Set();
  let total = 0;
  let high = 0;
  for (const r of rows(clientId).sort(byUrgency)) {
    const id = r.manual_group && r.status !== 'needs_007' ? `${r.client_id}:${r.fleet}:${r.manual_group}` : null;
    if (id) { if (seen.has(id)) continue; seen.add(id); }
    total++;
    if (r.priority === 'Critical' || r.priority === 'High') high++;
  }
  return { total, high };
}

function load(key) {
  const k = parseRecKey(key);
  const rec = k && db.prepare(`SELECT * FROM ${k.table} WHERE id = ?`).get(k.id);
  return rec ? { k, rec } : null;
}

/** The finding and, when it is part of a merged task, the rest of its group still open. */
function withGroup({ k, rec }) {
  if (!rec.manual_group || rec.status === 'needs_007') return [rec.id];
  return db.prepare(`SELECT id FROM ${k.table} WHERE client_id = ? AND manual_group = ? AND status = 'open'`)
    .all(rec.client_id, rec.manual_group).map((r) => r.id).concat(rec.id).filter((v, i, a) => a.indexOf(v) === i);
}

export function assignManualTask(key, email) {
  const found = load(key);
  if (!found) return { status: 404, error: 'Task not found' };
  const to = email ? String(email).trim().toLowerCase() : null;
  if (to && !assignees().includes(to)) return { status: 400, error: `Can only assign to ${assignees().join(' or ')}` };
  const set = db.prepare(`UPDATE ${found.k.table} SET assigned_to = ? WHERE id = ?`);
  for (const id of withGroup(found)) set.run(to, id);
  return { status: 200 };
}

/** done: the work is finished (completed). skip: not doing it, reason required (ignored). Applies to a merged task's whole group. */
export function closeManualTask(key, how, { note = '', user } = {}) {
  const found = load(key);
  if (!found) return { status: 404, error: 'Task not found' };
  if (!['open', 'needs_007'].includes(found.rec.status)) return { status: 409, error: `This task is already ${found.rec.status}` };
  const text = String(note || '').trim().slice(0, 500);
  if (how === 'skip' && !text) return { status: 400, error: 'Say why it is not being done' };
  const status = how === 'done' ? 'completed' : 'ignored';
  const close = db.prepare(`
    UPDATE ${found.k.table} SET status = ?, manual_note = ?, manual_by = ?, manual_at = datetime('now'), fix_approved = 0,
      fixed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE fixed_at END
    WHERE id = ? AND status IN ('open', 'needs_007')
  `);
  db.transaction(() => { for (const id of withGroup(found)) close.run(status, text || null, user?.email || 'admin', status, id); })();
  return { status: 200 };
}

/** One line per client for the morning brief. */
export function manualSummaryLines() {
  const clients = db.prepare('SELECT id, name FROM crm_clients WHERE is_active = 1 AND (seo_enabled = 1 OR ads_enabled = 1) ORDER BY id').all();
  return clients.map((c) => {
    const n = countManualTasks(c.id);
    return n.total ? `- ${c.name}: ${n.total} manual task(s), ${n.high} High` : null;
  }).filter(Boolean);
}
