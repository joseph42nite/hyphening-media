#!/usr/bin/env node
/**
 * Night site fix worker (master plan Phase 6). Runs on the Mac, started by the
 * connector after Boothroyd's 03:30 IST routine queues fix batches. A batch
 * holds the client's SEO findings and its ads website-code findings (ids
 * 'ads-<n>'): one branch and one Deploy per client, since both change the same
 * site. The manifest's `seo_fixes` section governs both.
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
import { mkdtemp, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { appendNightReport } from './lib/nightReport.mjs';
import { hook } from './lib/hook.mjs';
import { run, git, sh, tail, jsonBetweenTags } from './lib/proc.mjs';
import { loadManifest, fixMayTouch } from './lib/deployManifest.mjs';
import { prepareWorktree } from './lib/worktree.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_BIN = process.env.SEO_FIX_CLAUDE_BIN || 'claude';
const MODEL = process.env.SEO_FIX_MODEL || 'claude-sonnet-5-5';
const WORKER = os.hostname();
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
  // From the Ads Monitor: what lets a lead be tied to the ad that brought it.
  'sending the page URL and the ad click IDs already in it (gclid, gbraid, wbraid, gad_campaignid, utm_*) with a form submission, as hidden fields or in the existing submit code',
  'adding an analytics or conversion tag whose ID the recommendation gives (e.g. a GA4 / Google tag snippet), once, in the shared page head',
];



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
    `You are sorting SEO and paid-ads recommendations for ${job.client.name} (${job.client.website_url}). The site's code is in the current folder.`,
    'Ads recommendations have ids like "ads-12" and an audit starting "ads"; answer with their ids exactly as given.',
    'Read the code as needed (you can only read), then sort EVERY recommendation below into one of these. Only use "already_done" when you have looked at the file and seen it:',
    `- "safe": a code change that is ONLY one of these, small, and inside the allowed files: ${SAFE_LIST.join('; ')}.`,
    '- "code": any other change to this site or app\'s code (it is all in this folder): wording or copy, medical/health/price/legal claims, design or layout, new or merged pages, blog posts, case studies, images, headers, redirects, rendering, anything large (roughly over 60 changed lines), or anything in files outside the allowed list. 007 approves these one by one. If it can be done by editing code, it is "code", not "not_code".',
    '- "already_done": the code already does what it asks (check the actual files; often a fix that was pushed earlier). The reason must say what you found and where, e.g. "index.html already has a 148-character meta description".',
    '- "automatic": nothing for a person to do, because our audits already do it on their own schedule: re-run or re-check this audit later, run PageSpeed/CrUX/URL Inspection, "measure again in N weeks", watch a metric, or advice that only applies if something exists that does not ("add review markup if the page has reviews" when it has none). Also tool or access notes about the audit itself. The reason names what covers it.',
    '- "content": a new article or page to write. Give "keyword": the search phrase the piece should target (2-6 words, lower case). It goes to the Keywords panel, where blog topics are chosen. Changes to existing posts or pages are "code".',
    '- "not_code": ONLY work a person must do outside this code, in an account or place we cannot change from here: Google Business Profile, directory listings and citations, other sites (backlinks, PR), GA4 or Search Console settings (filters, key events, property access, sitemap submission), the ad accounts (keywords, negatives, bids, budgets, conversion actions, assets), or the business itself (lead follow-up, walk-in logging, dashboard settings).',
    `Allowed files: ${manifest.seo_fixes.paths.join(', ')}. Never: ${(manifest.seo_fixes.never_touch || []).join(', ') || '(none listed)'}.`,
    job.client.blog_compliance_profile === 'healthcare' ? 'This is a healthcare client: anything touching health claims is "code", never "safe".' : '',
    job.groups?.length ? `Groups already open for this client (reuse one when it is the same work): ${job.groups.join(', ')}.` : '',
    'Give each a one-line reason a busy owner understands.',
    'For every "not_code" one, also give "area": "offsite" (backlinks, directories, listings, PR), "gbp" (Google Business Profile, reviews), "google" (Search Console or GA4 settings), "ad_account" (done in an ad platform), "business" (done by the client\'s team), or "other". And give "group": a short slug for the piece of work, the SAME slug whenever two recommendations ask for the same thing (e.g. several audits all saying to filter internal traffic in GA4 → "ga4-internal-traffic-filter"), so they show as one task.',
    '',
    'Recommendations (JSON):',
    JSON.stringify(job.candidates.map((c) => ({ id: c.id, priority: c.priority, audit: c.audit_type, metric: c.metric, issue: c.issue, action: c.action_required, page: c.page_url, campaign: c.campaign_name || undefined }))),
    '',
    'Answer with the list only, between <json> and </json>:',
    '<json>[{"id": 123, "triage": "safe", "reason": "..."}, {"id": 124, "triage": "not_code", "area": "google", "group": "ga4-internal-traffic-filter", "reason": "..."}, {"id": 125, "triage": "content", "keyword": "video marketing agency bangalore", "reason": "..."}]</json>',
  ].filter((s) => s !== '').join('\n');
}

function fixPrompt(job, manifest, rec) {
  return [
    `Make one ${rec.fleet === 'ads' ? 'paid-ads' : 'SEO'} fix in this website's code (${job.client.name}, ${job.client.website_url}). The code is in the current folder.`,
    '',
    `Recommendation #${rec.id} (${rec.priority}, from the ${rec.audit_type} audit):`,
    `- Metric: ${rec.metric}`,
    `- Issue: ${rec.issue}`,
    `- Action: ${rec.action_required}`,
    rec.page_url ? `- Page: ${rec.page_url}` : '',
    rec.fix_approved ? '- 007 approved this change himself ("Fix tonight"), so it may go beyond the usual safe list, but keep it as small as the recommendation allows.' : `- It is on the safe list: ${SAFE_LIST.join('; ')}. Stay inside that.`,
    rec.fix_approved && rec.fix_note ? `\n007's instructions for this change (follow them; where they differ from the recommendation above, they win, but the rules below still apply):\n"""\n${rec.fix_note}\n"""` : '',
    '',
    'Rules:',
    `- Edit ONLY these files or folders: ${manifest.seo_fixes.paths.join(', ')}. Never: ${['.env', ...(manifest.seo_fixes.never_touch || [])].join(', ')}. Edits anywhere else are thrown away and the fix fails.`,
    '- Make the smallest change that does the job. Don\'t reformat, reorder or "tidy" anything else.',
    '- Don\'t change claims, prices, legal text, medical wording or design. Don\'t invent facts, numbers, reviews or addresses.',
    '- If the code already does what the recommendation asks, change nothing, answer "already_done": true, and say what you found and where (e.g. "index.html already has a 148-character meta description").',
    '- If you can\'t do it within these rules (it needs other files, copy or design changes, or facts we don\'t have), change nothing, answer "already_done": false, and say what it would need.',
    job.client.blog_compliance_profile === 'healthcare' ? '- Healthcare client: no health or outcome claims of any kind.' : '',
    '',
    'When done, answer between <json> and </json>:',
    '<json>{"changed": true, "summary": "what changed, before → after, in one or two plain sentences"}</json>',
    'or, when you changed nothing:',
    '<json>{"changed": false, "already_done": true, "summary": "what already does it, and where"}</json>',
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
    const linked = await prepareWorktree(repo, wt, manifest);

    // 1. Sort.
    const t = await claudeFn(triagePrompt(job, manifest), wt, 'Read,Glob,Grep', TRIAGE_TIMEOUT_MS);
    const sorted = jsonBetweenTags(t.out);
    if (!Array.isArray(sorted)) throw new Error(`the sort didn't return a list: ${tail(t.out || t.err, 300)}`);
    await hookFn('submit_seo_triage', { batch_id: job.batch_id, results: sorted });
    const triage = new Map(sorted.map((s) => [s.id, s.triage]));
    const todo = job.candidates.filter((c) => c.fix_approved || triage.get(c.id) === 'safe').slice(0, job.max_fixes);

    // 2. Fix, one commit each.
    for (const rec of todo) {
      console.log(`[seo-fix] ${name} #${rec.id} ${rec.metric}`);
      const res = await claudeFn(fixPrompt(job, manifest, rec), wt, 'Read,Edit,Write,Glob,Grep', FIX_TIMEOUT_MS);
      const answer = jsonBetweenTags(res.out) || {};
      const files = await changedFiles(wt, linked);
      if (files.length === 0) {
        // Nothing changed is not a failure: already done, or beyond the safe list
        // (seoNight.submitSeoFixBatch closes it or hands it to 007). Without a
        // clear answer from Claude (it crashed, timed out) it is a failure, and so
        // is one 007 already approved ("Fix tonight") that still couldn't be done.
        const said = typeof answer.already_done === 'boolean' && answer.summary;
        const noChange = !said ? undefined : answer.already_done ? 'already_done' : rec.fix_approved ? undefined : 'blocked';
        fixes.push({
          rec_id: rec.id, ok: false, summary: answer.summary, no_change: noChange,
          error: `No change made: ${answer.summary || tail(res.out || res.err, 300)}`,
        });
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
      const label = rec.fleet === 'ads' ? 'Ads' : 'SEO';
      await git(wt, ['commit', '--quiet', '-m', `${label}: ${rec.metric} (#${rec.id})`, '-m', `${answer.summary || ''}\n\nNight ${label} fix for recommendation #${rec.id}. Goes live only when 007 presses Deploy.`]);
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
  const done = fixes.filter((f) => f.no_change === 'already_done').length;
  const blocked = fixes.filter((f) => f.no_change === 'blocked').length;
  const failed = fixes.length - ok.length - done - blocked;
  await appendNightReport(`SEO FIXES · ${name} · ${ok.length} ready to deploy${failed ? ` · ${failed} failed` : ''}${done ? ` · ${done} already done` : ''}${blocked ? ` · ${blocked} need you` : ''} (Site changes, in the SEO and Ads Monitors)`);
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
