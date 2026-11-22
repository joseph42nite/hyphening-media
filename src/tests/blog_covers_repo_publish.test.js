/**
 * Gemini blog covers and publishing approved posts into a client's site repo
 * (blog_publish_target 'repo_file', Dr. Divya's blogs-data.ts).
 *
 * Database work runs inside one transaction rolled back at the end, like
 * blog_runs.test.js. The repo publish runs against a throwaway git repo with
 * a bare origin; the deploy itself is faked (deploy_rsync_static.test.js
 * covers the real one).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import db from '../../database.js';
import * as runs from '../services/blogRuns.js';
import { KNOWN_EVENTS } from '../routes/webhooks.js';
import { coverPrompt, generateCover, imageFromResponse } from '../../scripts/lib/geminiImage.mjs';
import { validateRepoBlog, parsePosts, insertArticle, siteLinks, toArticle, siteDate, addPostToRepo } from '../../scripts/lib/repoBlog.mjs';
import { validateManifest } from '../../scripts/lib/deployManifest.mjs';
import { publishOne } from '../../scripts/blog_publish_worker.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-repo-publish-'));
process.env.BLOG_COVER_DIR = path.join(tmp, 'covers');
process.env.VAULT_DIR = path.join(tmp, 'vault');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000, 7)]);

beforeAll(() => {
  db.exec('BEGIN');
  db.prepare("UPDATE blog_agent_runs SET status = 'failed' WHERE status IN ('queued', 'running')").run();
  db.prepare("UPDATE blog_agent_runs SET publish_state = NULL WHERE publish_state IN ('queued', 'running')").run();
});
afterAll(() => {
  db.exec('ROLLBACK');
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeClient(target = 'repo_file') {
  return db.prepare(`
    INSERT INTO crm_clients (name, client_type, is_active, blog_enabled, blog_posts_per_month, blog_publish_target, blog_review_required, blog_compliance_profile, repo_path)
    VALUES (?, 'marketing', 1, 1, 4, ?, 'none', 'healthcare', ?)
  `).run(`Repo client ${Math.random()}`, target, path.join(tmp, 'site')).lastInsertRowid;
}

/** A run that has been drafted and is ready for 007. */
function readyRun(clientId) {
  const id = db.prepare("INSERT INTO blog_agent_runs (client_id, status, requested_by) VALUES (?, 'running', 'test')").run(clientId).lastInsertRowid;
  runs.submitBlogDraft({
    run_id: id, title: 'Sunscreen basics', slug: 'sunscreen-basics', excerpt: 'Short.', content: '# Sunscreen basics\n\nBody text.',
    tags: ['Sunscreen'], quality_score: 80, blockers: [],
  });
  return id;
}

describe('webhook events', () => {
  it('are known', () => {
    for (const e of ['attach_blog_cover', 'claim_blog_publishes', 'finish_blog_publish']) expect(KNOWN_EVENTS).toContain(e);
  });
});

describe('attach_blog_cover', () => {
  it('stores a PNG where /blog-covers serves it and points the run at it', () => {
    const id = db.prepare("INSERT INTO blog_agent_runs (client_id, status, requested_by) VALUES (?, 'running', 'test')").run(makeClient()).lastInsertRowid;
    const r = runs.attachBlogCover({ run_id: id, image_base64: PNG.toString('base64'), cover_alt: 'A bottle', source: 'gemini:test' });
    expect(r.success).toBe(true);
    expect(r.data.cover_image_url).toBe(`/blog-covers/blog-run-${id}.png`);
    expect(fs.existsSync(path.join(process.env.BLOG_COVER_DIR, `blog-run-${id}.png`))).toBe(true);
    const row = runs.getRunRow(id);
    expect(row.cover_source).toBe('gemini:test');
    expect(row.cover_alt).toBe('A bottle');
  });

  it('refuses anything that is not an image, and finished runs', () => {
    const id = db.prepare("INSERT INTO blog_agent_runs (client_id, status, requested_by) VALUES (?, 'running', 'test')").run(makeClient()).lastInsertRowid;
    expect(runs.attachBlogCover({ run_id: id, image_base64: Buffer.from('<svg>'.repeat(500)).toString('base64') }).success).toBe(false);
    db.prepare("UPDATE blog_agent_runs SET status = 'published' WHERE id = ?").run(id);
    expect(runs.attachBlogCover({ run_id: id, image_base64: PNG.toString('base64') }).success).toBe(false);
  });
});

