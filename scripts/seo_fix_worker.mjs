#!/usr/bin/env node
/**
 * Night SEO fix worker (master plan Phase 6). Runs on the Mac, started by the
 * connector after Boothroyd's 03:30 IST routine queues fix batches.
 *
 * For each client batch:
 *   1. Read the repo's deploy manifest. No valid manifest, or night fixes off → audits only.
 *   2. Make a separate git worktree from origin/<branch>. The repo's own working
 *      folder (and anyone's uncommitted edits in it) is never touched.
 *   3. Claude sorts the open recommendations: safe (fix it), needs_007, not_code.
 *   4. Each safe one (8 at most): Claude edits files (Read/Edit/Write/Glob/Grep only,
 *      no shell, no web), then the worker checks the edited files are on the
 *      manifest's allow-list and runs the manifest's checks. Pass → one commit.
 *      Fail → the change is undone and the recommendation marked failed.
 *   5. The commits stay on the local branch seo/night-<date>-<batch>. Nothing is
 *      pushed; 007's Deploy button does that (scripts/deploy_worker.mjs).
 *
 *   SEO_FIX_CLAUDE_BIN  Claude CLI binary (default 'claude')
 *   SEO_FIX_MODEL       model (default claude-sonnet-5-5)
 *   VAULT_DIR           vault root, for the night report
 *
 *   node scripts/seo_fix_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { mkdtemp, rm, symlink, readdir, appendFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { hook } from './lib/hook.mjs';
import { run, git, sh, tail, extractJson } from './lib/proc.mjs';
import { loadManifest, fixMayTouch } from './lib/deployManifest.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_BIN = process.env.SEO_FIX_CLAUDE_BIN || 'claude';
const MODEL = process.env.SEO_FIX_MODEL || 'claude-sonnet-5-5';
const WORKER = os.hostname();
const VAULT = process.env.VAULT_DIR || '/Volumes/Mac Valhalla/Vault';
const NIGHT_REPORT = path.join(VAULT, 'Companies/Hyphening/Docs/Hyphening - Night Report.md');
const TRIAGE_TIMEOUT_MS = 10 * 60 * 1000;
const FIX_TIMEOUT_MS = 12 * 60 * 1000;
const BRANCH_KEEP_DAYS = 7;

export const SAFE_LIST = [
  'meta titles and meta descriptions',
  'heading structure (one H1, heading order, heading wording that only adds the page\'s own keyword)',
  'image alt text',
  'internal links between existing pages (adding or fixing them)',
  'structured data / JSON-LD schema',
  'sitemap.xml and robots.txt',
  'canonical and hreflang tags',
  'broken links (fix or remove the link)',
  'image dimensions, lazy loading and other image attributes',
  'Open Graph and Twitter card tags',
];

async function appendNightReport(line) {
  try {
    if (!existsSync(NIGHT_REPORT)) {
      await writeFile(NIGHT_REPORT, '---\ntype: night-report\ncompany: "Hyphening"\n---\n# Hyphening: night report\n\n'
        + 'Appended by the night workers, newest at the bottom. Do not hand-edit.\n\n', 'utf8');
    }
    await appendFile(NIGHT_REPORT, `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${line}\n`, 'utf8');
  } catch (err) {
    console.error(`[seo-fix] Could not write the night report: ${err.message}`);
  }
}

/** node_modules from the real repo, linked into the worktree so the checks can build. */
async function linkNodeModules(repo, wt) {
  const linked = [];
  const dirs = [''];
  for (const e of await readdir(repo, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && existsSync(path.join(repo, e.name, 'package.json'))) dirs.push(e.name);
  }
  for (const d of dirs) {
    const from = path.join(repo, d, 'node_modules');
    const to = path.join(wt, d, 'node_modules');
    if (existsSync(from) && existsSync(path.join(wt, d)) && !existsSync(to)) {
      await symlink(from, to, 'dir');
      linked.push(path.join(d, 'node_modules'));
    }
  }
  return linked;
}

/** Files changed in the worktree, minus our node_modules links. */
async function changedFiles(wt, linked) {
  // -z: NUL-separated and unquoted, and read raw: trimming would eat the
  // leading space of the first status code and shift every path by a letter.
  const res = await run('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: wt });
  if (res.code !== 0) throw new Error(`git status failed: ${tail(res.err, 300)}`);
  const entries = res.out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    files.push(entries[i].slice(3));
    if (code[0] === 'R' || code[0] === 'C') i++; // a rename's old path follows; skip it
  }
  return files
    .filter((f) => !linked.some((l) => f === l || f.startsWith(`${l}/`)));
}

async function undo(wt, linked) {
  await git(wt, ['reset', '--hard', 'HEAD']);
  await git(wt, ['clean', '-fd', ...linked.flatMap((l) => ['-e', l])]);
}

