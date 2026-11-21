/**
 * Reel Lab: viral reels in, hooks and a script out.
 *
 * Staff queue a run from the Script Tracker; the Mac connector starts
 * scripts/ig_worker.mjs, which claims it over the signed webhook
 * (claim_reel_lab_runs), writes with the instagram-agent skills, runs the
 * skills' Python checks itself and posts the result back
 * (submit_reel_lab_result). Nothing is posted to Instagram. Saving a result
 * makes a Draft script (hidden from the client portal) or, for "Improve
 * hooks", rewrites the script it came from.
 *
 * Same pull model as the night blog pipeline (blogRuns.js).
 */

import db from '../../database.js';
import { buildBlogConfig } from './blogPipeline.js';

export const MAX_REFERENCES = 3;
// A run nobody finished in this long is dead (Mac slept, worker crashed).
export const STALE_MINUTES = 30;
const MAX_LOG_CHARS = 8000;

const parse = (s, fallback) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

const clean = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

export function getReelLabRow(id) {
  return db.prepare('SELECT * FROM reel_lab_runs WHERE id = ?').get(id);
}

export function serializeReelLabRun(row) {
  if (!row) return null;
  return {
    id: row.id, client_id: row.client_id, mode: row.mode, script_id: row.script_id, month: row.month,
    topic: row.topic, references: parse(row.references_json, []), notes: row.notes,
    status: row.status, requested_by: row.requested_by, worker: row.worker, model: row.model,
    result: parse(row.result_json, null), error: row.error,
    log: row.log ? row.log.split('\n').filter(Boolean) : [],
    saved_script_id: row.saved_script_id,
    created_at: row.created_at, started_at: row.started_at, finished_at: row.finished_at, updated_at: row.updated_at,
  };
}

/** Running runs nobody finished in STALE_MINUTES are marked failed so the client can queue again. */
export function failStaleReelLabRuns() {
  return db.prepare(`
    UPDATE reel_lab_runs SET status = 'failed', error = 'The worker stopped before finishing (timed out). Try again.',
      finished_at = datetime('now'), updated_at = datetime('now')
    WHERE status = 'running' AND started_at < datetime('now', ?)
  `).run(`-${STALE_MINUTES} minutes`).changes;
}

/**
 * Validate and queue one run. Returns { run } or { status, error }.
 * One run in flight per client: a second click while one is queued or
 * running would only spend twice.
 */
