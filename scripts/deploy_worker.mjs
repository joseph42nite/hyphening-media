#!/usr/bin/env node
/**
 * Deploy worker: runs when 007 presses Deploy in the SEO Monitor's "Last
 * night" section. A plain script, no AI; it does exactly what the repo's
 * deploy manifest says, in this order:
 *
 *   1. Fresh worktree at origin/<branch>; replay the night's fix commits on it.
 *      A clash with newer work on <branch> stops here; nothing is pushed.
 *   2. Run the manifest's checks.
 *   3. ssh_pull_build and ssh_rsync_static: the server must be at
 *      origin/<branch> (its git HEAD, or the .deployed-commit file an upload
 *      leaves), so a Deploy never takes other, unapproved commits live along
 *      with the fixes.
 *   4. Push to <branch>, run the deploy (ssh commands; a local build uploaded
 *      with rsync; or nothing for git_push, where the host deploys on push),
 *      then check every health URL.
 *   5. Health check fails → revert the fixes, push, deploy again, check again:
 *      "rolled_back". If even that fails the result says so loudly.
 *
 * The SSH host is an alias in ~/.ssh/config; the manifest never holds keys.
 *
 *   node scripts/deploy_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { appendNightReport } from './lib/nightReport.mjs';
import { hook } from './lib/hook.mjs';
import { run, git, sh, tail, healthCheck } from './lib/proc.mjs';
import { loadManifest, NIGHT_DEPLOY_TYPES, DEPLOYED_COMMIT_FILE } from './lib/deployManifest.mjs';
import { prepareWorktree } from './lib/worktree.mjs';

const WORKER = os.hostname();


const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];

/** How the worker reaches a server; tests swap it for a local folder. */
export const transport = {
  ssh: (alias, command) => run('ssh', [...SSH_OPTS, alias, command], { timeoutMs: 15 * 60 * 1000 }),
  rsync: (args) => run('rsync', args, { timeoutMs: 15 * 60 * 1000 }),
};

const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

function serverCommand(d, commands) {
  const prefix = d.path_prefix ? `export PATH="${d.path_prefix}:$PATH" && ` : '';
  return `${prefix}cd ${q(d.dir)} && ${commands.join(' && ')}`;
}

/** The commit the server says is live, or { error }. */
async function serverCommit(d, net) {
  const cmd = d.type === 'ssh_rsync_static'
    ? `cat ${q(`${d.remote_dir}/${DEPLOYED_COMMIT_FILE}`)}`
    : serverCommand(d, ['git rev-parse HEAD']);
  const res = await net.ssh(d.host_alias, cmd);
  if (res.code !== 0) {
    const why = tail(res.err || res.out, 200);
    if (d.type === 'ssh_rsync_static' && /No such file/i.test(why)) {
      return { error: `the server has no ${d.remote_dir}/${DEPLOYED_COMMIT_FILE}, so which commit is live is unknown. Deploy once by hand (the repo's deploy script writes it), then press Deploy again.` };
    }
    return { error: `can't reach the server over SSH (alias "${d.host_alias}"): ${why}` };
  }
  return { commit: res.out.trim().split('\n').pop() };
}

/** rsync arguments for uploading <wt>/<local_dir> to <alias>:<remote_dir>. */
export function rsyncArgs(d, wt) {
  const args = ['-az', '--delete', '--itemize-changes', '-e', `ssh ${SSH_OPTS.join(' ')}`];
  // Protected paths on the server are neither deleted nor replaced: folders and files that aren't the site's.
  for (const p of d.protect || []) args.push('--filter', `P ${p}`);
  for (const p of d.exclude || []) args.push('--exclude', p);
  args.push(`${path.join(wt, d.local_dir)}/`, `${d.host_alias}:${d.remote_dir}/`);
  return args;
}

