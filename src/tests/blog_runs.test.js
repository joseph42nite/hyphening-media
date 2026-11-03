import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import db from '../../database.js';
import * as runs from '../services/blogRuns.js';
import { setMode, getMode } from '../services/automationMode.js';
import { markdownToHtml } from '../services/markdown.js';
import blogRunsRouter from '../routes/blogRuns.js';

// These tests queue, draft, approve and publish. Everything runs inside one
// transaction that's rolled back at the end, so the local database the
// dashboard reads is left exactly as it was (the services' own transactions
// nest as savepoints). Audio goes to a temp folder.
let savedMode;
beforeAll(() => {
  process.env.AUDIO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-runs-audio-'));
  savedMode = getMode('blog');
  db.exec('BEGIN');
  // Claims take the oldest queued run in the whole database; park any real
  // ones (inside the rolled-back transaction) so only this file's runs count.
  db.prepare("UPDATE blog_agent_runs SET status = 'failed' WHERE status IN ('queued', 'running')").run();
});
afterAll(() => {
  db.exec('ROLLBACK');
  setMode('blog', savedMode);
});

let clientId;

function makeClient(overrides = {}) {
  const res = db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, blog_enabled, blog_posts_per_month, blog_publish_target, blog_review_required, blog_compliance_profile)
    VALUES (?, 'marketing', 1, 1, ?, ?, ?, ?)
  `).run(overrides.name || `Test client ${Date.now()}${Math.random()}`, overrides.ppm ?? 4, overrides.target || 'hyphening_webhook',
    overrides.review || 'none', overrides.profile || 'general');
  return res.lastInsertRowid;
}

const draft = (run_id, extra = {}) => ({
  run_id, title: 'A test post', slug: 'a-test-post', excerpt: 'Short.', content: '# A test post\n\nBody text.\n\n## FAQ\n\nQ?\n\nA.',
  meta_title: 'A test post', meta_description: 'About testing.', tags: ['test'], quality_score: 75, blockers: [], ...extra,
});

beforeAll(() => {
  clientId = makeClient();
  runs.addBlogTopics(clientId, [{ topic: 'First topic' }, { topic: 'Second topic', planned_for: '2026-01-01' }]);
});

describe('router', () => {
  it('authenticates every route', () => {
    expect(blogRunsRouter.stack.map(l => l.name)).toContain('authenticate');
  });
});

describe('queueing', () => {
  it('does nothing while the Blog fleet is on manual, unless forced', () => {
    setMode('blog', 'manual');
    expect(runs.queueBlogRuns({ clientId })).toEqual([]);
  });

  it('queues one run per client per night, dated topics first', () => {
    setMode('blog', 'auto');
    const q = runs.queueBlogRuns({ clientId });
    expect(q).toHaveLength(1);
    const topic = db.prepare('SELECT topic, status FROM blog_topics WHERE id = ?').get(q[0].topic_id);
    expect(topic).toEqual({ topic: 'Second topic', status: 'queued' });
    expect(runs.queueBlogRuns({ clientId })).toEqual([]);
  });

  it('respects posts per month', () => {
    const capped = makeClient({ ppm: 0 });
    runs.addBlogTopics(capped, [{ topic: 'x' }]);
    expect(runs.queueBlogRuns({ clientId: capped, force: true })).toEqual([]);
  });
});

describe('a run from claim to published', () => {
  it('claims with the client config and stores the draft as ready', () => {
    const [job] = runs.claimBlogRuns('test', 1);
    expect(job.config.client.id).toBe(clientId);
    expect(job.topic.topic).toBe('Second topic');
    expect(runs.submitBlogDraft(draft(job.run_id)).success).toBe(true);
    const run = runs.serializeRun(runs.getRunRow(job.run_id));
    expect(run.status).toBe('ready');
    expect(run.quality_bar).toBe(71);
    expect(run.passes_bar).toBe(true);
  });

  it('publishes to Hyphening\'s own blog on approve', async () => {
    const id = db.prepare("SELECT id FROM blog_agent_runs WHERE status = 'ready' AND client_id = ?").get(clientId).id;
    const r = await runs.approveBlogRun(id, { id: 1, email: 'test@example.com' });
    expect(r.status).toBe(200);
    expect(r.run.status).toBe('published');
    const post = db.prepare('SELECT status, title FROM blog_posts WHERE id = ?').get(r.run.blog_post_id);
    expect(post).toEqual({ status: 'published', title: 'A test post' });
    expect(db.prepare('SELECT status FROM blog_topics WHERE id = ?').get(r.run.topic_id).status).toBe('published');
  });

  it('won\'t approve twice', async () => {
    const id = db.prepare("SELECT id FROM blog_agent_runs WHERE status = 'published' AND client_id = ?").get(clientId).id;
    expect((await runs.approveBlogRun(id, null)).status).toBe(409);
  });
});

describe('review, rejection and failure', () => {
  it('sends a post to the client first when review is required, then to 007', () => {
    const c = makeClient({ review: 'clinician', profile: 'healthcare' });
    runs.addBlogTopics(c, [{ topic: 'Clinic topic' }]);
    const [q] = runs.queueBlogRuns({ clientId: c, force: true });
    runs.claimBlogRuns('test', 1);
    runs.submitBlogDraft(draft(q.run_id, { quality_score: 75 }));
    const run = runs.serializeRun(runs.getRunRow(q.run_id));
    expect(run.status).toBe('client_review');
    expect(run.quality_bar).toBe(80);
    expect(run.passes_bar).toBe(false);
    expect(runs.clientApproveBlogRun(q.run_id, c + 1, 'ok').status).toBe(404);
    expect(runs.clientApproveBlogRun(q.run_id, c, 'Looks right').status).toBe(200);
    expect(runs.getRunRow(q.run_id).status).toBe('ready');
  });

  it('a rejection needs a reason and puts the topic back with it', () => {
    const c = makeClient();
    runs.addBlogTopics(c, [{ topic: 'Redo me' }]);
    const [q] = runs.queueBlogRuns({ clientId: c, force: true });
    runs.claimBlogRuns('test', 1);
    runs.submitBlogDraft(draft(q.run_id));
    expect(runs.rejectBlogRun(q.run_id, '', null).status).toBe(400);
    expect(runs.rejectBlogRun(q.run_id, 'Too generic', null).status).toBe(200);
    expect(db.prepare('SELECT status FROM blog_topics WHERE id = ?').get(q.topic_id).status).toBe('planned');
    db.prepare("UPDATE blog_agent_runs SET created_at = datetime('now', '-2 days') WHERE id = ?").run(q.run_id);
    const [again] = runs.queueBlogRuns({ clientId: c, force: true });
    const [job] = runs.claimBlogRuns('test', 1);
    expect(job.run_id).toBe(again.run_id);
    expect(job.previous_rejections).toEqual(['007: Too generic']);
  });

  it('a failed run frees its topic for the next night', () => {
    const c = makeClient();
    runs.addBlogTopics(c, [{ topic: 'Fails once' }]);
    const [q] = runs.queueBlogRuns({ clientId: c, force: true });
    expect(runs.failBlogRun({ run_id: q.run_id, error: 'health check BLOCKED' }).success).toBe(true);
    expect(db.prepare('SELECT status FROM blog_topics WHERE id = ?').get(q.topic_id).status).toBe('planned');
  });

  it('handoff targets stop at approved with a note', async () => {
    const c = makeClient({ target: 'handoff' });
    runs.addBlogTopics(c, [{ topic: 'Send it' }]);
    const [q] = runs.queueBlogRuns({ clientId: c, force: true });
    runs.claimBlogRuns('test', 1);
    runs.submitBlogDraft(draft(q.run_id));
    const r = await runs.approveBlogRun(q.run_id, null);
    expect(r.run.status).toBe('approved');
    expect(r.note).toMatch(/Download/);
  });
});

describe('audio and markdown', () => {
  it('only accepts an mp3', () => {
    const c = makeClient();
    runs.addBlogTopics(c, [{ topic: 'Narrated' }]);
    const [q] = runs.queueBlogRuns({ clientId: c, force: true });
    runs.claimBlogRuns('test', 1);
    expect(runs.attachBlogAudio({ run_id: q.run_id, mp3_base64: Buffer.from('<html>').toString('base64') }).success).toBe(false);
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2048)]);
    expect(runs.attachBlogAudio({ run_id: q.run_id, mp3_base64: mp3.toString('base64') }).success).toBe(true);
    expect(runs.getRunRow(q.run_id).audio_url).toBe(`/audio/blog-run-${q.run_id}.mp3`);
  });

  it('escapes model output instead of passing markup through', () => {
    const html = markdownToHtml('# Hi\n\n<img src=x onerror=alert(1)> and [x](javascript:alert(1))');
    expect(html).not.toMatch(/<img src=x|javascript:/);
    expect(html).toMatch(/<h1>Hi<\/h1>/);
  });

  it('summarises for the health check', () => {
    const s = runs.blogRunSummary();
    expect(s).toHaveProperty('ready');
    expect(s).toHaveProperty('failed_last_24h');
  });
});
