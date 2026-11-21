#!/usr/bin/env node
/**
 * Plugin update worker: keeps the Ops Center's view of claude-seo,
 * claude-blog and claude-ads current, and carries out the Update & test
 * button in the SEO and Ads Monitors (src/services/plugins.js).
 *
 * Each pass:
 *   1. claim_plugin_updates. The server holds jobs during the night runs and
 *      while any SEO, ads, blog or fix run is in flight.
 *   2. If the server says the status is due (hourly), or after an update,
 *      report_plugin_status: installed (Claude Code's installed_plugins.json,
 *      the version that runs) and latest (the GitHub release).
 *   3. For each job:
 *      a. Back up installed_plugins.json.
 *      b. claude plugin marketplace update, then claude plugin update.
 *      c. Check that every skill and script our workers call that the old
 *         version had is still there.
 *      d. claude-seo: rebuild the Python runtime for the new version.
 *      e. Smoke check: one real run on Hyphening's own site or a fixed input.
 *      f. claude-seo: re-capture the drift baselines.
 *      Any failure after (b) restores the old version, rebuilds its runtime
 *      and reports rolled_back.
 *
 * Never passes -y to `claude plugin update`: a release that declares a
 * command to run asks a person, so the job fails with nothing changed.
 *
 *   PLUGIN_WORKER_ID   name in the logs (default hostname)
 *   SEO_PYTHON         Python for the claude-seo runtime (default ~/.local/bin/python3.12;
 *                      this Intel Mac's system python3 is 3.9, below the plugin's floor)
 *   SEO_SETUP_MINUTES  hard cap on the claude-seo runtime setup (default 240)
 *   SEO_SETUP_STALL_MINUTES  stop the setup sooner only if its downloads make no
 *                      progress for this long (default 20)
 *   BLOG_PYTHON        Python the blog worker scores with (same default as blog_worker.mjs)
 *   GITHUB_TOKEN       optional, raises the GitHub API rate limit
 *
 * Usage: node scripts/plugin_update_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { copyFile, mkdtemp, rm, writeFile } from 'fs/promises';
import dotenv from 'dotenv';
import { hook } from './lib/hook.mjs';
import { run, runClaude, tail } from './lib/proc.mjs';
import { installedPlugin, INSTALLED_FILE, SEO_PYTHON } from './lib/plugins.mjs';
import { recaptureDriftBaseline } from './lib/drift.mjs';
import { appendNightReport } from './lib/nightReport.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '../.env') });

const HOME = os.homedir();
const WORKER = process.env.PLUGIN_WORKER_ID || os.hostname();
const CLAUDE_BIN = process.env.SEO_CLAUDE_BIN || 'claude';
const MODEL = process.env.SEO_MODEL || 'claude-sonnet-5-5';
const SEO_DATA = process.env.SEO_PLUGIN_DATA || path.join(HOME, '.claude/plugins/data/claude-seo-agricidaniel-claude-seo');
const BLOG_PYTHON = process.env.BLOG_PYTHON || path.join(HOME, '.openmausbot/workspaces/3ee73451-c9f3-402f-9f9a-2677050c11e5/blogvenv/bin/python');
const MIN = 60 * 1000;
const SETUP_MINUTES = Number(process.env.SEO_SETUP_MINUTES) || 240;
const STALL_MINUTES = Number(process.env.SEO_SETUP_STALL_MINUTES) || 20;

// ------------------------------------------------------------ status

/** The latest GitHub release: { version, sha, published_at } or nulls. */
export async function latestRelease(repo, { fetchFn = fetch } = {}) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'hyphening-plugin-worker' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const rel = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(20000) });
    if (!rel.ok) return { version: null, sha: null, published_at: null, error: `releases HTTP ${rel.status}` };
    const r = await rel.json();
    const version = String(r.tag_name || '').replace(/^v/, '');
    let sha = null;
    const c = await fetchFn(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(r.tag_name)}`, { headers, signal: AbortSignal.timeout(20000) });
    if (c.ok) sha = (await c.json()).sha || null;
    return { version: /^\d+\.\d+\.\d+/.test(version) ? version : null, sha, published_at: r.published_at || null };
  } catch (err) {
    return { version: null, sha: null, published_at: null, error: err.message };
  }
}

async function reportStatus(plugins) {
  const items = [];
  for (const p of plugins) {
    const inst = installedPlugin(p.install_id);
    const latest = await latestRelease(p.repo);
    if (latest.error) console.warn(`[plugins] ${p.plugin}: latest unknown (${latest.error})`);
    items.push({
      plugin: p.plugin, installed_version: inst?.version || null, installed_sha: inst?.sha || null,
      latest_version: latest.version, latest_sha: latest.sha, latest_published_at: latest.published_at,
    });
  }
  const res = await hook('report_plugin_status', { plugins: items });
  console.log(`[plugins] status: ${res.message || 'reported'}`);
}

// ------------------------------------------------------------ checks

/** Skill folder names (with a SKILL.md) in an install. */
export function skillNames(root) {
  try {
    return readdirSync(path.join(root, 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(root, 'skills', d.name, 'SKILL.md')))
      .map((d) => d.name).sort();
  } catch { return []; }
}

/**
 * What the update lost that we use. Only counts what the old version had, so a
 * card configured for a skill the plugin never shipped doesn't block every update.
 */
export function lostPieces({ oldRoot, newRoot, skills, scripts }) {
  const before = new Set(skillNames(oldRoot));
  const after = new Set(skillNames(newRoot));
  const lostSkills = skills.filter((s) => before.has(s) && !after.has(s));
  const lostScripts = scripts.filter((s) => existsSync(path.join(oldRoot, s)) && !existsSync(path.join(newRoot, s)));
  const added = [...after].filter((s) => !before.has(s));
  return { lostSkills, lostScripts, added };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } };

/** Whether any running process still has this path on its command line (an orphaned pip, say). */
async function inUse(dir) {
  const res = await run('pgrep', ['-f', dir]);
  return res.code === 0 && res.out.trim() !== '';
}

/**
 * What a killed claude-seo setup leaves behind: its .setup.lock (refuses the
 * next setup for a while) and its .venv.next-<pid> staging folder. Only what
 * no running process owns is removed; the live .venv is never touched.
 */
export async function clearSetupLeftovers(dataDir = SEO_DATA) {
  const removed = [];
  let entries = [];
  try { entries = readdirSync(dataDir); } catch { return removed; }
  for (const name of entries) {
    const m = name.match(/^\.venv\.next-(\d+)$/);
    if (!m) continue;
    const dir = path.join(dataDir, name);
    if (alive(Number(m[1])) || await inUse(dir)) continue;
    await rm(dir, { recursive: true, force: true });
    removed.push(name);
  }
  const lock = path.join(dataDir, '.setup.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8').split('\n')[0]);
    const staging = path.join(dataDir, `.venv.next-${pid}`);
    if (!(pid && alive(pid)) && !(existsSync(staging) && await inUse(staging))) {
      await rm(lock, { force: true });
      removed.push('.setup.lock');
    }
  }
  return removed;
}

/** Packages pip has installed so far into the newest staging venv, for the progress line. */
function stagedPackages(dataDir = SEO_DATA) {
  try {
    const staged = readdirSync(dataDir).filter((n) => n.startsWith('.venv.next-')).sort().pop();
    if (!staged) return null;
    const lib = path.join(dataDir, staged, 'lib');
    const py = readdirSync(lib).find((n) => n.startsWith('python'));
    return readdirSync(path.join(lib, py, 'site-packages')).filter((n) => n.endsWith('.dist-info')).length;
  } catch { return null; }
}

/**
 * KB the setup has on disk so far: its staging venvs, the Chromium folder, and
 * the half-finished downloads pip and Playwright keep in the temp folder. It grows while anything downloads or installs, so a flat number
 * means the setup is stuck rather than slow.
 */
export async function setupKB(dataDir = SEO_DATA, tmp = os.tmpdir()) {
  const paths = [];
  const add = (dir, keep) => {
    try { for (const n of readdirSync(dir)) if (keep(n)) paths.push(path.join(dir, n)); } catch { /* missing */ }
  };
  add(dataDir, (n) => n.startsWith('.venv.next-') || n === 'ms-playwright');
  add(tmp, (n) => n.startsWith('pip-') || n.startsWith('playwright'));
  if (!paths.length) return 0;
  const res = await run('du', ['-sk', ...paths], { timeoutMs: 60000 });
  return res.out.split('\n').reduce((sum, l) => sum + (Number(l.split('\t')[0]) || 0), 0);
}

/**
 * The claude-seo Python runtime, built for one install (memory: python3.12 +
 * prebuilt cryptography). It builds in a staging folder and only replaces the
 * live .venv on success, so a failure here leaves the old runtime as it was.
 *
 * No fixed short limit: on 2026-11-21 PyPI ran at 34-43 KB/s and 2.6.2 also
 * needed a new Chromium (playwright 1.65), so even 90 minutes was too little
 * for a setup that was downloading the whole time. It is stopped only when
 * nothing has grown for SEO_SETUP_STALL_MINUTES, or at the SEO_SETUP_MINUTES cap.
 */
async function seoSetup(root, log = async () => {}) {
  const env = { CLAUDE_PLUGIN_ROOT: root, CLAUDE_PLUGIN_DATA: SEO_DATA, PIP_ONLY_BINARY: 'cryptography' };
  if (existsSync(SEO_PYTHON)) env.CLAUDE_SEO_PYTHON = SEO_PYTHON;
  const cleared = await clearSetupLeftovers();
  if (cleared.length) await log(`cleared a killed setup's leftovers: ${cleared.join(', ')}`);
  const started = Date.now();
  const startKB = await setupKB();
  let lastKB = startKB;
  let lastAt = started;
  const progress = setInterval(() => {
    const n = stagedPackages();
    const kb = lastKB;
    const rate = Math.max(0, kb - startKB) / Math.max(1, (lastAt - started) / 1000);
    log(`runtime setup ${Math.round((Date.now() - started) / MIN)} min in, ${Math.round((kb - startKB) / 1024)} MB fetched (~${Math.round(rate)} KB/s)${n == null ? '' : `, ${n} packages installed so far`}`).catch(() => {});
  }, 5 * MIN);
  const measure = async () => { lastKB = await setupKB(); lastAt = Date.now(); return lastKB; };
  let res;
  try {
    res = await run(path.join(root, 'scripts/claude-seo'), ['setup'], {
      env, cwd: os.tmpdir(), timeoutMs: SETUP_MINUTES * MIN, killTree: true,
      stallMs: STALL_MINUTES * MIN, progress: measure,
    });
  } finally {
    clearInterval(progress);
  }
  if (res.code !== 0) {
    // A timeout stops the whole tree; give it a moment, then clear what it left.
    await new Promise((r) => setTimeout(r, 12000));
    await clearSetupLeftovers();
    return { ok: false, reason: tail(res.err || res.out, 400) };
  }
  // Ready means a tool actually runs, not just that setup exited 0.
  const probe = await run(path.join(root, 'scripts/claude-seo'), ['run', 'drift_history.py', 'https://example.com/'], { env, cwd: os.tmpdir(), timeoutMs: 2 * MIN });
  const out = `${probe.out}\n${probe.err}`;
  // Setup exited 0, so the new runtime is live either way.
  if (/not ready/i.test(out)) return { ok: false, replaced: true, reason: 'setup finished but the runtime still reports not ready' };
  return { ok: true, replaced: true };
}