describe('repo_file publish queue', () => {
  it('approve queues it, the worker claims it, live publishes it', async () => {
    const id = readyRun(makeClient());
    const a = await runs.approveBlogRun(id, { email: 'test@example.com' });
    expect(a.status).toBe(200);
    expect(a.run.status).toBe('approved');
    expect(a.run.publish_state).toBe('queued');
    expect(a.note).toMatch(/site repo/);

    const claimed = runs.claimBlogPublishes('test');
    const job = claimed.find((j) => j.run_id === id);
    expect(job.post.title).toBe('Sunscreen basics');
    expect(job.client.repo_path).toBe(path.join(tmp, 'site'));
    expect(runs.getRunRow(id).publish_state).toBe('running');
    expect(runs.claimBlogPublishes('test').some((j) => j.run_id === id)).toBe(false);

    expect((await runs.retryPublish(id, {})).status).toBe(409);
    expect(runs.finishBlogPublish({ run_id: id, status: 'live', published_url: 'https://site.test/blogs/sunscreen-basics', commit: 'abc' }).success).toBe(true);
    const row = runs.getRunRow(id);
    expect(row.status).toBe('published');
    expect(row.publish_state).toBe('live');
    expect(row.published_url).toBe('https://site.test/blogs/sunscreen-basics');
  });

  it('a failed publish can be retried and goes back in the queue', async () => {
    const id = readyRun(makeClient());
    await runs.approveBlogRun(id, {});
    runs.claimBlogPublishes('test');
    runs.finishBlogPublish({ run_id: id, status: 'failed', error: 'build broke' });
    let row = runs.getRunRow(id);
    expect(row.status).toBe('approved');
    expect(row.publish_state).toBe('failed');
    expect(row.error).toMatch(/build broke/);
    const r = await runs.retryPublish(id, {});
    expect(r.status).toBe(200);
    row = runs.getRunRow(id);
    expect(row.publish_state).toBe('queued');
  });

  it('leaves the Hyphening blog publishing as it was', async () => {
    const id = readyRun(makeClient('hyphening_webhook'));
    const r = await runs.approveBlogRun(id, {});
    expect(r.run.status).toBe('published');
    expect(r.run.publish_state).toBeNull();
  });
});

describe('gemini covers', () => {
  it('wraps the subject in the house rules, stricter for healthcare', () => {
    const general = coverPrompt('A desk with a laptop');
    expect(general).toMatch(/No text/);
    expect(general).not.toMatch(/medical clinic/);
    expect(coverPrompt('Skincare bottles', { healthcare: true })).toMatch(/no patients, no faces/);
  });

  it('reads the image out of a response', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] };
    expect(imageFromResponse(body).buf.equals(PNG)).toBe(true);
    expect(imageFromResponse({ candidates: [] })).toBeNull();
  });

  it('never throws: no key, an HTTP error and a blocked prompt are problems', async () => {
    expect((await generateCover('x', { apiKey: '' })).problem).toMatch(/GEMINI_API_KEY/);
    const err = await generateCover('x', { apiKey: 'k', fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'billing' } }) }) });
    expect(err.problem).toMatch(/403.*billing/);
    const blocked = await generateCover('x', { apiKey: 'k', fetchFn: async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }) });
    expect(blocked.problem).toMatch(/SAFETY/);
  });

  it('sends the key in a header, never the URL', async () => {
    let seen;
    const fetchFn = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: PNG.toString('base64') } }] } }] }) }; };
    const img = await generateCover('x', { apiKey: 'secret-key', model: 'm1', fetchFn });
    expect(img.model).toBe('m1');
    expect(seen.url).not.toMatch(/secret-key/);
    expect(seen.opts.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(seen.opts.body).generationConfig.responseModalities).toEqual(['IMAGE']);
  });
});

