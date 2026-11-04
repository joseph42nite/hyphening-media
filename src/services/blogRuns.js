/**
 * The night blog pipeline (migration 096): queue tonight's posts, hand them
 * to the Mac's blog worker, store what it wrote, and publish what 007
 * approves. Vault: Group/Master Plan - Automation, Phase 5.
 *
 * The worker only ever writes drafts. Publishing happens here, on the
 * server, when 007 presses Approve, so the bots and the Mac never hold a
 * client's publishing key.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database.js';
import { decrypt } from './encryption.js';
import { getMode } from './automationMode.js';
import { buildBlogConfig, QUALITY_BAR } from './blogPipeline.js';
import { markdownToHtml } from './markdown.js';
import { logAction } from './auditLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://hypheningmedia.com').replace(/\/$/, '');

// Statuses that count against a client's posts-per-month and block a second
// run the same night. Failed and rejected runs don't count.
const LIVE_STATUSES = ['queued', 'running', 'client_review', 'ready', 'approved', 'published'];
// "Today" and "this month" are IST days: at the 01:00 IST run it is still
// yesterday in UTC, so a UTC day would count yesterday evening's draft.
const IST = "'+330 minutes'";
const CREATED_TODAY_IST = `datetime(created_at, ${IST}) >= date('now', ${IST})`;
const CREATED_THIS_MONTH_IST = `datetime(created_at, ${IST}) >= date('now', ${IST}, 'start of month')`;
const JSON_FIELDS = ['tags', 'internal_links', 'blockers', 'evidence'];

const now = () => new Date().toISOString();

export function getRunRow(id) {
  return db.prepare('SELECT * FROM blog_agent_runs WHERE id = ?').get(id);
}

/** A run as the API returns it: JSON columns parsed, client name attached. */
export function serializeRun(run) {
  if (!run) return null;
  const out = { ...run };
  for (const f of JSON_FIELDS) {
    try { out[f] = run[f] ? JSON.parse(run[f]) : (f === 'evidence' ? {} : []); } catch { out[f] = []; }
  }
  try { out.schema_json = run.schema_json ? JSON.parse(run.schema_json) : null; } catch { /* keep the string */ }
  const client = db.prepare('SELECT name, blog_publish_target, blog_publish_mode, blog_review_required, blog_audio_enabled FROM crm_clients WHERE id = ?').get(run.client_id);
  out.client_name = client?.name;
  out.audio_expected = !!client?.blog_audio_enabled;
  out.publish_target = client?.blog_publish_target;
  out.publish_mode = client?.blog_publish_mode;
  out.passes_bar = run.quality_score != null && run.quality_bar != null && run.quality_score >= run.quality_bar;
  return out;
}

/**
 * "Coming up" in the Blog Monitor: every client with Blog on, its next
 * planned topic, and whether tonight's start would draft it (same checks as
 * queueBlogRuns, read-only) or why not.
 */
export function blogOutlook() {
  const placeholders = LIVE_STATUSES.map(() => '?').join(',');
  const clients = db.prepare(`
    SELECT id, name, blog_posts_per_month, blog_audio_enabled FROM crm_clients
    WHERE is_active = 1 AND blog_enabled = 1 ORDER BY name
  `).all();
  const auto = getMode('blog') === 'auto';
  return clients.map((c) => {
    const used = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_agent_runs
      WHERE client_id = ? AND status IN (${placeholders}) AND ${CREATED_THIS_MONTH_IST}
    `).get(c.id, ...LIVE_STATUSES).n;
    const inFlight = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_agent_runs
      WHERE (client_id = ? AND status IN ('queued', 'running'))
         OR (client_id = ? AND status IN (${placeholders}) AND ${CREATED_TODAY_IST})
    `).get(c.id, c.id, ...LIVE_STATUSES).n;
    const planned = db.prepare(`
      SELECT id, topic, target_keyword, planned_for FROM blog_topics WHERE client_id = ? AND status = 'planned'
      ORDER BY planned_for IS NULL, planned_for, id
    `).all(c.id);
    let blocked = null;
    if (c.blog_posts_per_month <= 0) blocked = 'Posts per month is 0';
    else if (used >= c.blog_posts_per_month) blocked = `Month used up (${used}/${c.blog_posts_per_month})`;
    else if (inFlight > 0) blocked = 'Already drafted today';
    else if (planned.length === 0) blocked = 'No planned topic';
    else if (!auto) blocked = 'Blog is on Manual';
    return {
      client_id: c.id, client_name: c.name, posts_per_month: c.blog_posts_per_month, used_this_month: used,
      audio: !!c.blog_audio_enabled, next_topic: planned[0] || null, planned_count: planned.length,
      tonight: blocked === null, blocked,
    };
  });
}

