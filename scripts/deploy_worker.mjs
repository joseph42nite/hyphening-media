#!/usr/bin/env node
/**
 * Deploy worker: runs when 007 presses Deploy in the SEO Monitor's "Last
 * night" section. A plain script, no AI; it does exactly what the repo's
 * deploy manifest says, in this order:
 *
 *   1. Fresh worktree at origin/<branch>; replay the night's fix commits on it.
 *      A clash with newer work on <branch> stops here; nothing is pushed.
 *   2. Run the manifest's checks.
 *   3. ssh_pull_build only: the server must be at origin/<branch>, so a Deploy
 *      never takes other, unapproved commits live along with the fixes.
 *   4. Push to <branch>, run the deploy (ssh commands, or nothing for git_push
 *      where the host deploys on push), then check every health URL.
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
import { mkdtemp, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { appendNightReport } from './lib/nightReport.mjs';
import { hook } from './lib/hook.mjs';
import { run, git, sh, tail, healthCheck } from './lib/proc.mjs';
import { loadManifest, NIGHT_DEPLOY_TYPES } from './lib/deployManifest.mjs';
import { linkNodeModules } from './lib/worktree.mjs';

const WORKER = os.hostname();


function ssh(alias, command) {
  return run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', alias, command], { timeoutMs: 15 * 60 * 1000 });
}

function serverCommand(d, commands) {
  const prefix = d.path_prefix ? `export PATH="${d.path_prefix}:$PATH" && ` : '';
  return `${prefix}cd '${d.dir.replace(/'/g, "'\\''")}' && ${commands.join(' && ')}`;
}

/** Run the deploy step for the manifest's type; { ok, error }. */
async function deployStep(manifest, log) {
  const d = manifest.deploy;
  if (d.type === 'git_push') { log('git_push: the host deploys on push'); return { ok: true }; }
  const res = await ssh(d.host_alias, serverCommand(d, d.commands));
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

export async function deployBatch(job, { hookFn = hook, health = healthCheck } = {}) {
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

  if (manifest.deploy.type === 'ssh_pull_build') {
    const res = await ssh(manifest.deploy.host_alias, serverCommand(manifest.deploy, ['git rev-parse HEAD']));
    if (res.code !== 0) return finish('deploy_failed', { error: `can't reach the server over SSH (alias "${manifest.deploy.host_alias}"): ${tail(res.err || res.out, 200)}` });
    const serverHead = res.out.trim().split('\n').pop();
    if (serverHead !== remoteHead) {
      return finish('deploy_failed', { error: `the server is at ${serverHead.slice(0, 8)} but ${target} is at ${remoteHead.slice(0, 8)}: other changes are waiting to deploy. Deploy those first (normal approval), then press Deploy again.` });
    }
  }

  const wt = await mkdtemp(path.join(os.tmpdir(), 'seo-deploy-'));
  await git(repo, ['worktree', 'add', '--quiet', '--detach', wt, remoteHead]);
  try {
    // Without these the checks can't build (2026-11-03: "vite: command not found").
    await linkNodeModules(repo, wt);
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

    let step = await deployStep(manifest, log);
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
    step = await deployStep(manifest, log);
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