const BLOG = {
  type: 'repo_file', format: 'next_blogs_data', file: 'src/lib/blogs-data.ts', array: 'replicatedBlogs',
  covers_dir: 'public/blog-covers', url_prefix: '/blogs/', site_url: 'https://www.site.test', author: 'Dr. Test, MD',
};
const FILE = `import type { BlogArticle } from "./cms-store";

export const replicatedBlogs: BlogArticle[] = [
  {
    "id": "blog-1",
    "title": "Old \\"quoted\\" post",
    "slug": "old-post",
    "excerpt": "x",
    "singleImage": "https://www.site.test/a.jpg",
    "published": true
  }
];
`;

describe('repo blog format', () => {
  it('validates the manifest section', () => {
    expect(validateRepoBlog(BLOG)).toEqual([]);
    expect(validateRepoBlog({ ...BLOG, file: '../x', site_url: 'https://x.test/' }).length).toBe(2);
    const m = { client_id: 1, branch: 'main', deploy: { type: 'git_push' }, health_check: ['https://x.test/'], blog: { type: 'repo_file' } };
    expect(validateManifest(m).join(' ')).toMatch(/blog.format/);
  });

  it('reads the posts already there', () => {
    expect(parsePosts(FILE, BLOG)).toEqual([{ title: 'Old "quoted" post', slug: 'old-post', url: 'https://www.site.test/blogs/old-post', cover: 'https://www.site.test/a.jpg' }]);
  });

  it('puts a new post first and keeps the file valid', () => {
    const out = insertArticle(FILE, BLOG, { id: 'n', title: 'New', slug: 'new' });
    expect(out.indexOf('"slug": "new"')).toBeLessThan(out.indexOf('"slug": "old-post"'));
    const arr = JSON.parse(out.slice(out.indexOf('= [') + 2, out.lastIndexOf(']') + 1));
    expect(arr.map((a) => a.slug)).toEqual(['new', 'old-post']);
    const empty = insertArticle('export const replicatedBlogs: BlogArticle[] = [];\n', BLOG, { id: 'n' });
    expect(JSON.parse(empty.slice(empty.indexOf('= [') + 2, empty.lastIndexOf(']') + 1))).toEqual([{ id: 'n' }]);
    expect(() => insertArticle('const other = [];', BLOG, {})).toThrow(/replicatedBlogs/);
  });

  it('keeps only links on the client site, root-relative', () => {
    expect(siteLinks([
      { url: 'https://site.test/acne?x=1', anchor: 'Acne' }, { url: '/book', anchor: 'Book' },
      { url: 'https://other.test/a', anchor: 'Other' }, { url: '/book', anchor: 'Dup' }, { anchor: 'no url' },
    ], BLOG.site_url)).toEqual([{ title: 'Acne', href: '/acne?x=1' }, { title: 'Book', href: '/book' }]);
  });

  it('turns a draft into the site\'s article: HTML body without the draft\'s H1', () => {
    const a = toArticle(7, { title: 'T', content: '# T\n\nHello **there**.', tags: [], category: 'Hair' }, BLOG, { image: '/blog-covers/t.jpg', slug: 't', date: new Date('2026-11-22T20:00:00Z') });
    expect(a.content).not.toMatch(/<h1/);
    expect(a.content).toMatch(/<strong>there<\/strong>/);
    expect(a).toMatchObject({ id: 'blog-run-7', slug: 't', author: 'Dr. Test, MD', singleImage: '/blog-covers/t.jpg', date: 'Nov 23, 2026', tags: ['Hair'], published: true });
    expect(siteDate(new Date('2026-01-05T00:00:00Z'))).toBe('Jan 05, 2026');
  });
});

