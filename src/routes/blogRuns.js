/**
 * The night blog pipeline's admin side, mounted at /api/blog-runs: the
 * "Ready to approve" list, Approve / Reject / Approve all, each client's topic
 * queue, and a summary the health check and morning brief read.
 * Logic lives in src/services/blogRuns.js.
 */

import { Router } from 'express';
import db from '../../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../services/auditLogger.js';
import { pushRunSignal } from '../services/macConnector.js';
import { markdownToHtml } from '../services/markdown.js';
import {
  getRunRow, serializeRun, queueBlogRuns, approveBlogRun, approveAllReady, retryPublish,
  rejectBlogRun, addBlogTopics, blogRunSummary, sendBlogRunToClient, blogOutlook,
} from '../services/blogRuns.js';
import { refreshKeywords, approveKeyword, rejectKeyword, nicheKeywords } from '../services/keywordPlan.js';

const router = Router();
router.use(authenticate);

const STATUSES = ['queued', 'running', 'client_review', 'ready', 'approved', 'published', 'rejected', 'failed'];

/** GET /api/blog-runs/summary — counts for the health check and the morning brief. */
router.get('/summary', authorize('admin', 'api_readonly'), (req, res) => {
  try {
    res.json(blogRunSummary());
  } catch (err) {
    console.error('[BLOG RUNS] Summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/blog-runs/outlook — each Blog-on client's next topic and whether tonight drafts it. */
router.get('/outlook', authorize('admin'), (req, res) => {
  try {
    res.json({ clients: blogOutlook() });
  } catch (err) {
    console.error('[BLOG RUNS] Outlook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/blog-runs?status=ready,failed&client_id=10 — newest first, last 60. */
router.get('/', authorize('admin'), (req, res) => {
  try {
    const statuses = String(req.query.status || 'queued,running,client_review,ready,approved,failed')
      .split(',').filter((s) => STATUSES.includes(s));
    if (statuses.length === 0) return res.status(400).json({ error: `status must be among: ${STATUSES.join(', ')}` });
    const clientId = parseInt(req.query.client_id, 10);
    const rows = db.prepare(`
      SELECT * FROM blog_agent_runs
      WHERE status IN (${statuses.map(() => '?').join(',')}) ${clientId ? 'AND client_id = ?' : ''}
      ORDER BY id DESC LIMIT 60
    `).all(...statuses, ...(clientId ? [clientId] : []));
    res.json({ runs: rows.map(serializeRun) });
  } catch (err) {
    console.error('[BLOG RUNS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/blog-runs/queue — { client_id } "Draft now": queue the client's
 * next topic straight away, whatever the Blog switch says, and wake the Mac.
 */
router.post('/queue', authorize('admin'), (req, res) => {
  try {
    const clientId = parseInt(req.body?.client_id, 10);
    if (!clientId) return res.status(400).json({ error: 'client_id is required' });
    const queued = queueBlogRuns({ clientId, requestedBy: req.user.email, force: true });
    if (queued.length === 0) {
      return res.status(409).json({ error: 'Nothing queued: check Blog is on, posts per month is above 0 and not used up, nothing is already running today, and a topic is planned.' });
    }
    const delivered = pushRunSignal('blog');
    logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'blog_run_queued', entityType: 'blog_run', entityId: queued[0].run_id, diff: { client_id: clientId } });
    res.json({ queued, connector_online: delivered });
  } catch (err) {
    console.error('[BLOG RUNS] Queue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/blog-runs/approve-all — every ready post that passes its bar, morning-batch clients only. */
router.post('/approve-all', authorize('admin'), async (req, res) => {
  try {
    const results = await approveAllReady(req.user);
    res.json({ results });
  } catch (err) {
    console.error('[BLOG RUNS] Approve-all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------- topic queue

/** GET /api/blog-runs/topics?client_id=10 */
router.get('/topics', authorize('admin'), (req, res) => {
  const clientId = parseInt(req.query.client_id, 10);
  if (!clientId) return res.status(400).json({ error: 'client_id is required' });
  const topics = db.prepare(`
    SELECT * FROM blog_topics WHERE client_id = ?
    ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'planned' THEN 1 WHEN 'drafted' THEN 2 ELSE 3 END,
             planned_for IS NULL, planned_for, id
  `).all(clientId);
  res.json({ topics });
});

/** POST /api/blog-runs/topics — { client_id, topics: [{ topic, target_keyword?, planned_for?, notes? }] } */
router.post('/topics', authorize('admin'), (req, res) => {
  try {
    const result = addBlogTopics(parseInt(req.body?.client_id, 10), req.body?.topics, req.user.email);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ ids: result.ids });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** PATCH /api/blog-runs/topics/:id — { status: 'planned' | 'skipped', planned_for? } */
router.patch('/topics/:id', authorize('admin'), (req, res) => {
  const topic = db.prepare('SELECT * FROM blog_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  const status = req.body?.status ?? topic.status;
  if (!['planned', 'skipped'].includes(status) || !['planned', 'skipped'].includes(topic.status)) {
    return res.status(409).json({ error: 'Only planned or skipped topics can be changed here' });
  }
  const planned = req.body?.planned_for === undefined ? topic.planned_for
    : (/^\d{4}-\d{2}-\d{2}$/.test(req.body.planned_for || '') ? req.body.planned_for : null);
  db.prepare("UPDATE blog_topics SET status = ?, planned_for = ?, updated_at = datetime('now') WHERE id = ?").run(status, planned, topic.id);
  res.json({ topic: db.prepare('SELECT * FROM blog_topics WHERE id = ?').get(topic.id) });
});

/** DELETE /api/blog-runs/topics/:id — only topics nothing has been drafted from. */
router.delete('/topics/:id', authorize('admin'), (req, res) => {
  const result = db.prepare("DELETE FROM blog_topics WHERE id = ? AND status IN ('planned', 'skipped')").run(req.params.id);
  if (result.changes === 0) return res.status(409).json({ error: 'Only planned or skipped topics can be deleted' });
  res.json({ success: true });
});

// ---------------------------------------------------------------- keywords
// Every blog topic starts here: src/services/keywordPlan.js.

/**
 * GET /api/blog-runs/keywords?client_id= — candidates and approved keywords,
 * the onboarding niche keywords used as seeds, and the auto-approve setting.
 */
router.get('/keywords', authorize('admin'), (req, res) => {
  const clientId = parseInt(req.query.client_id, 10);
  if (!clientId) return res.status(400).json({ error: 'client_id is required' });
  const keywords = db.prepare(`
    SELECT * FROM seo_keywords WHERE client_id = ? AND status <> 'rejected'
    ORDER BY status = 'candidate', score DESC
  `).all(clientId);
  const client = db.prepare('SELECT brand_niche_keywords, keywords_auto_approve FROM crm_clients WHERE id = ?').get(clientId);
  res.json({ keywords, seeds: nicheKeywords(client?.brand_niche_keywords), auto_approve: client?.keywords_auto_approve || 0 });
});

/** PUT /api/blog-runs/keywords/settings — { client_id, auto_approve } keywords a month that become topics on their own. */
router.put('/keywords/settings', authorize('admin'), (req, res) => {
  const n = parseInt(req.body?.auto_approve, 10);
  if (!(n >= 0 && n <= 10)) return res.status(400).json({ error: 'auto_approve must be 0-10' });
  const changed = db.prepare('UPDATE crm_clients SET keywords_auto_approve = ? WHERE id = ?').run(n, parseInt(req.body?.client_id, 10)).changes;
  if (!changed) return res.status(404).json({ error: 'Client not found' });
  logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'update', entityType: 'keywords_auto_approve', entityId: req.body.client_id, diff: { auto_approve: n }, ip: req.ip });
  res.json({ auto_approve: n });
});

/** POST /api/blog-runs/keywords/refresh — { client_id } runs the monthly check now. */
router.post('/keywords/refresh', authorize('admin'), async (req, res) => {
  try {
    const result = await refreshKeywords(parseInt(req.body?.client_id, 10));
    logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'refresh', entityType: 'seo_keywords', diff: result, ip: req.ip });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/blog-runs/keywords/:id/approve — makes it the client's next blog topic. */
router.post('/keywords/:id/approve', authorize('admin'), (req, res) => {
  try {
    const topicId = approveKeyword(parseInt(req.params.id, 10), req.user.email);
    logAction({ actorId: req.user.id, actorEmail: req.user.email, action: 'approve', entityType: 'seo_keyword', entityId: req.params.id, diff: { topic_id: topicId }, ip: req.ip });
    res.json({ topic_id: topicId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/keywords/:id/reject', authorize('admin'), (req, res) => {
  try {
    rejectKeyword(parseInt(req.params.id, 10), req.user.email);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- one run

/** POST /api/blog-runs/:id/approve */
router.post('/:id/approve', authorize('admin'), async (req, res) => {
  try {
    const r = await approveBlogRun(parseInt(req.params.id, 10), req.user);
    res.status(r.status).json(r.status === 200 ? { run: r.run, note: r.note } : { error: r.error, run: r.run });
  } catch (err) {
    console.error('[BLOG RUNS] Approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/blog-runs/:id/retry-publish — an approved post whose publishing failed. */
router.post('/:id/retry-publish', authorize('admin'), async (req, res) => {
  try {
    const r = await retryPublish(parseInt(req.params.id, 10), req.user);
    res.status(r.status).json(r.status === 200 ? { run: r.run, note: r.note } : { error: r.error, run: r.run });
  } catch (err) {
    console.error('[BLOG RUNS] Retry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/blog-runs/:id/send-to-client — into the client's portal for their review (portal only, no email). */
router.post('/:id/send-to-client', authorize('admin'), (req, res) => {
  const r = sendBlogRunToClient(parseInt(req.params.id, 10), req.user);
  res.status(r.status).json(r.status === 200 ? { run: r.run } : { error: r.error });
});

/** POST /api/blog-runs/:id/reject — { reason }. The topic goes back in the queue with the reason. */
router.post('/:id/reject', authorize('admin'), (req, res) => {
  const r = rejectBlogRun(parseInt(req.params.id, 10), req.body?.reason, req.user);
  res.status(r.status).json(r.status === 200 ? { run: r.run } : { error: r.error });
});

/**
 * GET /api/blog-runs/:id/preview — the draft as escaped HTML. The draft is
 * model output, so the Blog tab renders this rather than its own unescaped
 * markdown helper.
 */
router.get('/:id/preview', authorize('admin'), (req, res) => {
  const run = getRunRow(req.params.id);
  if (!run || !run.content) return res.status(404).json({ error: 'Blog run not found' });
  res.json({ html: markdownToHtml(run.content) });
});

/** GET /api/blog-runs/:id/download — the post as one HTML file, for handoff clients. */
router.get('/:id/download', authorize('admin'), (req, res) => {
  const run = getRunRow(req.params.id);
  if (!run || !run.content) return res.status(404).json({ error: 'Blog run not found' });
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const schema = run.schema_json ? `<script type="application/ld+json">${run.schema_json.replace(/</g, '\\u003c')}</script>` : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(run.meta_title || run.title)}</title>
<meta name="description" content="${esc(run.meta_description)}">
<!-- slug: ${esc(run.slug)} · cover: ${esc(run.cover_image_url)} (alt: ${esc(run.cover_alt)}) -->
${schema}
</head><body>
${markdownToHtml(run.content)}
</body></html>
`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${(run.slug || `blog-run-${run.id}`).replace(/[^a-z0-9-]/gi, '')}.html"`);
  res.send(html);
});

export default router;
