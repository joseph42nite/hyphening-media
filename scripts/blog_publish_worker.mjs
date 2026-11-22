#!/usr/bin/env node
/**
 * Blog publish worker: puts posts 007 approved into a client site whose blog
 * lives in its code repo (blog_publish_target 'repo_file', e.g. Dr. Divya's
 * src/lib/blogs-data.ts), then deploys the site. A plain script, no AI.
 *
 *   1. claim_blog_publishes: the approved repo posts waiting to go out.
 *   2. A fresh worktree at origin/<branch> on a blog/run-<id> branch; the
 *      post goes in per the manifest's "blog" section (scripts/lib/repoBlog.mjs),
 *      with its cover copied into the repo when the cover is one we generated.
 *   3. One commit, then the Deploy button's own path (deploy_worker.mjs
 *      deployBatch): the server must be at origin/<branch>, checks, push,
 *      deploy, health check (the site's URLs plus the new post's), rollback
 *      on failure.
 *   4. finish_blog_publish: live → the run is published with its URL;
 *      anything else → failed, with Retry publish in the Blog tab.
 *
 * The Mac connector starts it when 007 approves a repo post, and on its sweep.
 *
 *   node scripts/blog_publish_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { hook, API } from './lib/hook.mjs';
import { git, healthCheck } from './lib/proc.mjs';
import { loadManifest } from './lib/deployManifest.mjs';
import { addPostToRepo } from './lib/repoBlog.mjs';
import { deployBatch } from './deploy_worker.mjs';

const WORKER = os.hostname();

/** The cover's bytes when it is one we host (/blog-covers/...); null for an outside URL. */
async function fetchCover(url, fetchFn = fetch) {
  if (!url || !url.startsWith('/')) return null;
  const res = await fetchFn(`${API}${url}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`cover ${url} returned HTTP ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), mime: (res.headers.get('content-type') || 'image/jpeg').split(';')[0] };
}

/** The deploy's clash message is written for SEO fixes; say it for a post. */
function blogWording(error) {
  if (!error) return error;
  if (/clashes with newer changes/.test(error)) return 'the post clashes with newer changes on the site repo. Nothing was pushed. Press Retry publish: it adds the post again on the newest code.';
  return error;
}

/**
 * One post. Returns what it reported: { status, published_url?, error? }.
 * `deps` lets the tests swap the network, the deploy and the hook.
 */
export async function publishOne(job, { hookFn = hook, deploy = deployBatch, health = healthCheck, fetchFn = fetch } = {}) {
  const report = (status, extra = {}) => hookFn('finish_blog_publish', { run_id: job.run_id, status, ...extra }).then(() => ({ status, ...extra }));

  const repo = job.client?.repo_path;
  if (!repo || !existsSync(path.join(repo, '.git'))) return report('failed', { error: `site repo ${repo || '(none)'} not found on this Mac` });
  const { manifest, errors } = await loadManifest(repo);
  if (errors.length) return report('failed', { error: `manifest: ${errors.join('; ')}` });
  const blog = manifest.blog;
  if (blog?.type !== 'repo_file') return report('failed', { error: `${repo}/hyphening.deploy.json has no "blog": { "type": "repo_file", ... } section` });

  let cover = null;
  try { cover = await fetchCover(job.post.cover_image_url, fetchFn); } catch (err) { return report('failed', { error: err.message }); }

  const target = manifest.branch;
  const branch = `blog/run-${job.run_id}`;
  await git(repo, ['fetch', '--quiet', 'origin', target]);
  const base = await git(repo, ['rev-parse', `origin/${target}`]);

  const wt = await mkdtemp(path.join(os.tmpdir(), 'blog-publish-'));
  let commit;
  let added;
  try {
    await git(repo, ['worktree', 'add', '--quiet', '-B', branch, wt, base]);
    added = await addPostToRepo(wt, blog, job.run_id, job.post, { cover });
    await git(wt, ['add', '--', ...added.files]);
    await git(wt, ['commit', '--quiet', '-m', `Blog: ${job.post.title}\n\nBlog run #${job.run_id}, approved in the Blog Monitor.`]);
    commit = await git(wt, ['rev-parse', 'HEAD']);
  } catch (err) {
    return report('failed', { error: `could not add the post to the repo: ${err.message}` });
  } finally {
    await git(repo, ['worktree', 'remove', '--force', wt], { allowFail: true });
    await rm(wt, { recursive: true, force: true });
  }

  let result = null;
  const relay = async (event, p) => {
    if (event !== 'finish_seo_deploy') return hookFn(event, p);
    result = p;
    return { success: true };
  };
  await deploy(
    { batch_id: job.run_id, client: { name: job.client.name, repo_path: repo }, commits: [{ commit_sha: commit, rec_id: job.run_id, metric: 'blog post' }], branch, base_commit: base },
    { hookFn: relay, health: (urls) => health([...urls, added.url]) },
  );

  if (result?.status === 'live') return report('live', { published_url: added.url, commit: result.live_commit || commit, log: result.log });
  return report('failed', {
    error: blogWording(result?.error) || `deploy ${result?.status || 'did not report'}`,
    log: result?.log,
  });
}

async function main() {
  const res = await hook('claim_blog_publishes', { worker: WORKER });
  const jobs = res?.data?.publishes || [];
  if (jobs.length === 0) return console.log('[blog-publish] Nothing to publish.');
  for (const job of jobs) {
    try {
      const r = await publishOne(job);
      console.log(`[blog-publish] #${job.run_id} ${job.client?.name}: ${r.status}${r.published_url ? ` ${r.published_url}` : ''}${r.error ? ` (${r.error})` : ''}`);
    } catch (err) {
      console.error(`[blog-publish] #${job.run_id}: ${err.message}`);
      await hook('finish_blog_publish', { run_id: job.run_id, status: 'failed', error: err.message.slice(0, 800) }).catch(() => {});
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[blog-publish] Fatal:', err); process.exit(1); });
}