function triagePrompt(job, manifest) {
  return [
    `You are sorting SEO recommendations for ${job.client.name} (${job.client.website_url}). The site's code is in the current folder.`,
    'Read the code as needed (you can only read), then sort EVERY recommendation below into one of:',
    `- "safe": a code change that is ONLY one of these, small, and inside the allowed files: ${SAFE_LIST.join('; ')}.`,
    '- "needs_007": a site change that is outside that list or risky: wording or copy changes, medical/health/price/legal claims, design or layout, new pages, deleting content, rendering or framework changes, anything large (roughly over 60 changed lines), or anything that needs files outside the allowed list.',
    '- "not_code": not a change to this site\'s code at all: analytics or Search Console settings, Google Business Profile, backlinks, content strategy or new articles, monitoring, or something already true in the code.',
    `Allowed files: ${manifest.seo_fixes.paths.join(', ')}. Never: ${(manifest.seo_fixes.never_touch || []).join(', ') || '(none listed)'}.`,
    job.client.blog_compliance_profile === 'healthcare' ? 'This is a healthcare client: anything touching health claims is "needs_007".' : '',
    'Give each a one-line reason a busy owner understands.',
    '',
    'Recommendations (JSON):',
    JSON.stringify(job.candidates.map((c) => ({ id: c.id, priority: c.priority, audit: c.audit_type, metric: c.metric, issue: c.issue, action: c.action_required, page: c.page_url }))),
    '',
    'Answer with the list only, between <json> and </json>:',
    '<json>[{"id": 123, "triage": "safe", "reason": "..."}]</json>',
  ].filter((s) => s !== '').join('\n');
}

function fixPrompt(job, manifest, rec) {
  return [
    `Make one SEO fix in this website's code (${job.client.name}, ${job.client.website_url}). The code is in the current folder.`,
    '',
    `Recommendation #${rec.id} (${rec.priority}, from the ${rec.audit_type} audit):`,
    `- Metric: ${rec.metric}`,
    `- Issue: ${rec.issue}`,
    `- Action: ${rec.action_required}`,
    rec.page_url ? `- Page: ${rec.page_url}` : '',
    rec.fix_approved ? '- 007 approved this change himself ("Fix tonight"), so it may go beyond the usual safe list, but keep it as small as the recommendation allows.' : `- It is on the safe list: ${SAFE_LIST.join('; ')}. Stay inside that.`,
    '',
    'Rules:',
    `- Edit ONLY these files or folders: ${manifest.seo_fixes.paths.join(', ')}. Never: ${['.env', ...(manifest.seo_fixes.never_touch || [])].join(', ')}. Edits anywhere else are thrown away and the fix fails.`,
    '- Make the smallest change that does the job. Don\'t reformat, reorder or "tidy" anything else.',
    '- Don\'t change claims, prices, legal text, medical wording or design. Don\'t invent facts, numbers, reviews or addresses.',
    '- If the code already does what the recommendation asks, or you can\'t do it within these rules, change nothing and say why.',
    job.client.blog_compliance_profile === 'healthcare' ? '- Healthcare client: no health or outcome claims of any kind.' : '',
    '',
    'When done, answer between <json> and </json>:',
    '<json>{"changed": true, "summary": "what changed, before → after, in one or two plain sentences"}</json>',
  ].filter((s) => s !== '').join('\n');
}