export function queueReelLabRun({ clientId, mode = 'new', scriptId = null, month = null, topic = null, references = [], notes = null, requestedBy = null }) {
  const client = db.prepare('SELECT id, is_active FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { status: 404, error: 'Client not found' };
  if (!['new', 'improve'].includes(mode)) return { status: 400, error: "mode must be 'new' or 'improve'" };

  const refs = (Array.isArray(references) ? references : [])
    .map((r) => ({ url: clean(r?.url, 500), notes: clean(r?.notes, 4000) }))
    .filter((r) => r.url || r.notes);
  if (refs.length > MAX_REFERENCES) return { status: 400, error: `At most ${MAX_REFERENCES} reference reels` };
  for (const r of refs) {
    if (r.url && !/^https?:\/\/\S+$/i.test(r.url)) return { status: 400, error: `Not a link: ${r.url}` };
  }

  let script = null;
  if (mode === 'improve') {
    script = db.prepare('SELECT id, month FROM marketing_scripts WHERE id = ? AND client_id = ?').get(scriptId, clientId);
    if (!script) return { status: 404, error: 'Script not found for this client' };
  } else {
    // The bot cannot watch a video, so a bare link gives it nothing to work from.
    if (!refs.some((r) => r.notes) && !clean(topic, 500)) {
      return { status: 400, error: 'Say what happens in at least one reel (hook line, transcript or caption), or give a topic' };
    }
  }

  const m = clean(month, 7) || script?.month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return { status: 400, error: 'month must be YYYY-MM' };

  failStaleReelLabRuns();
  const inFlight = db.prepare("SELECT id FROM reel_lab_runs WHERE client_id = ? AND status IN ('queued', 'running')").get(clientId);
  if (inFlight) return { status: 409, error: `Reel Lab run #${inFlight.id} is already in progress for this client` };

  const res = db.prepare(`
    INSERT INTO reel_lab_runs (client_id, mode, script_id, month, topic, references_json, notes, requested_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, mode, script?.id ?? null, m, clean(topic, 500), JSON.stringify(refs), clean(notes, 4000), clean(requestedBy, 200));
  return { run: serializeReelLabRun(getReelLabRow(res.lastInsertRowid)) };
}

export function listReelLabRuns(clientId, limit = 10) {
  return db.prepare('SELECT * FROM reel_lab_runs WHERE client_id = ? ORDER BY id DESC LIMIT ?')
    .all(clientId, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50))
    .map(serializeReelLabRun);
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The client's own recent Instagram reels with synced numbers: the best and
 * the worst against their median, so the writer learns what works for this
 * account rather than for Instagram in general.
 */
export function clientReelPerformance(clientId) {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.caption, t.date, t.views, t.ig_reach, t.avg_watch_time_sec, t.skip_rate_pct,
           t.shares, t.saves, t.follows, s.hook_formula, s.hook_text, s.script_text
    FROM marketing_content_tracker t
    LEFT JOIN marketing_content_script_relation r ON r.content_id = t.id
    LEFT JOIN marketing_scripts s ON s.id = r.script_id
    WHERE t.client_id = ? AND t.metrics_synced_at IS NOT NULL AND t.views > 0
      AND LOWER(COALESCE(t.post_type, '')) = 'reel'
      AND LOWER(COALESCE(t.platform, 'instagram')) LIKE '%instagram%'
      AND t.date >= date('now', '-120 days')
    GROUP BY t.id
    ORDER BY t.date DESC
    LIMIT 60
  `).all(clientId);
  const med = median(rows.map((r) => r.views));
  const shape = (r) => ({
    title: r.title,
    date: r.date,
    multiple: med ? Math.round((r.views / med) * 10) / 10 : null,
    views: r.views,
    reach: r.ig_reach,
    avg_watch_sec: r.avg_watch_time_sec,
    skip_rate_pct: r.skip_rate_pct,
    shares: r.shares,
    saves: r.saves,
    follows: r.follows,
    hook_formula: r.hook_formula || null,
    first_line: (r.hook_text || (r.script_text || '').split('\n').map((l) => l.trim()).find(Boolean) || (r.caption || '').split('\n')[0] || '').slice(0, 160),
  });
  const byViews = [...rows].sort((a, b) => b.views - a.views);
  return {
    reels: rows.length,
    median_views: med,
    top: byViews.slice(0, 5).map(shape),
    bottom: rows.length >= 8 ? byViews.slice(-3).map(shape) : [],
  };
}

/** What the worker needs for one run: the request, the client's voice and rules, their numbers. */
function buildJob(run) {
  const config = buildBlogConfig(run.client_id);
  const ig = db.prepare('SELECT ig_on_camera_style, ig_signature_phrases, instagram_url FROM crm_clients WHERE id = ?').get(run.client_id) || {};
  const keywords = db.prepare(`
    SELECT keyword FROM seo_keywords WHERE client_id = ? AND status = 'approved' ORDER BY score DESC LIMIT 5
  `).all(run.client_id).map((k) => k.keyword);
  const script = run.script_id
    ? db.prepare('SELECT id, title, script_text, hook_text, hook_formula FROM marketing_scripts WHERE id = ?').get(run.script_id)
    : null;
  return {
    run_id: run.id,
    mode: run.mode,
    month: run.month,
    topic: run.topic,
    references: parse(run.references_json, []),
    notes: run.notes,
    script,
    client: {
      id: config?.client.id ?? run.client_id,
      name: config?.client.name ?? null,
      is_active: config?.client.is_active ?? false,
      website_url: config?.client.website_url ?? null,
      instagram_url: ig.instagram_url || null,
    },
    compliance_profile: config?.pipeline?.blog_compliance_profile || 'general',
    onboarding: config?.onboarding || {},
    instagram_voice: { on_camera_style: ig.ig_on_camera_style || null, signature_phrases: ig.ig_signature_phrases || null },
    search_keywords: [...new Set([...(config?.onboarding?.brand_niche_keywords || []), ...keywords])].slice(0, 8),
    performance: clientReelPerformance(run.client_id),
  };
}

/** Hand up to `limit` queued runs to a worker. */
export function claimReelLabRuns(worker = 'local', limit = 1) {
  failStaleReelLabRuns();
  const claim = db.transaction(() => {
    const rows = db.prepare("SELECT id FROM reel_lab_runs WHERE status = 'queued' ORDER BY id LIMIT ?").all(limit);
    const mark = db.prepare(`
      UPDATE reel_lab_runs SET status = 'running', worker = ?, started_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status = 'queued'
    `);
    return rows.filter((r) => mark.run(String(worker).slice(0, 100), r.id).changes === 1).map((r) => r.id);
  });
  return claim().map((id) => buildJob(getReelLabRow(id)));
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Keep only the shape the Script Tracker renders; anything else from the worker is dropped. */
export function normalizeResult(r) {
  if (!r || typeof r !== 'object') return null;
  const hooks = (Array.isArray(r.hooks) ? r.hooks : []).slice(0, 8).map((h) => ({
    formula_id: Number.isFinite(h?.formula_id) ? h.formula_id : null,
    formula_name: str(h?.formula_name, 80),
    spoken: str(h?.spoken, 400),
    on_screen: str(h?.on_screen, 120),
    why: str(h?.why, 400),
    score: Number.isFinite(h?.score) ? Math.round(h.score * 10) / 10 : null,
    verdict: str(h?.verdict, 20),
    weakest: str(h?.weakest, 40),
    flags: (Array.isArray(h?.flags) ? h.flags : []).slice(0, 6).map((f) => str(f, 300)),
    beats: (Array.isArray(h?.beats) ? h.beats : []).slice(0, 40).map((b) => ({
      start: Number(b?.start) || 0, dur: Number(b?.dur) || 0, label: str(b?.label, 12), text: str(b?.text, 400),
      flags: (Array.isArray(b?.flags) ? b.flags : []).slice(0, 4).map((f) => str(f, 200)),
    })),
    total_seconds: Number.isFinite(h?.total_seconds) ? h.total_seconds : null,
    beat_notes: (Array.isArray(h?.beat_notes) ? h.beat_notes : []).slice(0, 8).map((n) => str(n, 400)),
  })).filter((h) => h.spoken);
  if (!hooks.length) return null;
  const body = (Array.isArray(r.body) ? r.body : []).map((l) => str(l, 600)).filter(Boolean).slice(0, 40);
  if (!body.length) return null;
  const cap = r.caption && typeof r.caption === 'object' ? r.caption : {};
  return {
    title: str(r.title, 200) || 'Reel',
    angle: str(r.angle, 600),
    reference_lessons: (Array.isArray(r.reference_lessons) ? r.reference_lessons : []).slice(0, 3).map((l) => str(l, 500)),
    target_seconds: Number.isFinite(r.target_seconds) ? r.target_seconds : null,
    hooks,
    body,
    on_screen: (Array.isArray(r.on_screen) ? r.on_screen : []).slice(0, 20).map((c) => ({
      line: Number.isInteger(c?.line) ? c.line : 0, text: str(c?.text, 120),
    })).filter((c) => c.text),
    caption: {
      text: str(cap.text, 2200),
      visible: str(cap.visible, 400),
      truncated: !!cap.truncated,
      checks: (Array.isArray(cap.checks) ? cap.checks : []).slice(0, 15).map((c) => ({ check: str(c?.check, 40), status: str(c?.status, 10), detail: str(c?.detail, 300) })),
    },
    human: r.human && typeof r.human === 'object' ? {
      score: Number.isFinite(r.human.score) ? r.human.score : null,
      verdict: str(r.human.verdict, 20),
      checks: Object.fromEntries(Object.entries(r.human.checks || {}).slice(0, 8).map(([k, v]) => [str(k, 40), { score: Number(v?.score) || 0, detail: str(v?.detail, 300) }])),
      cleaned: (Array.isArray(r.human.cleaned) ? r.human.cleaned : []).slice(0, 20).map((c) => str(c, 200)),
    } : null,
    placeholders: (Array.isArray(r.placeholders) ? r.placeholders : []).slice(0, 10).map((p) => str(p, 200)),
    notes: (Array.isArray(r.notes) ? r.notes : []).slice(0, 10).map((n) => str(n, 500)),
  };
}

/** The worker's result. Stored as ready for staff to pick a hook. */
export function submitReelLabResult(payload) {
  const run = getReelLabRow(payload?.run_id);
  if (!run) return { success: false, summary: `Reel Lab run #${payload?.run_id} not found` };
  if (run.status !== 'running') return { success: false, summary: `Reel Lab run #${run.id} is ${run.status}, not running` };
  const result = normalizeResult(payload.result);
  if (!result) return { success: false, summary: 'result needs at least one hook and a script body' };
  db.prepare(`
    UPDATE reel_lab_runs SET status = 'ready', model = ?, result_json = ?, error = NULL,
      finished_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(clean(payload.model, 100), JSON.stringify(result), run.id);
  return { success: true, summary: `Reel Lab run #${run.id} ready with ${result.hooks.length} hook(s)` };
}

export function failReelLabRun(payload) {
  const run = getReelLabRow(payload?.run_id);
  if (!run) return { success: false, summary: `Reel Lab run #${payload?.run_id} not found` };
  if (!['queued', 'running'].includes(run.status)) return { success: false, summary: `Reel Lab run #${run.id} is already ${run.status}` };
  db.prepare("UPDATE reel_lab_runs SET status = 'failed', error = ?, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(String(payload.error || 'unknown error').slice(0, 2000), run.id);
  return { success: true, summary: `Reel Lab run #${run.id} marked failed` };
}

/** One progress line from the worker, shown while staff wait. */
export function appendReelLabLog(payload) {
  const run = getReelLabRow(payload?.run_id);
  if (!run) return { success: false, summary: `Reel Lab run #${payload?.run_id} not found` };
  // The team reads these in India time.
  const at = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
  const line = `${at} ${String(payload.log || '').replace(/\s+/g, ' ').trim().slice(0, 300)}`;
  const log = `${run.log ? `${run.log}\n` : ''}${line}`.slice(-MAX_LOG_CHARS);
  db.prepare("UPDATE reel_lab_runs SET log = ?, updated_at = datetime('now') WHERE id = ?").run(log, run.id);
  return { success: true, summary: 'logged' };
}

const fmtTime = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};

/** The script text as the team reads it on a script card: hook, script, on-screen cards with times, caption. */
export function composeScriptText(result, hookIndex) {
  const hook = result.hooks[hookIndex];
  const lines = [hook.spoken, ...result.body];
  const starts = hook.beats?.length === lines.length ? hook.beats.map((b) => b.start) : null;
  const out = [
    `HOOK (${hook.formula_name || 'hook'}${hook.score != null ? `, scored ${hook.score}` : ''})`,
    hook.spoken,
    hook.on_screen ? `On screen: ${hook.on_screen}` : null,
    '',
    'SCRIPT',
    ...result.body,
  ];
  if (result.on_screen.length) {
    out.push('', 'ON-SCREEN TEXT');
    for (const c of result.on_screen) {
      const at = starts && starts[c.line] != null ? fmtTime(starts[c.line]) : `line ${c.line + 1}`;
      out.push(`${at}  ${c.text}`);
    }
  }
  if (hook.total_seconds) out.push('', `Length: about ${Math.round(hook.total_seconds)} s spoken`);
  if (result.caption?.text) out.push('', 'CAPTION', result.caption.text);
  return out.filter((l) => l !== null).join('\n');
}

/**
 * Save the chosen hook. 'new' runs make a Draft script; 'improve' runs
 * rewrite the script they came from. Returns { script_id } or { status, error }.
 */
export function saveReelLabRun(id, { hookIndex, title, month } = {}, actor = 'staff') {
  const run = getReelLabRow(id);
  if (!run) return { status: 404, error: 'Reel Lab run not found' };
  if (run.status !== 'ready') return { status: 409, error: `Run is ${run.status}; only a ready run can be saved` };
  const result = parse(run.result_json, null);
  const i = Number(hookIndex);
  if (!result || !Number.isInteger(i) || i < 0 || i >= result.hooks.length) return { status: 400, error: 'Pick one of the hooks' };
  const hook = result.hooks[i];
  const text = composeScriptText(result, i);
  const hookFormula = hook.formula_id ? `#${hook.formula_id} ${hook.formula_name}`.trim() : (hook.formula_name || null);

  const save = db.transaction(() => {
    let scriptId;
    if (run.mode === 'improve') {
      const existing = db.prepare('SELECT id FROM marketing_scripts WHERE id = ? AND client_id = ?').get(run.script_id, run.client_id);
      if (!existing) return { status: 404, error: 'The script this run improves no longer exists' };
      db.prepare(`
        UPDATE marketing_scripts SET script_text = ?, hook_formula = ?, hook_text = ?, hook_score = ?, reel_lab_run_id = ?,
          has_unseen_changes = 1, last_changed_by = 'staff', updated_at = datetime('now')
        WHERE id = ?
      `).run(text, hookFormula, hook.spoken, hook.score, run.id, existing.id);
      scriptId = existing.id;
    } else {
      const m = clean(month, 7) || run.month;
      if (!/^\d{4}-\d{2}$/.test(m || '')) return { status: 400, error: 'month must be YYYY-MM' };
      const refs = parse(run.references_json, []);
      scriptId = db.prepare(`
        INSERT INTO marketing_scripts (client_id, month, title, script_text, reference_video_link, format, status,
          has_unseen_changes, last_changed_by, hook_formula, hook_text, hook_score, reel_lab_run_id)
        VALUES (?, ?, ?, ?, ?, 'reel', 'Draft', 1, 'staff', ?, ?, ?, ?)
      `).run(run.client_id, m, clean(title, 200) || result.title, text, refs.find((r) => r.url)?.url || null,
        hookFormula, hook.spoken, hook.score, run.id).lastInsertRowid;
    }
    db.prepare("UPDATE reel_lab_runs SET status = 'saved', saved_script_id = ?, updated_at = datetime('now') WHERE id = ?").run(scriptId, run.id);
    return { script_id: scriptId, mode: run.mode, client_id: run.client_id, actor };
  });
  return save();
}
