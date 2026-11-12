/**
 * The night fix worker and the deploy worker, against throwaway git repos:
 * a bare "origin" and a clone standing in for a client's site repo. Claude,
 * the webhook and the health check are faked; git, the manifest checks and
 * the worktrees are real.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'night-workers-'));
process.env.VAULT_DIR = path.join(tmp, 'vault'); // night report lines go here, not the real vault

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const remote = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'site');

let fixWorker;
let deployWorker;

beforeAll(async () => {
  fs.mkdirSync(process.env.VAULT_DIR);
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', remote]);
  execFileSync('git', ['clone', '--quiet', remote, repo]);
  sh(repo, 'config', 'user.name', 'Test');
  sh(repo, 'config', 'user.email', 'test@example.test');
  fs.writeFileSync(path.join(repo, 'index.html'), '<html><head><title>Old</title></head></html>\n');
  fs.writeFileSync(path.join(repo, 'app.js'), 'console.log("ok");\n');
  // A package the checks need, installed but not committed, like vite in the
  // real repo: a worktree without node_modules can't pass the checks.
  fs.mkdirSync(path.join(repo, 'node_modules', 'leftpad'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'node_modules', 'leftpad', 'index.js'), 'module.exports = (s) => s;\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(repo, 'hyphening.deploy.json'), JSON.stringify({
    client_id: 99, branch: 'main', checks: ['node --check app.js', 'node -e "require(\'leftpad\')"'],
    deploy: { type: 'git_push' }, health_check: ['https://example.test/'], rollback: 'git_revert',
    seo_fixes: { enabled: true, paths: ['index.html', 'app.js'], never_touch: [] },
  }, null, 2));
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '--quiet', '-m', 'site');
  sh(repo, 'push', '--quiet', 'origin', 'main');
  fixWorker = await import('../../scripts/seo_fix_worker.mjs');
  deployWorker = await import('../../scripts/deploy_worker.mjs');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const client = () => ({ id: 99, name: 'Test site', website_url: 'https://example.test/', repo_path: repo, blog_compliance_profile: 'general' });
const candidate = (id, metric) => ({ id, priority: 'High', metric, issue: 'x', action_required: 'y', audit_type: 'technical', fix_approved: 0 });

function fakeHook(calls) {
  return async (event, payload) => { calls.push([event, payload]); return { data: {} }; };
}

// Plays Claude: sorts, then makes one good fix, one outside the allowed files, one that breaks the checks.
async function fakeClaude(prompt, cwd, tools) {
  if (tools === 'Read,Glob,Grep') {
    return { code: 0, out: '<json>[{"id":1,"triage":"safe","reason":"title"},{"id":2,"triage":"safe","reason":"x"},{"id":3,"triage":"safe","reason":"x"},{"id":4,"triage":"needs_007","reason":"copy"}]</json>', err: '' };
  }
  const id = Number(prompt.match(/Recommendation #(\d+)/)[1]);
  if (id === 1) fs.writeFileSync(path.join(cwd, 'index.html'), '<html><head><title>New title</title></head></html>\n');
  if (id === 2) fs.writeFileSync(path.join(cwd, 'secret.txt'), 'nope\n');
  if (id === 3) fs.writeFileSync(path.join(cwd, 'app.js'), 'console.log(;\n');
  return { code: 0, out: `<json>{"changed": true, "summary": "fix ${id}"}</json>`, err: '' };
}

let ready;

// These run real git (init, worktrees, commits, a push to a bare remote), which
// takes over the 5 s default on a slow or external drive. The first test then
// times out and the deploy tests, which use its batch, fail after it.
const GIT_TIMEOUT = { timeout: 30000 };

describe('seo_fix_worker', GIT_TIMEOUT, () => {
  it('commits the good fix on a night branch, throws away the bad ones, and leaves the repo folder alone', async () => {
    const calls = [];
    const job = { batch_id: 7, night: '2026-11-04', client: client(), max_fixes: 8,
      candidates: [candidate(1, 'Title tag'), candidate(2, 'Robots'), candidate(3, 'Schema'), candidate(4, 'Hero copy')] };
    const r = await fixWorker.runBatch(job, { claudeFn: fakeClaude, hookFn: fakeHook(calls) });

    expect(r.status).toBe('ready');
    expect(calls.map(c => c[0])).toEqual(['submit_seo_triage', 'submit_seo_fix_batch']);
    const submitted = calls[1][1];
    const byId = Object.fromEntries(submitted.fixes.map(f => [f.rec_id, f]));
    expect(byId[1].ok).toBe(true);
    expect(byId[1].diff).toMatch(/\+<html><head><title>New title/);
    expect(byId[2]).toMatchObject({ ok: false });
    expect(byId[2].error).toMatch(/may not touch: secret.txt/);
    expect(byId[3].error).toMatch(/node --check app.js" failed/);
    expect(byId[4]).toBeUndefined(); // needs_007: not attempted

    // One commit on the branch, nothing on main, the repo folder untouched, no worktree left over.
    expect(sh(repo, 'log', '--format=%s', `${submitted.base_commit}..${submitted.branch}`)).toBe('SEO: Title tag (#1)');
    expect(sh(repo, 'status', '--porcelain')).toBe('');
    expect(fs.readFileSync(path.join(repo, 'index.html'), 'utf8')).toMatch(/Old/);
    expect(sh(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
    ready = submitted;
  });

  it('refuses a repo without a valid manifest', async () => {
    const calls = [];
    const empty = path.join(tmp, 'no-manifest');
    fs.mkdirSync(empty);
    execFileSync('git', ['init', '--quiet', empty]);
    const r = await fixWorker.runBatch({ batch_id: 8, night: 'x', client: { ...client(), repo_path: empty }, candidates: [], max_fixes: 8 },
      { claudeFn: fakeClaude, hookFn: fakeHook(calls) });
    expect(r.status).toBe('failed');
    expect(calls[0][1].error).toMatch(/^manifest: no hyphening.deploy.json/);
  });
});

describe('deploy_worker', GIT_TIMEOUT, () => {
  const deployJob = (batch) => ({
    batch_id: 7, branch: batch.branch, base_commit: batch.base_commit, client: client(),
    commits: batch.fixes.filter(f => f.ok).map(f => ({ rec_id: f.rec_id, commit_sha: f.commit, metric: 'Title tag' })),
  });

  it('pushes the fixes and reports live when the health check passes', async () => {
    const calls = [];
    const r = await deployWorker.deployBatch(deployJob(ready), { hookFn: fakeHook(calls), health: async () => ({ ok: true }) });
    expect(r.status).toBe('live');
    expect(sh(remote, 'log', '-1', '--format=%s', 'main')).toBe('SEO: Title tag (#1)');
    expect(calls[0][1]).toMatchObject({ batch_id: 7, status: 'live', pushed: true });
    expect(sh(repo, 'branch', '--list', ready.branch)).toBe(''); // branch cleaned up
  });

  it('rolls back when the health check fails, leaving the site as it was', async () => {
    // A second night's fix, made by hand on a branch from the new main.
    sh(repo, 'fetch', '--quiet', 'origin');
    const base = sh(repo, 'rev-parse', 'origin/main');
    const wt = path.join(tmp, 'wt2');
    sh(repo, 'worktree', 'add', '--quiet', '-b', 'seo/night-2', wt, base);
    fs.writeFileSync(path.join(wt, 'index.html'), '<html><head><title>Broken</title></head></html>\n');
    sh(wt, 'commit', '--quiet', '-am', 'SEO: break it (#9)');
    const sha = sh(wt, 'rev-parse', 'HEAD');
    sh(repo, 'worktree', 'remove', '--force', wt);

    const calls = [];
    let n = 0;
    // First check (after the deploy) fails; the second (after the rollback) passes.
    const health = async () => (n++ === 0 ? { ok: false, error: 'https://example.test/ → 500' } : { ok: true });
    const r = await deployWorker.deployBatch({ batch_id: 9, branch: 'seo/night-2', base_commit: base, client: client(),
      commits: [{ rec_id: 9, commit_sha: sha, metric: 'break it' }] }, { hookFn: fakeHook(calls), health });

    expect(r.status).toBe('rolled_back');
    expect(r.error).toMatch(/health check failed/);
    expect(sh(remote, 'log', '-1', '--format=%s', 'main')).toMatch(/^Revert "SEO: break it/);
    expect(sh(remote, 'show', 'main:index.html')).toMatch(/New title/);
  });

  it('stops before pushing when a fix clashes with newer work on main', async () => {
    sh(repo, 'fetch', '--quiet', 'origin');
    const base = sh(repo, 'rev-parse', 'origin/main');
    const wt = path.join(tmp, 'wt3');
    sh(repo, 'worktree', 'add', '--quiet', '-b', 'seo/night-3', wt, base);
    fs.writeFileSync(path.join(wt, 'index.html'), '<html><head><title>Night</title></head></html>\n');
    sh(wt, 'commit', '--quiet', '-am', 'SEO: night title (#10)');
    const sha = sh(wt, 'rev-parse', 'HEAD');
    sh(repo, 'worktree', 'remove', '--force', wt);
    // Meanwhile someone changes the same line on main.
    sh(repo, 'pull', '--quiet', '--ff-only', 'origin', 'main');
    fs.writeFileSync(path.join(repo, 'index.html'), '<html><head><title>Day</title></head></html>\n');
    sh(repo, 'commit', '--quiet', '-am', 'day edit');
    sh(repo, 'push', '--quiet', 'origin', 'main');
    const before = sh(remote, 'rev-parse', 'main');

    const calls = [];
    const r = await deployWorker.deployBatch({ batch_id: 10, branch: 'seo/night-3', base_commit: base, client: client(),
      commits: [{ rec_id: 10, commit_sha: sha, metric: 'night title' }] }, { hookFn: fakeHook(calls), health: async () => ({ ok: true }) });
    expect(r.status).toBe('deploy_failed');
    expect(r.error).toMatch(/clashes with newer changes/);
    expect(calls[0][1].pushed).toBe(false);
    expect(sh(remote, 'rev-parse', 'main')).toBe(before);
  });

  it('replays fixes in the order they were made, whatever order the server lists them in', async () => {
    sh(repo, 'fetch', '--quiet', 'origin');
    const base = sh(repo, 'rev-parse', 'origin/main');
    const wt = path.join(tmp, 'wt4');
    sh(repo, 'worktree', 'add', '--quiet', '-b', 'seo/night-4', wt, base);
    // As on 2026-11-07: the later fix (#20) builds on the earlier one (#30) in the same file.
    fs.writeFileSync(path.join(wt, 'index.html'), '<html><head><title>Step 1</title></head></html>\n');
    sh(wt, 'commit', '--quiet', '-am', 'SEO: step 1 (#30)');
    const first = sh(wt, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(wt, 'index.html'), '<html><head><title>Step 2</title></head></html>\n');
    sh(wt, 'commit', '--quiet', '-am', 'SEO: step 2 (#20)');
    const second = sh(wt, 'rev-parse', 'HEAD');
    sh(repo, 'worktree', 'remove', '--force', wt);

    const calls = [];
    const r = await deployWorker.deployBatch({ batch_id: 11, branch: 'seo/night-4', base_commit: base, client: client(),
      commits: [{ rec_id: 20, commit_sha: second, metric: 'step 2' }, { rec_id: 30, commit_sha: first, metric: 'step 1' }] },
    { hookFn: fakeHook(calls), health: async () => ({ ok: true }) });
    expect(r.status).toBe('live');
    expect(sh(remote, 'show', 'main:index.html')).toMatch(/Step 2/);
    expect(sh(remote, 'log', '-2', '--format=%s', 'main').split('\n')).toEqual(['SEO: step 2 (#20)', 'SEO: step 1 (#30)']);
  });
});

describe('seo_fix_worker: fixes that change nothing', GIT_TIMEOUT, () => {
  it('says whether it was already done or beyond the safe list; an unclear answer stays a failure', async () => {
    const calls = [];
    const reportFile = path.join(process.env.VAULT_DIR, 'Companies/Hyphening/Docs/Hyphening - Night Report.md');
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    const answers = {
      11: '<json>{"changed": false, "already_done": true, "summary": "index.html already has a title"}</json>',
      12: '<json>{"changed": false, "already_done": false, "summary": "needs the React components"}</json>',
      13: '<json>{"changed": false, "already_done": false, "summary": "needs facts we do not have"}</json>',
      14: 'claude timed out',
    };
    const claudeFn = async (prompt, cwd, tools) => {
      if (tools === 'Read,Glob,Grep') return { code: 0, out: `<json>${JSON.stringify([11, 12, 13, 14].map(id => ({ id, triage: 'safe', reason: 'x' })))}</json>`, err: '' };
      return { code: 0, out: answers[Number(prompt.match(/Recommendation #(\d+)/)[1])], err: '' };
    };
    const job = { batch_id: 9, night: '2026-11-13', client: client(), max_fixes: 8,
      candidates: [candidate(11, 'Title'), candidate(12, 'Headings'), { ...candidate(13, 'Comparison page'), fix_approved: 1 }, candidate(14, 'Schema')] };
    const r = await fixWorker.runBatch(job, { claudeFn, hookFn: fakeHook(calls) });

    expect(r.status).toBe('empty');
    const byId = Object.fromEntries(calls[1][1].fixes.map(f => [f.rec_id, f]));
    expect(byId[11].no_change).toBe('already_done');
    expect(byId[12].no_change).toBe('blocked');
    expect(byId[13].no_change).toBeUndefined(); // 007 approved it: still a failure
    expect(byId[14].no_change).toBeUndefined();
    expect(byId[14].error).toMatch(/No change made: claude timed out/);
    expect(fs.readFileSync(reportFile, 'utf8')).toMatch(/0 ready to deploy · 2 failed · 1 already done · 1 need you/);
  });
});