/**
 * Queue at most one post per client: the next planned topic, for every
 * active client with blog on, posts left this month, and nothing already in
 * flight today. `force` (a manual "Draft now" from the Blog tab) skips the
 * automation-mode check but none of the others.
 */
export function queueBlogRuns({ clientId = null, requestedBy = 'schedule', force = false, topicId = null } = {}) {
  if (!force && getMode('blog') !== 'auto') return [];

  const clients = db.prepare(`
    SELECT id, name, blog_posts_per_month FROM crm_clients
    WHERE is_active = 1 AND blog_enabled = 1 AND blog_posts_per_month > 0 ${clientId ? 'AND id = ?' : ''}
    ORDER BY id
  `).all(...(clientId ? [clientId] : []));

  const queued = [];
  const queueOne = db.transaction((client) => {
    const placeholders = LIVE_STATUSES.map(() => '?').join(',');
    const thisMonth = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_agent_runs
      WHERE client_id = ? AND status IN (${placeholders}) AND ${CREATED_THIS_MONTH_IST}
    `).get(client.id, ...LIVE_STATUSES).n;
    if (thisMonth >= client.blog_posts_per_month) return null;

    const today = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_agent_runs
      WHERE (client_id = ? AND status IN ('queued', 'running'))
         OR (client_id = ? AND status IN (${placeholders}) AND ${CREATED_TODAY_IST})
    `).get(client.id, client.id, ...LIVE_STATUSES).n;
    if (today > 0) return null;

    const topic = topicId
      ? db.prepare("SELECT id FROM blog_topics WHERE id = ? AND client_id = ? AND status = 'planned'").get(topicId, client.id)
      : db.prepare(`
          SELECT id FROM blog_topics WHERE client_id = ? AND status = 'planned'
          ORDER BY planned_for IS NULL, planned_for, id LIMIT 1
        `).get(client.id);
    if (!topic) return null;

    const res = db.prepare(`
      INSERT INTO blog_agent_runs (client_id, topic_id, status, requested_by, quality_bar)
      VALUES (?, ?, 'queued', ?, ?)
    `).run(client.id, topic.id, requestedBy, null);
    db.prepare("UPDATE blog_topics SET status = 'queued', updated_at = datetime('now') WHERE id = ?").run(topic.id);
    return { run_id: res.lastInsertRowid, client_id: client.id, client_name: client.name, topic_id: topic.id };
  });

  for (const client of clients) {
    const q = queueOne(client);
    if (q) queued.push(q);
  }
  return queued;
}

