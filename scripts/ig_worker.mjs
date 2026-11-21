#!/usr/bin/env node
/**
 * Reel Lab worker.
 *
 * Claims queued Reel Lab runs (claim_reel_lab_runs), has headless Claude write
 * five hooks, a script, on-screen text and a caption with the vendored
 * instagram-agent skills (plugins/instagram-agent), then runs the skills'
 * Python checks itself (hookscore, beats, caption, humanize, detect) and posts
 * the result back (submit_reel_lab_result). Our checks, not the model's word
 * for them. It never posts to Instagram; staff pick a hook in the Script
 * Tracker and that makes a Draft script.
 *
 * Same pull model and HMAC channel as blog_worker.mjs. The Mac connector
 * starts it (`--once`) when someone clicks "From viral reel" or "Improve hooks".
 *
 *   HYPHENING_API_URL      Ops Center base URL                  (required, see scripts/lib/hook.mjs)
 *   HYPHENING_HMAC_SECRET  shared webhook secret                (required)
 *   IG_WORKER_ID           name in the logs                     (default hostname)
 *   IG_CLAUDE_BIN          Claude CLI binary                    (default 'claude')
 *   IG_MODEL               model that writes the reel           (default claude-sonnet-5-5)
 *   IG_PYTHON              Python 3 for the skills' tools       (default 'python3')
 *   IG_TIMEOUT_MINUTES     one run's Claude call                (default 12)
 *
 * Usage:
 *   node scripts/ig_worker.mjs --once     # drain the queue and exit (it always does)
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { hook } from './lib/hook.mjs';
import { run } from './lib/proc.mjs';
import { buildPrompt, filterHooks, parseDraft, dropExcluded, assembleResult, describeCleanup } from './lib/reelLab.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PLUGIN = path.join(REPO, 'plugins/instagram-agent');
const SKILLS = path.join(PLUGIN, 'skills');

const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;
const WORKER = process.env.IG_WORKER_ID || os.hostname();
const CLAUDE_BIN = process.env.IG_CLAUDE_BIN || 'claude';
const MODEL = process.env.IG_MODEL || 'claude-sonnet-5-5';
const PYTHON = process.env.IG_PYTHON || 'python3';
const CLAUDE_TIMEOUT_MS = (Number(process.env.IG_TIMEOUT_MINUTES) || 12) * 60 * 1000;
// Files and folders only: the model reads the skills and writes result.json.
const ALLOWED_TOOLS = 'Read,Write,Edit,Glob,Grep';

if (!SECRET) {
  console.error('[ig-worker] HYPHENING_HMAC_SECRET is not set. Every request would 401.');
  process.exit(1);
}

async function log(runId, line) {
  console.log(`[ig-worker] #${runId} ${line}`);
  try { await hook('reel_lab_log', { run_id: runId, log: line }); } catch { /* a lost log line must not kill the run */ }
}

/**
 * One of the skills' Python tools on stdin, JSON out. Isolated mode: nothing
 * is imported from the cwd. caption.py and detect.py exit 1 for a verdict that
 * is not a pass, so exit 1 with JSON on stdout is a result, not a crash.
 */
async function py(script, args, input) {
  const res = await run(PYTHON, ['-I', path.join(SKILLS, script), ...args, '--json'], { input, timeoutMs: 60_000 });
  if (res.code === 0 || res.code === 1) {
    try { return JSON.parse(res.out); } catch { /* reported below */ }
  }
  throw new Error(`${script} exited ${res.code}: ${(res.err || res.out).trim().slice(-300)}`);
}

/** The skill files the model reads, copied into its working directory (hooks.json filtered for the profile). */
async function stageSkills(dir, profile, healthcare) {
  for (const f of ['ig-reel/SKILL.md', 'ig-caption/SKILL.md', 'ig-human/SKILL.md']) {
    await mkdir(path.join(dir, 'skills', path.dirname(f)), { recursive: true });
    await copyFile(path.join(SKILLS, f), path.join(dir, 'skills', f));
  }
  const hooksJson = JSON.parse(await readFile(path.join(SKILLS, 'ig-reel/hooks.json'), 'utf8'));
  await writeFile(path.join(dir, 'skills/ig-reel/hooks.json'), JSON.stringify(filterHooks(hooksJson, healthcare, profile), null, 2), 'utf8');
}

/** humanize.py on one text; falls back to the original if the line count changed (beats are per line). */
async function humanize(text) {
  if (!text?.trim()) return { text, report: {} };
  const out = await py('ig-human/humanize.py', ['-'], text);
  const cleaned = out.text.replace(/\n$/, '');
  if (cleaned.split('\n').length !== text.split('\n').length) return { text, report: {} };
  return { text: cleaned, report: out.report || {} };
}

