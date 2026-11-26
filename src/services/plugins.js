/**
 * The open-source Claude Code plugins our monitors run on (claude-seo,
 * claude-blog, claude-ads, and marketing-skills for the planned monitors),
 * and the Update button for them.
 *
 *   Mac plugin_update_worker → report_plugin_status (installed + latest, hourly)
 *   Q's weekly routine       → report_plugin_review  (safe / test first / wait / breaks)
 *   SEO or Ads Monitor       → Update & test → requestPluginUpdate() → queued
 *   Mac plugin_update_worker → claim_plugin_updates → update, check skills,
 *                              rebuild, smoke check → finish_plugin_update
 *                              (updated, or rolled_back to the old version)
 *
 * The button is refused until Q has reviewed the exact release it would
 * install, and when Q said it breaks something. The worker never runs during
 * the night pipelines, or while any SEO, ads, blog or fix run is in flight,
 * because those read the plugin files it replaces.
 */

import db from '../../database.js';

export const PLUGINS = {
  'claude-seo': {
    repo: 'AgriciDaniel/claude-seo',
    install_id: 'claude-seo@agricidaniel-claude-seo',
    marketplace: 'agricidaniel-claude-seo',
    label: 'SEO Monitor',
    monitors: ['seo'],
  },
  'claude-blog': {
    repo: 'AgriciDaniel/claude-blog',
    install_id: 'claude-blog@agricidaniel-blog',
    marketplace: 'agricidaniel-blog',
    label: 'Blog drafts',
    monitors: ['seo'],
  },
  'claude-ads': {
    repo: 'AgriciDaniel/claude-ads',
    install_id: 'claude-ads@ai-marketing-hub-claude-ads',
    marketplace: 'ai-marketing-hub-claude-ads',
    label: 'Ads Monitor',
    monitors: ['ads'],
  },
  // coreyhaines31/marketingskills: the skills behind the planned Client Brain
  // and the Outbound, Conversion and Lifecycle monitors. Tracked (and reviewed
  // by Q) before it is installed, so a release is safety-checked before first use.
  'marketing-skills': {
    repo: 'coreyhaines31/marketingskills',
    install_id: 'marketing-skills@marketingskills',
    marketplace: 'marketingskills',
    label: 'Marketing skills',
    monitors: ['seo'],
  },
};

const VERDICTS = ['safe', 'test_first', 'wait', 'breaks'];
export const STATUS_STALE_MINUTES = 60;
// The night pipelines (queued 01:00-03:30, deploys from 00:30, the 06:30
// draft review) read plugin files; an update in that window would swap them
// mid-run.
export const NIGHT_HOLD_IST = { start: '00:30', end: '06:45' };
const DEFAULT_SMOKE_URL = 'https://hypheningmedia.com/';

// Scripts our workers call directly, beyond the skills.
const REQUIRED_SCRIPTS = {
  'claude-seo': ['scripts/gsc_query.py', 'scripts/ga4_report.py', 'scripts/commoncrawl_graph.py', 'scripts/verify_backlinks.py', 'scripts/drift_baseline.py', 'scripts/claude-seo'],
  'claude-blog': ['scripts/quality_gate.py'],
  'claude-ads': [],
  'marketing-skills': [],
};
// The blog worker's prompt names these (scripts/blog_worker.mjs).
const BLOG_SKILLS = ['blog-write', 'blog-brief', 'blog-outline', 'blog-seo-check', 'blog-factcheck', 'blog-geo', 'blog-schema', 'blog-cannibalization'];
// What the Client Brain and the Outbound monitor will call first. Grows as the
// Conversion and Lifecycle monitors get cards.
const MARKETING_SKILLS = ['product-marketing', 'customer-research', 'competitor-profiling', 'prospecting', 'cold-email', 'revops', 'sales-enablement'];

const str = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const isPlugin = (p) => Object.prototype.hasOwnProperty.call(PLUGINS, p);
const semver = (v) => (typeof v === 'string' && /^v?\d+\.\d+\.\d+/.test(v) ? v.replace(/^v/, '').match(/^\d+\.\d+\.\d+/)[0] : null);

/** a < b for x.y.z versions. */
export function olderThan(a, b) {
  const x = semver(a); const y = semver(b);
  if (!x || !y) return false;
  const pa = x.split('.').map(Number); const pb = y.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i];
  return false;
}