/** Last JSON object in some text. */
export function lastJson(text) {
  const lines = String(text || '').trim().split('\n').reverse();
  for (const l of lines) {
    const s = l.indexOf('{');
    if (s < 0) continue;
    try { return JSON.parse(l.slice(s, l.lastIndexOf('}') + 1)); } catch { /* keep looking */ }
  }
  return null;
}

const SMOKE_POST = `---
title: "How often should a small business post on Instagram"
description: "A practical posting rhythm for small business Instagram accounts, with what to post and how to measure it."
date: 2026-11-01
author: "Hyphening Media"
---

# How often should a small business post on Instagram

Most small businesses do best with three to five feed posts a week and a few stories each day. That rhythm is enough to stay visible without running out of ideas.

## Why consistency beats volume

An account that posts four times a week, every week, usually grows faster than one that posts daily for a month and then stops. People follow accounts they can rely on.

## What to post

- Behind the scenes of how the work gets done
- Answers to questions customers ask
- Results, with permission from the customer

## How to measure it

Look at saves and shares per post, not just likes. A post people save is one they found useful. Check the numbers monthly and keep what works.

## Summary

Pick a rhythm you can keep, post useful things, and measure saves and shares. Read our [guide to content calendars](/blog/content-calendar) for a template.
`;

/** One real run of the new version. Resolves { ok, detail }. */
export async function smokeCheck(job, root) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'plugin-smoke-'));
  try {
    if (job.plugin === 'claude-blog') {
      if (!existsSync(BLOG_PYTHON)) return { ok: false, detail: `no blog Python at ${BLOG_PYTHON}` };
      const file = path.join(dir, 'post.md');
      await writeFile(file, SMOKE_POST, 'utf8');
      // Threshold 1: only the score matters here, and 2.3.2 refuses anything below 1.
      const res = await run(BLOG_PYTHON, ['-I', path.join(root, 'scripts/quality_gate.py'), '--format', 'json', '--threshold', '1', file], { cwd: dir, timeoutMs: 5 * MIN });
      try {
        const score = JSON.parse(res.out).checked?.[0]?.score;
        return Number.isFinite(score) ? { ok: true, detail: `quality gate scored the sample post ${Math.round(score)}` } : { ok: false, detail: 'quality gate returned no score' };
      } catch { return { ok: false, detail: `quality gate gave no JSON: ${tail(res.err || res.out, 300)}` }; }
    }
    if (job.plugin === 'claude-ads') {
      const out = await runClaude({
        bin: CLAUDE_BIN, model: MODEL, cwd: dir, allowedTools: 'Skill,Read,Glob,Grep', timeoutMs: 10 * MIN,
        prompt: 'Use the `ads-math` skill from the claude-ads plugin. A product sells for 100 at a 40% gross margin. '
          + 'What is the break-even CPA? Answer with one line of JSON as the last line: {"ok": true, "break_even_cpa": <number>, "skill_used": "<name>"}',
      });
      const j = lastJson(out);
      const v = Number(j?.break_even_cpa);
      return Math.abs(v - 40) < 1.01 ? { ok: true, detail: `ads-math gave break-even CPA ${v}` } : { ok: false, detail: `ads-math gave ${j ? JSON.stringify(j) : tail(out, 200)}` };
    }
    // claude-seo: the technical card on our own site, with the runtime in use.
    const out = await runClaude({
      bin: CLAUDE_BIN, model: MODEL, cwd: dir, permissionMode: 'bypassPermissions', timeoutMs: 25 * MIN,
      prompt: `Run \`/seo technical ${job.smoke_url}\` with the claude-seo plugin. This is a smoke check of a plugin update, so keep it short. `
        + 'Use the plugin\'s own scripts (its launcher, scripts/claude-seo run ...) for at least one check. '
        + 'If any tool says the runtime is not ready, say so. '
        + 'End with one line of JSON as the last line: {"ok": true, "score": <0-100>, "runtime_ready": <true|false>, "scripts_run": ["<name>"]}',
    });
    const j = lastJson(out);
    if (!j || !Number.isFinite(Number(j.score))) return { ok: false, detail: `no score from /seo technical: ${tail(out, 200)}` };
    if (j.runtime_ready === false) return { ok: false, detail: 'the SEO runtime reported not ready during the run' };
    return { ok: true, detail: `/seo technical scored ${job.smoke_url} ${j.score}; scripts: ${(j.scripts_run || []).join(', ') || 'none listed'}` };
  } catch (err) {
    return { ok: false, detail: err.message.slice(0, 300) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------ one update

export async function updatePlugin(job, { hookFn = hook } = {}) {
  const lines = [];
  const log = async (s) => {
    const l = `${new Date().toISOString().slice(11, 19)} ${s}`;
    lines.push(l);
    console.log(`[plugins] #${job.update_id} ${l}`);
    try { await hookFn('plugin_update_log', { update_id: job.update_id, log: l }); } catch { /* a lost line must not stop the update */ }
  };
  const finish = async (status, extra = {}) => {
    await hookFn('finish_plugin_update', { update_id: job.update_id, status, log: lines.join('\n'), ...extra });
    try { await appendNightReport(`PLUGIN ${job.plugin} ${status.toUpperCase()}${extra.to_version ? ` · ${extra.to_version}` : ''}${extra.error ? ` · ${extra.error}` : ''}`); } catch { /* vault offline */ }
    return { status, ...extra };
  };

  const before = installedPlugin(job.install_id);
  if (!before) return finish('failed', { error: `${job.install_id} is not installed on this Mac` });
  await log(`installed ${before.version}; updating towards ${job.target_version}`);

  const backup = `${INSTALLED_FILE}.bak-update-${job.update_id}`;
  await copyFile(INSTALLED_FILE, backup);

  const mk = await run(CLAUDE_BIN, ['plugin', 'marketplace', 'update', job.marketplace], { timeoutMs: 5 * MIN });
  if (mk.code !== 0) return finish('failed', { error: `marketplace update failed: ${tail(mk.err || mk.out, 300)}` });
  const up = await run(CLAUDE_BIN, ['plugin', 'update', job.install_id, '--scope', 'user', '--json'], { timeoutMs: 10 * MIN });
  const upJson = lastJson(up.out);
  if (up.code !== 0) {
    // Refused before installing (e.g. a declared command a person must accept): nothing changed.
    const now = installedPlugin(job.install_id);
    if (!now || now.version === before.version) return finish('failed', { error: `claude plugin update refused: ${tail(upJson ? JSON.stringify(upJson) : (up.err || up.out), 300)}` });
  }

  const after = installedPlugin(job.install_id);
  if (!after || after.version === before.version) return finish('failed', { error: `still on ${before.version} after the update (the marketplace may not have the release yet)` });
  await log(`now on ${after.version}`);

  // Whether the new runtime replaced the live one. Setup builds in a staging
  // folder, so until it succeeds the old runtime is untouched and a rollback
  // has nothing to rebuild (rebuilding then only fought the killed setup's lock).
  let runtimeReplaced = false;
  const rollback = async (why) => {
    await log(`rolling back to ${before.version}: ${why}`);
    await copyFile(backup, INSTALLED_FILE);
    if (job.plugin === 'claude-seo' && !runtimeReplaced) {
      await log('the runtime was not replaced, so the old one is still in place');
    } else if (job.plugin === 'claude-seo') {
      const s = await seoSetup(before.installPath, log);
      await log(s.ok ? `runtime rebuilt for ${before.version}` : `runtime rebuild for ${before.version} failed: ${s.reason}`);
    }
    return finish('rolled_back', { to_version: before.version, error: why });
  };

  try {
    return await checkAndFinish();
  } catch (err) {
    return rollback(`crashed: ${err.message}`.slice(0, 400));
  }

  async function checkAndFinish() {
  const lost = lostPieces({ oldRoot: before.installPath, newRoot: after.installPath, skills: job.required_skills || [], scripts: job.required_scripts || [] });
  if (lost.added.length) await log(`new skills: ${lost.added.join(', ')}`);
  if (lost.lostSkills.length || lost.lostScripts.length) {
    return rollback(`the new version drops what our workers call: ${[...lost.lostSkills, ...lost.lostScripts].join(', ')}`);
  }
  await log(`all ${(job.required_skills || []).length} skills and ${(job.required_scripts || []).length} scripts our workers call are still there`);

  if (job.plugin === 'claude-seo') {
    await log(`rebuilding the claude-seo Python runtime (several minutes; on a slow link it keeps going while downloads progress, up to ${SETUP_MINUTES} min)`);
    const s = await seoSetup(after.installPath, log);
    runtimeReplaced = !!s.replaced;
    if (!s.ok) return rollback(`runtime setup failed: ${s.reason}`);
    await log('runtime ready');
  }

  await log('smoke check');
  const smoke = await smokeCheck(job, after.installPath);
  if (!smoke.ok) return rollback(`smoke check failed: ${smoke.detail}`);
  await log(`smoke check passed: ${smoke.detail}`);

  if (job.plugin === 'claude-seo' && job.drift_urls?.length) {
    let ok = 0;
    for (const url of job.drift_urls) {
      const r = await recaptureDriftBaseline(url, after.installPath);
      if (r.ok) ok++; else await log(`drift baseline for ${url} not captured: ${r.reason}`);
    }
    await log(`drift baselines re-captured: ${ok}/${job.drift_urls.length}`);
  }

  return finish('updated', { to_version: after.version });
  }
}

// ------------------------------------------------------------ main

async function main() {
  const res = await hook('claim_plugin_updates', { worker: WORKER });
  const data = res.data || {};
  if (data.held) console.log(`[plugins] updates held: ${data.held}`);
  const jobs = data.jobs || [];
  if (data.status_due && !jobs.length) await reportStatus(data.plugins || []);
  for (const job of jobs) {
    try {
      await updatePlugin(job);
    } catch (err) {
      console.error(`[plugins] #${job.update_id} crashed:`, err);
      try { await hook('finish_plugin_update', { update_id: job.update_id, status: 'failed', error: `worker crashed: ${err.message}`.slice(0, 900) }); } catch { /* server unreachable */ }
    }
  }
  if (jobs.length) await reportStatus(data.plugins || []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[plugins] worker failed:', err.message); process.exit(1); });
}