/** The checks staff see: everything cleaned first, then scored. */
async function checkDraft(draft, job) {
  const cleaned = [];
  const keep = (report) => cleaned.push(...describeCleanup(report));

  const hookText = await humanize(draft.hooks.map((h) => h.spoken.replace(/\n/g, ' ')).join('\n'));
  keep(hookText.report);
  hookText.text.split('\n').forEach((line, i) => { draft.hooks[i].spoken = line.trim() || draft.hooks[i].spoken; });

  const body = await humanize(draft.body.join('\n'));
  keep(body.report);
  draft.body = body.text.split('\n').map((l) => l.trim()).filter(Boolean);

  const caption = await humanize(draft.caption.text || '');
  keep(caption.report);
  draft.caption.text = caption.text;

  const scores = await py('ig-reel/hookscore.py', ['-'], `${draft.hooks.map((h) => h.spoken).join('\n')}\n`);
  const target = Number.isFinite(draft.target_seconds) ? Math.min(Math.max(draft.target_seconds, 10), 90) : 30;
  const beats = [];
  for (const h of draft.hooks) beats.push(await py('ig-reel/beats.py', ['-', '--target', String(target)], `${[h.spoken, ...draft.body].join('\n')}\n`));
  const captionCheck = draft.caption.text
    ? await py('ig-caption/caption.py', ['-', ...(job.search_keywords?.length ? ['--keywords', job.search_keywords.join(',')] : [])], draft.caption.text)
    : null;
  const human = await py('ig-human/detect.py', ['-'], `${draft.body.join('\n')}\n\n${draft.caption.text || ''}`);
  return { scores, beats, caption: captionCheck, human, cleaned };
}

async function runJob(job, healthcare) {
  const started = Date.now();
  const name = job.client?.name || `client ${job.client?.id}`;
  const fail = async (error) => {
    await log(job.run_id, `Failed: ${error}`);
    await hook('fail_reel_lab_run', { run_id: job.run_id, error });
  };
  if (!job.client?.is_active) return fail('client is not active');

  const dir = await mkdtemp(path.join(os.tmpdir(), 'reel-lab-'));
  try {
    await stageSkills(dir, job.compliance_profile, healthcare);
    await log(job.run_id, `Writing ${job.mode === 'improve' ? 'new hooks' : 'a reel'} for ${name} with ${MODEL}${job.compliance_profile === 'healthcare' ? ' (healthcare rules)' : ''}.`);

    const res = await run(CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', MODEL, '--allowedTools', ALLOWED_TOOLS],
      { input: buildPrompt(job, { healthcare }), timeoutMs: CLAUDE_TIMEOUT_MS, cwd: dir, killTree: true });
    if (res.code !== 0) return fail(`claude exited ${res.code}: ${(res.err || res.out).trim().slice(-400)}`);

    let raw;
    try { raw = await readFile(path.join(dir, 'result.json'), 'utf8'); } catch {
      return fail(`the run did not write result.json. Last output: ${res.out.trim().slice(-300)}`);
    }
    const parsed = parseDraft(raw);
    if (parsed.error) return fail(parsed.error);
    const { hooks, dropped } = dropExcluded(parsed.draft.hooks, healthcare, job.compliance_profile);
    if (!hooks.length) return fail('every hook used a formula excluded for healthcare clients');
    const draft = { ...parsed.draft, hooks };

    await log(job.run_id, `Draft written (${draft.hooks.length} hooks, ${draft.body.length} lines). Running the checks...`);
    const checks = await checkDraft(draft, job);
    const result = assembleResult(draft, { ...checks, dropped });

    await hook('submit_reel_lab_result', { run_id: job.run_id, model: MODEL, result });
    const top = result.hooks[0];
    await log(job.run_id, `Done in ${Math.round((Date.now() - started) / 1000)} s. Best hook ${top.score ?? '?'} ${top.verdict}, human score ${result.human?.score ?? '?'} ${result.human?.verdict || ''}.`);
  } catch (err) {
    try { await fail(err.message.slice(0, 1000)); } catch (inner) {
      console.error(`[ig-worker] #${job.run_id} could not report its own failure: ${inner.message}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const healthcare = JSON.parse(await readFile(path.join(PLUGIN, 'healthcare.json'), 'utf8'));
  console.log(`[ig-worker] ${WORKER}, model ${MODEL}`);
  let handled = 0;
  for (;;) {
    const res = await hook('claim_reel_lab_runs', { worker_id: WORKER, limit: 1 });
    const runs = res?.data?.runs || [];
    if (runs.length === 0) break;
    for (const job of runs) {
      handled++;
      await runJob(job, healthcare);
    }
  }
  console.log(`[ig-worker] Handled ${handled} run(s).`);
}

main().catch((err) => { console.error('[ig-worker] Fatal:', err); process.exit(1); });
