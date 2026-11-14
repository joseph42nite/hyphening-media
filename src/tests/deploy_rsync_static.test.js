/**
 * The ssh_rsync_static deploy type (a site built on this Mac and uploaded with
 * rsync, e.g. cPanel hosting), against a throwaway repo and a local folder
 * standing in for the server's web root. SSH is faked; git, the build, rsync
 * and the worktrees are real.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { validateManifest, DEPLOYED_COMMIT_FILE } from '../../scripts/lib/deployManifest.mjs';
import { prepareWorktree } from '../../scripts/lib/worktree.mjs';
import { run } from '../../scripts/lib/proc.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-rsync-'));
process.env.VAULT_DIR = path.join(tmp, 'vault');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const remote = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'site');
const server = path.join(tmp, 'server-home');
const webRoot = path.join(server, 'public_html');
const ALIAS = 'static-test';

const deploy = {
  type: 'ssh_rsync_static', host_alias: ALIAS, build: ['node build.js'],
  local_dir: 'out', remote_dir: 'public_html', require: ['.htaccess'],
  protect: ['mail-subdomain/', 'error_log'], exclude: ['.DS_Store'],
};

// The fake server: ssh can only `cat` files under its home; rsync's
// "<alias>:" destination becomes the local folder.
const net = {
  ssh: async (alias, command) => {
    expect(alias).toBe(ALIAS);
    const m = command.match(/^cat '(.+)'$/);
    const file = m && path.join(server, m[1]);
    if (!file || !fs.existsSync(file)) return { code: 1, out: '', err: `cat: ${m?.[1]}: No such file or directory` };
    return { code: 0, out: fs.readFileSync(file, 'utf8'), err: '' };
  },
  rsync: (args) => run('rsync', args.filter((a, i) => a !== '-e' && args[i - 1] !== '-e')
    .map((a) => a.replace(`${ALIAS}:`, `${server}/`))),
};

const fakeHook = (calls) => async (event, payload) => { calls.push([event, payload]); return { data: {} }; };
const client = () => ({ id: 98, name: 'Static site', website_url: 'https://static.test/', repo_path: repo });
const live = () => fs.readFileSync(path.join(webRoot, DEPLOYED_COMMIT_FILE), 'utf8').trim();

/** A night fix on its own branch from origin/main, as the fix worker leaves it. */
function nightFix(name, title, rec) {
  sh(repo, 'fetch', '--quiet', 'origin');
  const base = sh(repo, 'rev-parse', 'origin/main');
  const wt = path.join(tmp, `wt-${name}`);
  sh(repo, 'worktree', 'add', '--quiet', '-b', name, wt, base);
  fs.writeFileSync(path.join(wt, 'src.html'), `<title>${title}</title>\n`);
  sh(wt, 'commit', '--quiet', '-am', `SEO: ${title} (#${rec})`);
  const sha = sh(wt, 'rev-parse', 'HEAD');
  sh(repo, 'worktree', 'remove', '--force', wt);
  return { batch_id: rec, branch: name, base_commit: base, client: client(), commits: [{ rec_id: rec, commit_sha: sha, metric: title }] };
}

let deployWorker;