/** Hand up to `limit` queued runs to a worker, with everything it needs. */
export function claimBlogRuns(worker = 'local', limit = 1) {
  const claim = db.transaction(() => {
    const rows = db.prepare("SELECT id FROM blog_agent_runs WHERE status = 'queued' ORDER BY id LIMIT ?").all(limit);
    const mark = db.prepare("UPDATE blog_agent_runs SET status = 'running', worker = ?, started_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'queued'");
    return rows.filter((r) => mark.run(worker, r.id).changes === 1).map((r) => r.id);
  });

  return claim().map((id) => {
    const run = getRunRow(id);
    const topic = run.topic_id ? db.prepare('SELECT * FROM blog_topics WHERE id = ?').get(run.topic_id) : null;
    // Earlier rejections of the same topic, so a redraft knows what to fix.
    const previousRejections = run.topic_id ? db.prepare(`
      SELECT reject_reason FROM blog_agent_runs
      WHERE topic_id = ? AND status = 'rejected' AND reject_reason IS NOT NULL ORDER BY id
    `).all(run.topic_id).map((r) => r.reject_reason) : [];
    return { run_id: id, topic, previous_rejections: previousRejections, config: buildBlogConfig(run.client_id) };
  });
}

/** Store the worker's draft. Ready for 007, or for the client's review first. */
export function submitBlogDraft(payload) {
  const run = getRunRow(payload?.run_id);
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  if (run.status !== 'running') return { success: false, summary: `Blog run #${run.id} is ${run.status}, not running` };
  if (!payload.title || !payload.content) return { success: false, summary: 'title and content are required' };

  const client = db.prepare('SELECT blog_review_required, blog_compliance_profile FROM crm_clients WHERE id = ?').get(run.client_id);
  const bar = QUALITY_BAR[client?.blog_compliance_profile] ?? QUALITY_BAR.general;
  const status = client?.blog_review_required && client.blog_review_required !== 'none' ? 'client_review' : 'ready';
  const asJson = (v) => (v == null ? null : JSON.stringify(v));

  db.prepare(`
    UPDATE blog_agent_runs SET
      status = ?, model = ?, finished_at = datetime('now'), updated_at = datetime('now'),
      title = ?, slug = ?, excerpt = ?, content = ?, category = ?, tags = ?,
      meta_title = ?, meta_description = ?, meta_keywords = ?, internal_links = ?,
      cover_image_url = ?, cover_alt = ?, schema_json = ?,
      quality_score = ?, quality_bar = ?, blockers = ?, evidence = ?, error = NULL
    WHERE id = ?
  `).run(
    status, payload.model || null,
    String(payload.title).slice(0, 300), payload.slug || null, payload.excerpt || null, payload.content,
    payload.category || null, asJson(payload.tags || []),
    payload.meta_title || null, payload.meta_description || null, payload.meta_keywords || null, asJson(payload.internal_links || []),
    payload.cover_image_url || null, payload.cover_alt || null, asJson(payload.schema_json || null),
    Number.isFinite(payload.quality_score) ? Math.round(payload.quality_score) : null, bar,
    asJson(payload.blockers || []), asJson(payload.evidence || {}), run.id,
  );
  if (run.topic_id) db.prepare("UPDATE blog_topics SET status = 'drafted', updated_at = datetime('now') WHERE id = ?").run(run.topic_id);
  return { success: true, summary: `Blog run #${run.id} stored as ${status}` };
}