describe('blog publish worker', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const remote = path.join(tmp, 'origin.git');
  const repo = path.join(tmp, 'site');

  beforeAll(() => {
    git(tmp, 'init', '--quiet', '--bare', '-b', 'main', remote);
    git(tmp, 'clone', '--quiet', remote, repo);
    git(repo, 'config', 'user.email', 't@t.test');
    git(repo, 'config', 'user.name', 'T');
    fs.mkdirSync(path.join(repo, 'src/lib'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src/lib/blogs-data.ts'), FILE);
    fs.writeFileSync(path.join(repo, 'hyphening.deploy.json'), JSON.stringify({
      client_id: 1, branch: 'main', deploy: { type: 'git_push' }, health_check: ['https://www.site.test/'], blog: BLOG,
    }));
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'init');
    git(repo, 'push', '--quiet', 'origin', 'main');
  });

  const job = (cover_image_url) => ({
    run_id: 42, client: { name: 'Site', repo_path: repo },
    post: { title: 'Sunscreen basics', slug: 'old-post', content: '# Sunscreen basics\n\nBody.', tags: ['Sun'], cover_image_url, internal_links: [] },
  });

  it('commits the post and its cover on a branch, deploys it and reports it live', async () => {
    const calls = [];
    let deployed;
    const r = await publishOne(job('/blog-covers/blog-run-42.jpg'), {
      hookFn: async (e, p) => { calls.push([e, p]); return {}; },
      fetchFn: async () => ({ ok: true, headers: new Map([['content-type', 'image/jpeg']]), arrayBuffer: async () => Buffer.alloc(3000, 2) }),
      deploy: async (j, { hookFn, health }) => {
        deployed = j;
        const checked = [];
        await health(['https://www.site.test/']).then(() => {}, () => {});
        await hookFn('finish_seo_deploy', { batch_id: j.batch_id, status: 'live', live_commit: j.commits[0].commit_sha, log: 'ok' });
        return { checked };
      },
      health: async (urls) => { expect(urls).toContain('https://www.site.test/blogs/old-post-2'); return { ok: true }; },
    });

    expect(r.status).toBe('live');
    // The slug was taken, so the post got -2.
    expect(r.published_url).toBe('https://www.site.test/blogs/old-post-2');
    expect(deployed.branch).toBe('blog/run-42');
    const sha = deployed.commits[0].commit_sha;
    const files = git(repo, 'show', '--name-only', '--format=', sha).split('\n').sort();
    expect(files).toEqual(['public/blog-covers/old-post-2.jpg', 'src/lib/blogs-data.ts']);
    const data = git(repo, 'show', `${sha}:src/lib/blogs-data.ts`);
    expect(data).toMatch(/"singleImage": "\/blog-covers\/old-post-2.jpg"/);
    expect(calls.at(-1)).toEqual(['finish_blog_publish', expect.objectContaining({ run_id: 42, status: 'live', published_url: r.published_url })]);
    // The repo's own working folder is untouched.
    expect(fs.readFileSync(path.join(repo, 'src/lib/blogs-data.ts'), 'utf8')).toBe(FILE);
  });

  it('reports a failed deploy in blog words', async () => {
    const calls = [];
    const r = await publishOne(job('https://images.unsplash.com/photo-1?w=1200'), {
      hookFn: async (e, p) => { calls.push([e, p]); return {}; },
      deploy: async (j, { hookFn }) => hookFn('finish_seo_deploy', { status: 'deploy_failed', error: 'fix #42 (blog post) clashes with newer changes on main. Discard, then press "Fix tonight"' }),
    });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/Retry publish/);
    expect(r.error).not.toMatch(/Fix tonight/);
  });

  it('fails cleanly without a blog section', async () => {
    const bare = path.join(tmp, 'bare-site');
    git(tmp, 'clone', '--quiet', remote, bare);
    fs.writeFileSync(path.join(bare, 'hyphening.deploy.json'), JSON.stringify({ client_id: 1, branch: 'main', deploy: { type: 'git_push' }, health_check: ['https://x.test/'] }));
    const r = await publishOne({ ...job(null), client: { name: 'S', repo_path: bare } }, { hookFn: async () => ({}) });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/no "blog"/);
  });
});