beforeAll(async () => {
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', remote]);
  execFileSync('git', ['clone', '--quiet', remote, repo]);
  sh(repo, 'config', 'user.name', 'Test');
  sh(repo, 'config', 'user.email', 'test@example.test');
  fs.writeFileSync(path.join(repo, 'src.html'), '<title>Old</title>\n');
  // The "build": copies the page into out/ with an .htaccess, like next build + gen-htaccess.
  fs.writeFileSync(path.join(repo, 'build.js'), [
    "const fs = require('fs');",
    "fs.rmSync('out', { recursive: true, force: true }); fs.mkdirSync('out');",
    "fs.copyFileSync('src.html', 'out/index.html'); fs.writeFileSync('out/.htaccess', 'RewriteEngine On\\n');",
  ].join('\n'));
  fs.writeFileSync(path.join(repo, '.gitignore'), 'out\nnode_modules\n');
  fs.writeFileSync(path.join(repo, 'hyphening.deploy.json'), JSON.stringify({
    client_id: 98, branch: 'main', checks: ['node build.js'], deploy,
    health_check: ['https://static.test/'], rollback: 'git_revert',
    seo_fixes: { enabled: true, paths: ['src.html'] },
  }, null, 2));
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '--quiet', '-m', 'site');
  sh(repo, 'push', '--quiet', 'origin', 'main');

  // The server as a hand deploy left it, plus files that aren't the site's.
  fs.mkdirSync(path.join(webRoot, 'mail-subdomain'), { recursive: true });
  fs.writeFileSync(path.join(webRoot, 'mail-subdomain', 'index.php'), 'mail\n');
  fs.writeFileSync(path.join(webRoot, 'error_log'), 'log\n');
  fs.writeFileSync(path.join(webRoot, 'old-page.html'), 'stale\n');
  fs.writeFileSync(path.join(webRoot, DEPLOYED_COMMIT_FILE), `${sh(repo, 'rev-parse', 'HEAD')}\n`);

  deployWorker = await import('../../scripts/deploy_worker.mjs');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('ssh_rsync_static manifest', () => {
  const base = { client_id: 1, branch: 'main', health_check: ['https://x.test/'], deploy };

  it('accepts a complete manifest, with night fixes on', () => {
    expect(validateManifest({ ...base, seo_fixes: { enabled: true, paths: ['src/app/'] } })).toEqual([]);
  });

  it('rejects a missing build, an absolute web root and a path that climbs out', () => {
    const errors = validateManifest({ ...base, deploy: { ...deploy, build: [], remote_dir: '/home/x/public_html', protect: ['../mail'] } });
    expect(errors.join('\n')).toMatch(/deploy.build/);
    expect(errors.join('\n')).toMatch(/deploy.remote_dir/);
    expect(errors.join('\n')).toMatch(/deploy.protect/);
  });

  it('builds rsync arguments that protect, exclude and upload the folder contents', () => {
    const args = deployWorker.rsyncArgs(deploy, '/wt');
    expect(args).toEqual(expect.arrayContaining(['--delete', '--filter', 'P mail-subdomain/', '--exclude', '.DS_Store']));
    expect(args.slice(-2)).toEqual(['/wt/out/', `${ALIAS}:public_html/`]);
  });
});

describe('ssh_rsync_static deploy', { timeout: 120000 }, () => {
  it('builds, uploads and stamps the live commit, leaving protected files alone', async () => {
    const job = nightFix('seo/night-a', 'New title', 1);
    const calls = [];
    const r = await deployWorker.deployBatch(job, { hookFn: fakeHook(calls), health: async () => ({ ok: true }), net });
    expect(r.status).toBe('live');
    expect(fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')).toMatch(/New title/);
    expect(fs.existsSync(path.join(webRoot, '.htaccess'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'old-page.html'))).toBe(false); // old site files go
    expect(fs.readFileSync(path.join(webRoot, 'mail-subdomain', 'index.php'), 'utf8')).toBe('mail\n');
    expect(fs.existsSync(path.join(webRoot, 'error_log'))).toBe(true);
    expect(live()).toBe(sh(remote, 'rev-parse', 'main'));
    expect(r.live_commit).toBe(live());
  });

  it('rolls back by rebuilding and re-uploading the reverted code', async () => {
    const before = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
    const job = nightFix('seo/night-b', 'Broken', 2);
    let n = 0;
    const health = async () => (n++ === 0 ? { ok: false, error: 'https://static.test/ → 500' } : { ok: true });
    const r = await deployWorker.deployBatch(job, { hookFn: fakeHook([]), health, net });
    expect(r.status).toBe('rolled_back');
    expect(sh(remote, 'log', '-1', '--format=%s', 'main')).toMatch(/^Revert "SEO: Broken/);
    expect(fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')).toBe(before);
    expect(live()).toBe(sh(remote, 'rev-parse', 'main'));
  });

  it('refuses when the live site is not at main, pushing nothing', async () => {
    const job = nightFix('seo/night-c', 'Other', 3);
    fs.writeFileSync(path.join(webRoot, DEPLOYED_COMMIT_FILE), 'deadbeef\n'); // someone uploaded other work
    const head = sh(remote, 'rev-parse', 'main');
    const calls = [];
    const r = await deployWorker.deployBatch(job, { hookFn: fakeHook(calls), health: async () => ({ ok: true }), net });
    expect(r.status).toBe('deploy_failed');
    expect(r.error).toMatch(/the server is at deadbeef/);
    expect(calls[0][1].pushed).toBe(false);
    expect(sh(remote, 'rev-parse', 'main')).toBe(head);
  });

  it('says to deploy by hand once when the server has no commit stamp', async () => {
    fs.rmSync(path.join(webRoot, DEPLOYED_COMMIT_FILE));
    const job = nightFix('seo/night-d', 'Stampless', 4);
    const r = await deployWorker.deployBatch(job, { hookFn: fakeHook([]), health: async () => ({ ok: true }), net });
    expect(r.status).toBe('deploy_failed');
    expect(r.error).toMatch(/Deploy once by hand/);
  });
});

describe('install instead of linking node_modules', () => {
  it('runs the install commands in the worktree and links nothing', async () => {
    const wt = fs.mkdtempSync(path.join(tmp, 'install-'));
    const linked = await prepareWorktree(repo, wt, { install: ["node -e \"require('fs').mkdirSync('node_modules/pkg', { recursive: true })\""] });
    expect(linked).toEqual([]);
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(wt, 'node_modules', 'pkg'))).toBe(true);
  });

  it('throws with the command when an install fails', async () => {
    const wt = fs.mkdtempSync(path.join(tmp, 'install-'));
    await expect(prepareWorktree(repo, wt, { install: ['exit 3'] })).rejects.toThrow(/install "exit 3" failed/);
  });

  it('is validated as a list of commands', () => {
    const m = { client_id: 1, branch: 'main', health_check: ['https://x.test/'], deploy };
    expect(validateManifest({ ...m, install: ['npm ci'] })).toEqual([]);
    expect(validateManifest({ ...m, install: 'npm ci' }).join()).toMatch(/install must be a list/);
  });
});