async function claude(prompt, cwd, tools, timeoutMs) {
  return run(CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', MODEL, '--allowedTools', tools], { input: prompt, cwd, timeoutMs });
}

/** Delete old night branches; a batch not deployed within a week is gone. */
async function pruneBranches(repo) {
  const out = await git(repo, ['for-each-ref', 'refs/heads/seo/night-', '--format=%(refname:short) %(committerdate:unix)']);
  const cutoff = Date.now() / 1000 - BRANCH_KEEP_DAYS * 86400;
  for (const line of out.split('\n').filter(Boolean)) {
    const [name, ts] = line.split(' ');
    if (Number(ts) < cutoff) await git(repo, ['branch', '-D', name], { allowFail: true });
  }
}

/** One client's night. Returns what was submitted. */
export async function runBatch(job, { claudeFn = claude, hookFn = hook } = {}) {
  const name = job.client.name;
  const repo = job.client.repo_path;
  const fail = async (error) => {
    await hookFn('submit_seo_fix_batch', { batch_id: job.batch_id, status: 'failed', error, fixes: [] });
    await appendNightReport(`SEO FIXES FAILED · ${name} · ${error}`);
    return { status: 'failed', error };
  };

  if (!repo || !existsSync(path.join(repo, '.git'))) return fail(`manifest: the site repo ${repo || '(none)'} is not a git repo on this Mac`);
  const { manifest, errors } = await loadManifest(repo);
  if (errors.length) return fail(`manifest: ${errors.join('; ')}`);
  if (!manifest.seo_fixes?.enabled) return fail('manifest: night fixes are switched off in hyphening.deploy.json');
  if (manifest.client_id !== job.client.id) return fail(`manifest: it is for client ${manifest.client_id}, not ${job.client.id}`);

  await pruneBranches(repo);
  await git(repo, ['fetch', '--quiet', 'origin', manifest.branch]);
  const base = await git(repo, ['rev-parse', `origin/${manifest.branch}`]);
  const branch = `seo/night-${job.night}-${job.batch_id}`;
  const wt = await mkdtemp(path.join(os.tmpdir(), 'seo-night-'));
  await git(repo, ['worktree', 'add', '--quiet', '-b', branch, wt, base]);

  const fixes = [];
  try {
    const linked = await linkNodeModules(repo, wt);

    // 1. Sort.
    const t = await claudeFn(triagePrompt(job, manifest), wt, 'Read,Glob,Grep', TRIAGE_TIMEOUT_MS);
    const sorted = extractJson(t.out);
    if (!Array.isArray(sorted)) throw new Error(`the sort didn't return a list: ${tail(t.out || t.err, 300)}`);
    await hookFn('submit_seo_triage', { batch_id: job.batch_id, results: sorted });
    const triage = new Map(sorted.map((s) => [s.id, s.triage]));
    const todo = job.candidates.filter((c) => c.fix_approved || triage.get(c.id) === 'safe').slice(0, job.max_fixes);

    // 2. Fix, one commit each.
    for (const rec of todo) {
      console.log(`[seo-fix] ${name} #${rec.id} ${rec.metric}`);
      const res = await claudeFn(fixPrompt(job, manifest, rec), wt, 'Read,Edit,Write,Glob,Grep', FIX_TIMEOUT_MS);
      const answer = extractJson(res.out) || {};
      const files = await changedFiles(wt, linked);
      if (files.length === 0) {
        fixes.push({ rec_id: rec.id, ok: false, summary: answer.summary, error: `No change made: ${answer.summary || tail(res.out || res.err, 300)}` });
        continue;
      }
      const outside = files.filter((f) => !fixMayTouch(manifest, f));
      if (outside.length) {
        await undo(wt, linked);
        fixes.push({ rec_id: rec.id, ok: false, summary: answer.summary, error: `Edited files it may not touch: ${outside.join(', ')}` });
        continue;
      }
      let broke = null;
      for (const check of manifest.checks || []) {
        const c = await sh(check, wt);
        if (c.code !== 0) { broke = `"${check}" failed: ${tail(c.err || c.out, 400)}`; break; }
      }
      if (broke) {
        await undo(wt, linked);
        fixes.push({ rec_id: rec.id, ok: false, summary: answer.summary, error: broke });
        continue;
      }
      await git(wt, ['add', '--', ...files]);
      await git(wt, ['commit', '--quiet', '-m', `SEO: ${rec.metric} (#${rec.id})`, '-m', `${answer.summary || ''}\n\nNight SEO fix for recommendation #${rec.id}. Goes live only when 007 presses Deploy.`]);
      const commit = await git(wt, ['rev-parse', 'HEAD']);
      const diff = await git(wt, ['show', '--stat', '--patch', '--format=', 'HEAD']);
      fixes.push({ rec_id: rec.id, ok: true, commit, summary: answer.summary || rec.metric, diff: diff.slice(0, 20000) });
    }
  } catch (err) {
    await git(repo, ['worktree', 'remove', '--force', wt], { allowFail: true });
    await git(repo, ['branch', '-D', branch], { allowFail: true });
    return fail(err.message.slice(0, 800));
  }

  await git(repo, ['worktree', 'remove', '--force', wt], { allowFail: true });
  await rm(wt, { recursive: true, force: true });
  const ok = fixes.filter((f) => f.ok);
  if (ok.length === 0) await git(repo, ['branch', '-D', branch], { allowFail: true });
  await hookFn('submit_seo_fix_batch', {
    batch_id: job.batch_id, status: ok.length ? 'ready' : 'empty', branch: ok.length ? branch : null, base_commit: base, fixes,
  });
  await appendNightReport(`SEO FIXES · ${name} · ${ok.length} ready to deploy${fixes.length - ok.length ? ` · ${fixes.length - ok.length} failed` : ''} (SEO Monitor → Last night)`);
  return { status: ok.length ? 'ready' : 'empty', branch, fixes };
}

async function healthBlocked() {
  const script = path.join(REPO, 'scripts/health-check.sh');
  if (!existsSync(script)) return null;
  const res = await run('bash', [script, '--write']);
  return res.code === 2 ? (res.out.split('\n').find((l) => l.includes('[BLOCKED]')) || 'health check BLOCKED').trim() : null;
}

async function main() {
  console.log(`[seo-fix] ${WORKER}, model ${MODEL}`);
  const res = await hook('claim_seo_fix_batches', { worker: WORKER });
  const batches = res?.data?.batches || [];
  if (batches.length === 0) return console.log('[seo-fix] Nothing queued.');
  const blocked = await healthBlocked();
  for (const job of batches) {
    if (blocked) {
      await hook('submit_seo_fix_batch', { batch_id: job.batch_id, status: 'failed', error: `Health check: ${blocked}`, fixes: [] });
      continue;
    }
    try {
      const r = await runBatch(job);
      console.log(`[seo-fix] ${job.client.name}: ${r.status}`);
    } catch (err) {
      console.error(`[seo-fix] ${job.client.name}: ${err.message}`);
      await hook('submit_seo_fix_batch', { batch_id: job.batch_id, status: 'failed', error: err.message.slice(0, 800), fixes: [] }).catch(() => {});
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[seo-fix] Fatal:', err); process.exit(1); });
}