/** Build in the worktree, stamp the commit, upload. */
async function rsyncStaticStep(d, wt, log, net) {
  for (const cmd of d.build) {
    const res = await sh(cmd, wt);
    if (res.code !== 0) return { ok: false, error: `build "${cmd}" failed: ${tail(res.err || res.out, 300)}` };
  }
  const out = path.join(wt, d.local_dir);
  const missing = ['index.html', ...(d.require || [])].filter((f) => !existsSync(path.join(out, f)));
  if (missing.length) return { ok: false, error: `the build didn't produce ${missing.map((f) => `${d.local_dir}/${f}`).join(', ')}; nothing uploaded` };
  await writeFile(path.join(out, DEPLOYED_COMMIT_FILE), `${await git(wt, ['rev-parse', 'HEAD'])}\n`);
  log(`built ${d.local_dir}/`);
  const res = await net.rsync(rsyncArgs(d, wt));
  const changed = res.out.split('\n').filter((l) => l && !l.startsWith('.')).length;
  log(`rsync: ${changed} change(s)${res.err.trim() ? `\n${tail(res.err, 400)}` : ''}`);
  return res.code === 0 ? { ok: true } : { ok: false, error: `upload failed (rsync exit ${res.code}): ${tail(res.err || res.out, 300)}` };
}

/** Run the deploy step for the manifest's type; { ok, error }. */
async function deployStep(manifest, wt, log, net) {
  const d = manifest.deploy;
  if (d.type === 'git_push') { log('git_push: the host deploys on push'); return { ok: true }; }
  if (d.type === 'ssh_rsync_static') return rsyncStaticStep(d, wt, log, net);
  const res = await net.ssh(d.host_alias, serverCommand(d, d.commands));
  log(`server: ${tail(res.out, 800)}${res.err.trim() ? `\n${tail(res.err, 400)}` : ''}`);
  return res.code === 0 ? { ok: true } : { ok: false, error: `server deploy failed (exit ${res.code}): ${tail(res.err || res.out, 300)}` };
}

/**
 * One Deploy. `job` is a claim_seo_deploys entry. Returns the result it
 * reported: { status: live|rolled_back|deploy_failed, live_commit?, error? }.
 */
/**
 * The fixes in the order they were made on the night branch. Each fix is made
 * on top of the one before it, often in the same file, but the server lists
 * them by recommendation id, which needn't match: on 2026-11-07 #1950 was
 * replayed before the #1983 it was made on, and clashed. Commits git can't
 * place keep their order, at the end.
 */
export async function inBranchOrder(repo, commits, baseCommit) {
  const args = ['rev-list', '--topo-order', '--reverse', ...commits.map(c => c.commit_sha)];
  if (baseCommit) args.push(`^${baseCommit}`);
  const res = await git(repo, args, { allowFail: true });
  const order = res.code === 0 ? res.out.trim().split('\n') : [];
  const at = (c) => { const i = order.indexOf(c.commit_sha); return i === -1 ? Infinity : i; };
  return commits.map((c, i) => ({ c, i })).sort((a, b) => (at(a.c) - at(b.c)) || (a.i - b.i)).map(x => x.c);
}