/** The worker gave up (error, health check blocked). The topic goes back in the queue. */
export function failBlogRun(payload) {
  const run = getRunRow(payload?.run_id);
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  if (!['queued', 'running'].includes(run.status)) return { success: false, summary: `Blog run #${run.id} is already ${run.status}` };
  db.prepare("UPDATE blog_agent_runs SET status = 'failed', error = ?, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(String(payload.error || 'unknown error').slice(0, 2000), run.id);
  if (run.topic_id) db.prepare("UPDATE blog_topics SET status = 'planned', updated_at = datetime('now') WHERE id = ?").run(run.topic_id);
  return { success: true, summary: `Blog run #${run.id} marked failed` };
}

/**
 * Store the night's narration mp3 where /audio serves it (AUDIO_DIR, else
 * public/audio) and point the draft at it.
 */
export function attachBlogAudio(payload) {
  const run = getRunRow(payload?.run_id);
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  if (!['running', 'ready', 'client_review'].includes(run.status)) return { success: false, summary: `Blog run #${run.id} is ${run.status}` };
  const buf = Buffer.from(String(payload.mp3_base64 || ''), 'base64');
  // ID3 tag or an MPEG frame sync: anything else isn't an mp3.
  const isMp3 = buf.length > 1024 && (buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
  if (!isMp3) return { success: false, summary: 'mp3_base64 is not an mp3 file' };
  if (buf.length > 4 * 1024 * 1024) return { success: false, summary: 'mp3 is larger than 4 MB' };

  const dir = process.env.AUDIO_DIR || path.join(__dirname, '..', '..', 'public', 'audio');
  fs.mkdirSync(dir, { recursive: true });
  const file = `blog-run-${run.id}.mp3`;
  fs.writeFileSync(path.join(dir, file), buf);
  db.prepare("UPDATE blog_agent_runs SET audio_url = ?, updated_at = datetime('now') WHERE id = ?").run(`/audio/${file}`, run.id);
  return { success: true, summary: `Audio stored for blog run #${run.id}` };
}

/** Bots load a calendar: [{ topic, target_keyword?, planned_for?, notes? }]. */
export function addBlogTopics(clientId, topics, createdBy = 'agent') {
  const client = db.prepare('SELECT id FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { error: 'Client not found' };
  if (!Array.isArray(topics) || topics.length === 0) return { error: 'topics must be a non-empty array' };
  if (topics.length > 60) return { error: 'at most 60 topics at a time' };
  const insert = db.prepare('INSERT INTO blog_topics (client_id, topic, target_keyword, notes, planned_for, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  const ids = db.transaction(() => topics.map((t) => {
    if (!t?.topic || typeof t.topic !== 'string') throw new Error('every topic needs a "topic" string');
    const planned = t.planned_for && /^\d{4}-\d{2}-\d{2}$/.test(t.planned_for) ? t.planned_for : null;
    return insert.run(clientId, t.topic.trim().slice(0, 300), t.target_keyword || null, t.notes || null, planned, createdBy).lastInsertRowid;
  }))();
  return { ids };
}

// ---------------------------------------------------------------- publishing

function uniqueBlogSlug(base) {
  const slug = (base || 'post').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'post';
  let candidate = slug;
  for (let n = 1; db.prepare('SELECT 1 FROM blog_posts WHERE slug = ?').get(candidate); n++) candidate = `${slug}-${n}`;
  return candidate;
}

function publishToHypheningBlog(run) {
  const slug = uniqueBlogSlug(run.slug || run.title);
  const res = db.prepare(`
    INSERT INTO blog_posts (title, slug, excerpt, content, cover_image_url, audio_url, author, category, tags,
      meta_title, meta_description, meta_keywords, internal_links, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
  `).run(
    run.title, slug, run.excerpt, run.content, run.cover_image_url, run.audio_url,
    'Hyphening Media', run.category || 'General', (JSON.parse(run.tags || '[]') || []).join(', ') || null,
    run.meta_title, run.meta_description, run.meta_keywords, run.internal_links || '[]', now(),
  );
  return { blog_post_id: res.lastInsertRowid, published_url: `${SITE_URL}/blog/${slug}` };
}

async function publishToWordPress(run) {
  const cred = db.prepare('SELECT kind, endpoint_url, username, secret_enc FROM client_publish_credentials WHERE client_id = ?').get(run.client_id);
  if (!cred) throw new Error('No publishing key saved for this client');
  if (cred.kind !== 'wordpress') return null; // custom CMS: published by hand for now
  const key = process.env.CLIENT_CREDENTIALS_KEY;
  if (!key) throw new Error('CLIENT_CREDENTIALS_KEY is not set on the server');
  const auth = Buffer.from(`${cred.username}:${decrypt(cred.secret_enc, key)}`).toString('base64');
  const res = await fetch(`${cred.endpoint_url}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ title: run.title, slug: run.slug || undefined, excerpt: run.excerpt || '', content: markdownToHtml(run.content), status: 'publish' }),
  });
  if (!res.ok) throw new Error(`WordPress refused the post (HTTP ${res.status})`);
  const body = await res.json().catch(() => ({}));
  return { published_url: body.link || null };
}

/**
 * Approve one ready post and publish it where the client's settings say.
 * Targets the server can't publish to yet (custom CMS, repo file, handoff)
 * stop at 'approved' with a note saying who finishes it.
 */
export async function approveBlogRun(id, actor) {
  const run = getRunRow(id);
  if (!run) return { status: 404, error: 'Blog run not found' };
  if (run.status !== 'ready') return { status: 409, error: `Run is ${run.status}, not ready` };
  const client = db.prepare('SELECT blog_enabled, blog_publish_target FROM crm_clients WHERE id = ?').get(run.client_id);
  if (!client?.blog_enabled) return { status: 403, error: 'Blog is switched off for this client' };

  db.prepare("UPDATE blog_agent_runs SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(actor?.email || null, run.id);
  let published = null;
  let note = null;
  try {
    if (client.blog_publish_target === 'hyphening_webhook') published = publishToHypheningBlog(run);
    else if (client.blog_publish_target === 'cms_api') published = await publishToWordPress(run);
    if (!published) {
      note = {
        cms_api: 'Approved. This CMS has no automatic publishing yet: Q publishes it per SOPs/Publish adapter - site CMS API.',
        repo_file: 'Approved. Q commits it to the site repo and deploys per SOPs/Publish adapter - repo file.',
        handoff: 'Approved. Download the post and send it to the client.',
      }[client.blog_publish_target];
    }
  } catch (err) {
    // Approval stands; publishing can be retried from the Blog tab.
    db.prepare("UPDATE blog_agent_runs SET error = ?, updated_at = datetime('now') WHERE id = ?").run(`Publish failed: ${err.message}`.slice(0, 1000), run.id);
    logAction({ actorId: actor?.id, actorEmail: actor?.email, action: 'blog_run_publish_failed', entityType: 'blog_run', entityId: run.id, diff: { error: err.message } });
    return { status: 502, error: `Approved, but publishing failed: ${err.message}`, run: serializeRun(getRunRow(run.id)) };
  }

  if (published) {
    db.prepare("UPDATE blog_agent_runs SET status = 'published', blog_post_id = ?, published_url = ?, published_at = datetime('now'), error = NULL, updated_at = datetime('now') WHERE id = ?")
      .run(published.blog_post_id || null, published.published_url || null, run.id);
    if (run.topic_id) db.prepare("UPDATE blog_topics SET status = 'published', updated_at = datetime('now') WHERE id = ?").run(run.topic_id);
  }
  logAction({ actorId: actor?.id, actorEmail: actor?.email, action: published ? 'blog_run_published' : 'blog_run_approved', entityType: 'blog_run', entityId: run.id, diff: { target: client.blog_publish_target, url: published?.published_url || null } });
  return { status: 200, run: serializeRun(getRunRow(run.id)), note };
}

/** Retry publishing an approved post whose publish step failed. */
export async function retryPublish(id, actor) {
  const run = getRunRow(id);
  if (!run || run.status !== 'approved') return { status: 409, error: 'Only approved, unpublished posts can be retried' };
  db.prepare("UPDATE blog_agent_runs SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(run.id);
  return approveBlogRun(id, actor);
}

/** Every ready post that passes its bar, for clients on morning-batch approval. */
export async function approveAllReady(actor) {
  const ids = db.prepare(`
    SELECT r.id FROM blog_agent_runs r JOIN crm_clients c ON c.id = r.client_id
    WHERE r.status = 'ready' AND c.blog_publish_mode = 'approve_batch'
      AND r.quality_score IS NOT NULL AND r.quality_score >= r.quality_bar
    ORDER BY r.id
  `).all().map((r) => r.id);
  const results = [];
  for (const id of ids) {
    const r = await approveBlogRun(id, actor);
    results.push({ id, ok: r.status === 200, error: r.error || null });
  }
  return results;
}

export function rejectBlogRun(id, reason, actor, { by = '007' } = {}) {
  const run = getRunRow(id);
  if (!run) return { status: 404, error: 'Blog run not found' };
  if (!['ready', 'client_review'].includes(run.status)) return { status: 409, error: `Run is ${run.status}` };
  const text = String(reason || '').trim();
  if (!text) return { status: 400, error: 'Say what to change, so the redraft can fix it' };
  db.prepare("UPDATE blog_agent_runs SET status = 'rejected', reject_reason = ?, updated_at = datetime('now') WHERE id = ?").run(`${by}: ${text}`.slice(0, 2000), run.id);
  // Back in the queue: the next night redrafts it with this reason in the prompt.
  if (run.topic_id) db.prepare("UPDATE blog_topics SET status = 'planned', updated_at = datetime('now') WHERE id = ?").run(run.topic_id);
  logAction({ actorId: actor?.id, actorEmail: actor?.email, action: 'blog_run_rejected', entityType: 'blog_run', entityId: run.id, diff: { by, reason: text } });
  return { status: 200, run: serializeRun(getRunRow(run.id)) };
}

/** The client (or their clinician) approves a post in their portal; it then goes to 007. */
export function clientApproveBlogRun(id, clientId, note) {
  const run = getRunRow(id);
  if (!run || run.client_id !== clientId) return { status: 404, error: 'Post not found' };
  if (run.status !== 'client_review') return { status: 409, error: 'This post is not waiting for your review' };
  db.prepare("UPDATE blog_agent_runs SET status = 'ready', client_review_note = ?, client_reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(note ? String(note).slice(0, 2000) : null, run.id);
  return { status: 200 };
}

/**
 * 007 sends a ready post to the client (or their clinician) from the Blog
 * Monitor. Portal only: it appears under "Posts to review" in their portal;
 * nothing is emailed. Their approval brings it back to 'ready' for 007.
 */
export function sendBlogRunToClient(id, actor) {
  const run = getRunRow(id);
  if (!run) return { status: 404, error: 'Blog run not found' };
  if (run.status !== 'ready') return { status: 409, error: `Run is ${run.status}, not ready` };
  const client = db.prepare('SELECT portal_token FROM crm_clients WHERE id = ?').get(run.client_id);
  if (!client?.portal_token) return { status: 409, error: 'This client has no portal link yet. Generate one in the Clients tab first.' };
  db.prepare("UPDATE blog_agent_runs SET status = 'client_review', client_review_note = NULL, updated_at = datetime('now') WHERE id = ?").run(run.id);
  logAction({ actorId: actor?.id, actorEmail: actor?.email, action: 'blog_run_sent_to_client', entityType: 'blog_run', entityId: run.id, diff: {} });
  return { status: 200, run: serializeRun(getRunRow(run.id)) };
}

// ------------------------------------------------- the OpenMausBot team's side
// Called through the signed webhook by scripts/blog-runs.mjs, the bots' tool.

const AGENT_STATUSES = ['queued', 'running', 'client_review', 'ready', 'approved', 'published', 'rejected', 'failed'];

/** Short list for the bots: no post bodies. */
export function listBlogRunsForAgents(statuses = ['ready', 'failed', 'client_review', 'running', 'queued'], sinceHours = 72) {
  const wanted = statuses.filter((s) => AGENT_STATUSES.includes(s));
  if (wanted.length === 0) return [];
  return db.prepare(`
    SELECT r.id, r.status, r.client_id, c.name AS client_name, t.topic, r.title, r.quality_score, r.quality_bar,
           r.blockers, r.error, r.audio_url, r.agent_recommendation, r.reject_reason, r.client_review_note, r.finished_at
    FROM blog_agent_runs r JOIN crm_clients c ON c.id = r.client_id LEFT JOIN blog_topics t ON t.id = r.topic_id
    WHERE r.status IN (${wanted.map(() => '?').join(',')}) AND r.updated_at >= datetime('now', ?)
    ORDER BY r.id
  `).all(...wanted, `-${Math.max(1, Math.min(720, sinceHours))} hours`).map((r) => ({
    ...r, blockers: (() => { try { return JSON.parse(r.blockers || '[]'); } catch { return []; } })(),
  }));
}

/** One draft in full, for Vesper's review. */
export function getBlogRunForAgent(id) {
  const run = serializeRun(getRunRow(id));
  if (!run) return null;
  const { id: runId, status, client_name, publish_target, title, slug, excerpt, content, meta_title, meta_description,
    cover_image_url, cover_alt, audio_url, quality_score, quality_bar, passes_bar, blockers, evidence, agent_recommendation, agent_review } = run;
  return { id: runId, status, client_name, publish_target, title, slug, excerpt, content, meta_title, meta_description,
    cover_image_url, cover_alt, audio_url, quality_score, quality_bar, passes_bar, blockers, evidence, agent_recommendation, agent_review };
}

/** Vesper's recommendation, shown next to the post in the Blog Monitor. Never changes the status. */
export function reviewBlogRun(payload) {
  const run = getRunRow(payload?.run_id);
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  if (!['ready', 'client_review'].includes(run.status)) return { success: false, summary: `Blog run #${run.id} is ${run.status}; only drafts waiting for approval can be reviewed` };
  const rec = String(payload.recommendation || '').replace('-', '_');
  if (!['approve', 'reject', 'needs_007'].includes(rec)) return { success: false, summary: 'recommendation must be approve, reject or needs_007' };
  const note = String(payload.note || '').trim();
  if (!note) return { success: false, summary: 'note is required: say why' };
  db.prepare("UPDATE blog_agent_runs SET agent_recommendation = ?, agent_review = ?, agent_reviewed_by = ?, agent_reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(rec, note.slice(0, 2000), String(payload.by || 'agent').slice(0, 60), run.id);
  return { success: true, summary: `Review stored on blog run #${run.id}: ${rec}` };
}

/** Q puts a failed run's topic straight back in the queue, whatever the Blog switch says (like Draft now). */
export function retryBlogRun(payload) {
  const run = getRunRow(payload?.run_id);
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  if (run.status !== 'failed') return { success: false, summary: `Blog run #${run.id} is ${run.status}, not failed` };
  if (!run.topic_id) return { success: false, summary: `Blog run #${run.id} has no topic to retry` };
  const queued = queueBlogRuns({ clientId: run.client_id, topicId: run.topic_id, requestedBy: payload.by || 'agent retry', force: true });
  if (queued.length === 0) return { success: false, summary: 'Not queued: Blog may be off for this client, posts per month used up, or another run is already in flight today' };
  return { success: true, summary: `Retry queued as blog run #${queued[0].run_id}`, data: { queued } };
}

/** Counts for the health check, the morning brief and the Blog tab badge. */
export function blogRunSummary() {
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM blog_agent_runs GROUP BY status').all().map((r) => [r.status, r.n]));
  const lastNight = db.prepare(`
    SELECT r.id, r.status, r.title, r.quality_score, r.quality_bar, r.error, c.name AS client_name
    FROM blog_agent_runs r JOIN crm_clients c ON c.id = r.client_id
    WHERE r.created_at >= datetime('now', '-24 hours') ORDER BY r.id
  `).all();
  return {
    generated_at: now(),
    automation: getMode('blog'),
    ready: counts.ready || 0,
    client_review: counts.client_review || 0,
    failed_last_24h: lastNight.filter((r) => r.status === 'failed').length,
    running: (counts.running || 0) + (counts.queued || 0),
    approved_unpublished: counts.approved || 0,
    last_24h: lastNight,
  };
}