/** Skills our workers invoke from this plugin: what an update must not lose. */
export function requiredSkills(plugin) {
  if (plugin === 'claude-seo') {
    const types = db.prepare('SELECT audit_type FROM agent_run_config').all().map((r) => r.audit_type);
    const names = types.map((t) => (t === 'full' ? 'seo-audit' : t === 'backlink_gap' ? 'seo-backlinks' : `seo-${t.replace(/_/g, '-')}`));
    return [...new Set(['seo', ...names])].sort();
  }
  if (plugin === 'claude-ads') {
    return db.prepare("SELECT DISTINCT skill_name FROM ads_agent_config WHERE skill_name IS NOT NULL AND skill_name != ''").all().map((r) => r.skill_name).sort();
  }
  if (plugin === 'claude-blog') return [...BLOG_SKILLS];
  if (plugin === 'marketing-skills') return [...MARKETING_SKILLS];
  return [];
}

function istMinutes(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function inNightHold(now = new Date()) {
  const m = istMinutes(now);
  return m >= hm(NIGHT_HOLD_IST.start) && m < hm(NIGHT_HOLD_IST.end);
}

/** Runs that read plugin files right now, by kind; empty when an update is safe to start. */
export function busyRuns() {
  const count = (sql) => { try { return db.prepare(sql).get().n; } catch { return 0; } };
  const busy = {
    seo: count("SELECT COUNT(*) n FROM seo_agent_runs WHERE status = 'running'"),
    ads: count("SELECT COUNT(*) n FROM ads_agent_runs WHERE status = 'running'"),
    blog: count("SELECT COUNT(*) n FROM blog_agent_runs WHERE status = 'running'"),
    fixes: count("SELECT COUNT(*) n FROM seo_fix_batches WHERE status IN ('running', 'deploying')"),
    outreach: count("SELECT COUNT(*) n FROM outreach_runs WHERE status = 'running'"),
  };
  return Object.fromEntries(Object.entries(busy).filter(([, n]) => n > 0));
}

function smokeUrl() {
  try {
    const v = db.prepare("SELECT value FROM app_settings WHERE key = 'plugin_smoke_url'").get()?.value;
    if (v && /^https?:\/\//.test(v)) return v;
  } catch { /* no settings table in an old db */ }
  return DEFAULT_SMOKE_URL;
}

function driftUrls() {
  try {
    return db.prepare("SELECT DISTINCT website_url u FROM crm_clients WHERE is_active = 1 AND seo_enabled = 1 AND website_url LIKE 'http%'").all().map((r) => r.u);
  } catch { return []; }
}

/** Why the button is off, or null when it may be pressed. */
export function updateBlocker(row, liveJob) {
  if (liveJob) return liveJob.status === 'queued' ? 'An update is already queued' : 'An update is running';
  if (!row.installed_version && row.status_reported_at) return 'Not installed on the Mac yet';
  if (!row.installed_version) return 'The Mac has not reported the installed version yet';
  if (!row.latest_version) return 'The latest release is not known yet';
  if (!olderThan(row.installed_version, row.latest_version)) return 'Up to date';
  if (!row.reviewed_version || semver(row.reviewed_version) !== semver(row.latest_version)) {
    return `Q has not reviewed ${row.latest_version} yet (Mondays 09:00 IST)`;
  }
  if (row.review_verdict === 'breaks') return `Q's review says ${row.latest_version} breaks our pipeline`;
  return null;
}

/** Minutes since an SQLite datetime('now') value (UTC), or null. */
function minutesSince(t) {
  if (!t) return null;
  const ms = Date.parse(`${String(t).replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? (Date.now() - ms) / 60000 : null;
}

const parseList = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

function shape(row) {
  const jobs = db.prepare('SELECT * FROM plugin_updates WHERE plugin = ? ORDER BY id DESC LIMIT 5').all(row.plugin);
  const live = jobs.find((j) => j.status === 'queued' || j.status === 'running') || null;
  const statusAge = minutesSince(row.status_reported_at);
  return {
    ...row,
    ...PLUGINS[row.plugin],
    new_skills: parseList(row.new_skills),
    behind: olderThan(row.installed_version, row.latest_version),
    // The Mac has reported, and Claude Code has no install of it.
    not_installed: !row.installed_version && !!row.status_reported_at,
    review_current: !!row.reviewed_version && semver(row.reviewed_version) === semver(row.latest_version),
    status_stale: statusAge == null || statusAge > STATUS_STALE_MINUTES * 3,
    blocker: updateBlocker(row, live),
    live_job: live,
    last_job: jobs.find((j) => j !== live) || null,
  };
}

/** Every plugin, or the ones a monitor ('seo' | 'ads') shows. */
export function listPlugins({ monitor } = {}) {
  const rows = db.prepare('SELECT * FROM plugin_status ORDER BY plugin').all()
    .filter((r) => isPlugin(r.plugin) && (!monitor || PLUGINS[r.plugin].monitors.includes(monitor)));
  return {
    plugins: rows.map(shape),
    hold: inNightHold() ? `Updates wait until ${NIGHT_HOLD_IST.end} IST while the night runs` : null,
    busy: busyRuns(),
  };
}

// ------------------------------------------------------------ operator

export function requestPluginUpdate(plugin, user) {
  if (!isPlugin(plugin)) return { status: 404, error: 'Unknown plugin' };
  const row = db.prepare('SELECT * FROM plugin_status WHERE plugin = ?').get(plugin);
  const live = db.prepare("SELECT * FROM plugin_updates WHERE plugin = ? AND status IN ('queued', 'running')").get(plugin);
  const blocker = updateBlocker(row, live);
  if (blocker) return { status: 409, error: blocker };
  const r = db.prepare('INSERT INTO plugin_updates (plugin, from_version, target_version, requested_by) VALUES (?, ?, ?, ?)')
    .run(plugin, row.installed_version, row.latest_version, user?.email || user?.name || 'admin');
  return { status: 200, job: db.prepare('SELECT * FROM plugin_updates WHERE id = ?').get(r.lastInsertRowid) };
}

export function cancelPluginUpdate(id) {
  const job = db.prepare('SELECT * FROM plugin_updates WHERE id = ?').get(id);
  if (!job) return { status: 404, error: 'Update not found' };
  if (job.status !== 'queued') return { status: 409, error: `The update is ${job.status}; only a queued one can be cancelled` };
  db.prepare("UPDATE plugin_updates SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?").run(id);
  return { status: 200 };
}

// ------------------------------------------------------------ Mac worker

/** Whether the Mac should report installed/latest on this pass. */
export function statusDue() {
  const rows = db.prepare('SELECT status_reported_at t FROM plugin_status').all();
  return rows.some((r) => { const age = minutesSince(r.t); return age == null || age > STATUS_STALE_MINUTES; });
}

/**
 * Queued updates, or none with the reason they wait. Each job carries the
 * install ids, the skills and scripts it must keep, and the smoke URL.
 */
export function claimPluginUpdates(worker = 'mac', { now = new Date() } = {}) {
  const base = { status_due: statusDue(), plugins: Object.entries(PLUGINS).map(([plugin, p]) => ({ plugin, ...p })) };
  const queued = db.prepare("SELECT COUNT(*) n FROM plugin_updates WHERE status = 'queued'").get().n;
  if (!queued) return { ...base, jobs: [] };
  if (inNightHold(now)) return { ...base, jobs: [], held: `night runs (until ${NIGHT_HOLD_IST.end} IST)` };
  const busy = busyRuns();
  if (Object.keys(busy).length) return { ...base, jobs: [], held: `runs in flight: ${Object.entries(busy).map(([k, n]) => `${n} ${k}`).join(', ')}` };

  const claim = db.transaction(() => {
    const jobs = db.prepare("SELECT * FROM plugin_updates WHERE status = 'queued' ORDER BY id").all();
    for (const j of jobs) {
      db.prepare("UPDATE plugin_updates SET status = 'running', started_at = datetime('now'), log = ? WHERE id = ?")
        .run(`claimed by ${String(worker).slice(0, 80)}`, j.id);
    }
    return jobs;
  });
  const smoke = smokeUrl();
  return {
    ...base,
    jobs: claim().map((j) => ({
      update_id: j.id,
      plugin: j.plugin,
      ...PLUGINS[j.plugin],
      from_version: j.from_version,
      target_version: j.target_version,
      required_skills: requiredSkills(j.plugin),
      required_scripts: REQUIRED_SCRIPTS[j.plugin] || [],
      smoke_url: smoke,
      // claude-seo parser fixes change stored drift values once; these get a fresh baseline.
      drift_urls: j.plugin === 'claude-seo' ? driftUrls() : [],
    })),
  };
}

/** { plugins: [{ plugin, installed_version, installed_sha, latest_version, latest_sha, latest_published_at }] } */
export function reportPluginStatus(payload) {
  const items = Array.isArray(payload?.plugins) ? payload.plugins.filter((p) => isPlugin(p?.plugin)) : [];
  if (!items.length) return { success: false, summary: 'No known plugins in the report' };
  const apply = db.transaction(() => {
    for (const p of items) {
      // A failed GitHub lookup reports latest as null: keep what we knew.
      db.prepare(`
        UPDATE plugin_status SET
          installed_version = coalesce(?, installed_version), installed_sha = coalesce(?, installed_sha),
          latest_version = coalesce(?, latest_version), latest_sha = coalesce(?, latest_sha),
          latest_published_at = coalesce(?, latest_published_at),
          status_reported_at = datetime('now'), updated_at = datetime('now')
        WHERE plugin = ?
      `).run(semver(p.installed_version), str(p.installed_sha, 64), semver(p.latest_version), str(p.latest_sha, 64), str(p.latest_published_at, 40), p.plugin);
    }
  });
  apply();
  const behind = db.prepare('SELECT * FROM plugin_status').all().filter((r) => olderThan(r.installed_version, r.latest_version));
  return {
    success: true,
    summary: behind.length ? `Behind: ${behind.map((r) => `${r.plugin} ${r.installed_version} → ${r.latest_version}`).join(', ')}` : 'All plugins up to date',
  };
}

/** Q's review: { plugin, version, sha, verdict, summary, impact, new_skills, reviewed_by } */
export function reportPluginReview(payload) {
  if (!isPlugin(payload?.plugin)) return { success: false, summary: `Unknown plugin: ${payload?.plugin}` };
  if (!semver(payload.version)) return { success: false, summary: 'version must be x.y.z' };
  if (!VERDICTS.includes(payload.verdict)) return { success: false, summary: `verdict must be one of ${VERDICTS.join(', ')}` };
  const skills = (Array.isArray(payload.new_skills) ? payload.new_skills : [])
    .map((s) => String(s).trim()).filter((s) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s)).slice(0, 30);
  db.prepare(`
    UPDATE plugin_status SET reviewed_version = ?, reviewed_sha = ?, review_verdict = ?, review_summary = ?, review_impact = ?,
      new_skills = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE plugin = ?
  `).run(semver(payload.version), str(payload.sha, 64), payload.verdict, str(payload.summary, 2000), str(payload.impact, 1000),
    JSON.stringify(skills), str(payload.reviewed_by, 80) || 'Q', payload.plugin);
  return { success: true, summary: `${payload.plugin} ${semver(payload.version)} reviewed: ${payload.verdict}` };
}

/** A progress line from the worker: { update_id, log } */
export function pluginUpdateLog(payload) {
  const job = db.prepare('SELECT id, status FROM plugin_updates WHERE id = ?').get(payload?.update_id);
  if (!job) return { success: false, summary: `Plugin update #${payload?.update_id} not found` };
  if (job.status !== 'running') return { success: false, summary: `Plugin update #${job.id} is ${job.status}` };
  db.prepare("UPDATE plugin_updates SET log = substr(coalesce(log, '') || char(10) || ?, -20000) WHERE id = ?").run(str(payload.log, 2000) || '', job.id);
  return { success: true, summary: 'logged' };
}

/** { update_id, status: updated | failed | rolled_back, to_version, log, error } */
export function finishPluginUpdate(payload) {
  const job = db.prepare('SELECT * FROM plugin_updates WHERE id = ?').get(payload?.update_id);
  if (!job) return { success: false, summary: `Plugin update #${payload?.update_id} not found` };
  if (job.status !== 'running') return { success: false, summary: `Plugin update #${job.id} is ${job.status}, not running` };
  const status = ['updated', 'failed', 'rolled_back'].includes(payload.status) ? payload.status : 'failed';
  db.prepare(`
    UPDATE plugin_updates SET status = ?, to_version = ?, log = coalesce(?, log), error = ?, finished_at = datetime('now') WHERE id = ?
  `).run(status, semver(payload.to_version), str(payload.log, 20000), status === 'updated' ? null : (str(payload.error, 1000) || 'unknown error'), job.id);
  if (semver(payload.to_version)) {
    db.prepare("UPDATE plugin_status SET installed_version = ?, updated_at = datetime('now') WHERE plugin = ?").run(semver(payload.to_version), job.plugin);
  }
  return { success: true, summary: `${job.plugin} update #${job.id}: ${status}${payload.to_version ? ` (now ${semver(payload.to_version)})` : ''}` };
}

/** One line per plugin that is behind, for the morning brief and the night summary. */
export function pluginSummaryLines() {
  return db.prepare('SELECT * FROM plugin_status ORDER BY plugin').all()
    .filter((r) => olderThan(r.installed_version, r.latest_version))
    .map((r) => `${r.plugin}: ${r.installed_version} installed, ${r.latest_version} out${r.review_verdict && semver(r.reviewed_version) === semver(r.latest_version) ? ` (Q: ${r.review_verdict.replace('_', ' ')})` : ' (not reviewed yet)'}`);
}