export async function deployBatch(job, { hookFn = hook, health = healthCheck, net = transport } = {}) {
  const lines = [];
  // Whether anything reached the remote. A failure before the push leaves the
  // fixes ready, so 007 can press Retry deploy once the cause is fixed.
  let pushed = false;
  const log = (s) => { const l = `${new Date().toISOString().slice(11, 19)} ${s}`; lines.push(l); console.log(`[deploy] ${l}`); };
  const finish = async (status, extra = {}) => {
    await hookFn('finish_seo_deploy', { batch_id: job.batch_id, status, pushed, log: lines.join('\n'), ...extra });
    await appendNightReport(`DEPLOY ${status.toUpperCase()} · ${job.client.name}${extra.error ? ` · ${extra.error}` : ''}`);
    return { status, ...extra };
  };

  const repo = job.client.repo_path;
  if (!repo || !existsSync(path.join(repo, '.git'))) return finish('deploy_failed', { error: `site repo ${repo || '(none)'} not found on this Mac` });
  const { manifest, errors } = await loadManifest(repo);
  if (errors.length) return finish('deploy_failed', { error: `manifest: ${errors.join('; ')}` });
  if (!NIGHT_DEPLOY_TYPES.includes(manifest.deploy.type)) return finish('deploy_failed', { error: `deploy type ${manifest.deploy.type} can't be deployed by the button` });
  if (!job.commits.length) return finish('deploy_failed', { error: 'no fixes to deploy' });

  const target = manifest.branch;
  await git(repo, ['fetch', '--quiet', 'origin', target]);
  const remoteHead = await git(repo, ['rev-parse', `origin/${target}`]);
  log(`origin/${target} is ${remoteHead.slice(0, 8)}; ${job.commits.length} fix(es) to deploy`);

  if (manifest.deploy.type === 'ssh_pull_build' || manifest.deploy.type === 'ssh_rsync_static') {
    const live = await serverCommit(manifest.deploy, net);
    if (live.error) return finish('deploy_failed', { error: live.error });
    const serverHead = live.commit;
    if (serverHead !== remoteHead) {
      return finish('deploy_failed', { error: `the server is at ${serverHead.slice(0, 8)} but ${target} is at ${remoteHead.slice(0, 8)}: other changes are waiting to deploy. Deploy those first (normal approval), then press Deploy again.` });
    }
  }

  const wt = await mkdtemp(path.join(os.tmpdir(), 'seo-deploy-'));
  await git(repo, ['worktree', 'add', '--quiet', '--detach', wt, remoteHead]);
  try {
    // Without these the checks can't build (2026-11-03: "vite: command not found").
    try { await prepareWorktree(repo, wt, manifest); } catch (err) { return finish('deploy_failed', { error: err.message }); }
    for (const c of await inBranchOrder(repo, job.commits, job.base_commit)) {
      const pick = await git(wt, ['cherry-pick', c.commit_sha], { allowFail: true });
      if (pick.code !== 0) {
        await git(wt, ['cherry-pick', '--abort'], { allowFail: true });
        return finish('deploy_failed', { error: `fix #${c.rec_id} (${c.metric}) clashes with newer changes on ${target}. Discard; tonight's run redoes it on the new code.` });
      }
    }
    log(`replayed ${job.commits.length} commit(s)`);

    for (const check of manifest.checks || []) {
      const res = await sh(check, wt);
      if (res.code !== 0) return finish('deploy_failed', { error: `check "${check}" failed: ${tail(res.err || res.out, 300)}` });
    }
    if ((manifest.checks || []).length) log('checks passed');

    const push = await git(wt, ['push', '--quiet', 'origin', `HEAD:${target}`], { allowFail: true });
    if (push.code !== 0) return finish('deploy_failed', { error: `push refused: ${tail(push.err, 300)}` });
    pushed = true;
    const live = await git(wt, ['rev-parse', 'HEAD']);
    log(`pushed ${live.slice(0, 8)}`);

    let step = await deployStep(manifest, wt, log, net);
    let checked = step.ok ? await health(manifest.health_check) : { ok: false };
    if (step.ok && checked.ok) {
      log('health check passed');
      await git(repo, ['branch', '-D', job.branch], { allowFail: true });
      return finish('live', { live_commit: live });
    }

    // Roll back: revert the fixes on top, push, deploy again.
    const why = step.ok ? `health check failed: ${checked.error}` : step.error;
    log(`${why}; rolling back`);
    await git(wt, ['revert', '--no-edit', `${remoteHead}..HEAD`]);
    const back = await git(wt, ['push', '--quiet', 'origin', `HEAD:${target}`], { allowFail: true });
    if (back.code !== 0) return finish('deploy_failed', { error: `${why}. ROLLBACK PUSH FAILED (${tail(back.err, 200)}): the site may be broken, check it now.` });
    step = await deployStep(manifest, wt, log, net);
    checked = step.ok ? await health(manifest.health_check) : { ok: false, error: step.error };
    if (!checked.ok) return finish('deploy_failed', { error: `${why}. ROLLBACK DEPLOYED BUT THE SITE IS STILL FAILING (${checked.error}): check it now.` });
    log('rolled back; health check passed');
    return finish('rolled_back', { error: why, live_commit: await git(wt, ['rev-parse', 'HEAD']) });
  } finally {
    await git(repo, ['worktree', 'remove', '--force', wt], { allowFail: true });
    await rm(wt, { recursive: true, force: true });
  }
}

async function main() {
  const res = await hook('claim_seo_deploys', { worker: WORKER });
  const deploys = res?.data?.deploys || [];
  if (deploys.length === 0) return console.log('[deploy] Nothing to deploy.');
  for (const job of deploys) {
    try {
      const r = await deployBatch(job);
      console.log(`[deploy] ${job.client.name}: ${r.status}`);
    } catch (err) {
      console.error(`[deploy] ${job.client.name}: ${err.message}`);
      await hook('finish_seo_deploy', { batch_id: job.batch_id, status: 'deploy_failed', error: err.message.slice(0, 800) }).catch(() => {});
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[deploy] Fatal:', err); process.exit(1); });
}
