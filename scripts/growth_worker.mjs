#!/usr/bin/env node
/**
 * Growth worker: runs the Client Brain and Outbound monitor cards.
 *
 * Claims queued runs (claim_growth_runs). For each one it writes the client's
 * Brain as .agents/product-marketing.md and the run's facts as job.json into a
 * fresh folder, runs headless Claude with the marketing-skills plugin, reads
 * result.json and posts it back (submit_growth_result), or the reason it
 * couldn't (fail_growth_run). The sending-domain check needs no AI and runs
 * here directly. Nothing is emailed; leads wait for approval in the Outbound tab.
 *
 * Same pull model and HMAC channel as ig_worker.mjs. The Mac connector starts
 * it (`--once`) when someone presses Run.
 *
 *   HYPHENING_API_URL       Ops Center base URL (scripts/lib/hook.mjs)
 *   HYPHENING_HMAC_SECRET   shared webhook secret
 *   GROWTH_WORKER_ID        name in the logs          (default hostname)
 *   GROWTH_CLAUDE_BIN       Claude CLI binary         (default 'claude')
 *
 * Usage: node scripts/growth_worker.mjs --once
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { hook } from './lib/hook.mjs';
import { runClaude } from './lib/proc.mjs';
import { installedPlugin } from './lib/plugins.mjs';
import { buildPrompt, jobFacts, checkResult, checkDomains } from './lib/growthPrompts.mjs';

const WORKER = process.env.GROWTH_WORKER_ID || os.hostname();
const CLAUDE_BIN = process.env.GROWTH_CLAUDE_BIN || 'claude';
const INSTALL_ID = 'marketing-skills@marketingskills';
// Under the server's 45-minute stale limit, so a slow run fails here with a reason.
const TIMEOUT_MIN = { outbound_prospects: 35, brain_build: 20, competitor_research: 20, outbound_replies: 12, outbound_retro: 12 };
const TOOLS = 'Skill,Read,Write,Glob,Grep,WebSearch,WebFetch';

async function log(runId, line) {
  console.log(`[growth] #${runId} ${line}`);
  try { await hook('growth_run_log', { run_id: runId, log: line }); } catch { /* a lost line must not stop the run */ }
}

/** Last JSON object in Claude's reply, if it didn't write result.json. */
function lastJson(text) {
  const s = String(text || '');
  const end = s.lastIndexOf('}');
  for (let start = s.lastIndexOf('{', end); start >= 0; start = s.lastIndexOf('{', start - 1)) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* keep looking */ }
  }
  return null;
}

export async function runJob(job, { hookFn = hook, claude = runClaude, domains = checkDomains } = {}) {
  if (job.card_key === 'outbound_deliverability') {
    const r = await domains(job.outbound?.sending_domains || []);
    return hookFn('submit_growth_result', { run_id: job.run_id, summary: r.summary, result: r });
  }
  if (!installedPlugin(INSTALL_ID)) {
    return hookFn('fail_growth_run', { run_id: job.run_id, error: 'The marketing-skills plugin is not installed on this Mac' });
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), `growth-${job.run_id}-`));
  try {
    await mkdir(path.join(dir, '.agents'), { recursive: true });
    await writeFile(path.join(dir, '.agents/product-marketing.md'), job.brain_markdown || '', 'utf8');
    await writeFile(path.join(dir, 'job.json'), JSON.stringify(jobFacts(job), null, 2), 'utf8');
    await log(job.run_id, `${job.card_key} for ${job.client.name}: running ${job.skills.join(', ')}`);
    const started = Date.now();
    const out = await claude({
      bin: CLAUDE_BIN, model: job.model, cwd: dir, allowedTools: TOOLS,
      timeoutMs: (TIMEOUT_MIN[job.card_key] || 15) * 60 * 1000, prompt: buildPrompt(job),
    });
    let result = null;
    try { result = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8')); } catch { result = lastJson(out); }
    const problem = checkResult(job.card_key, result);
    if (problem) return hookFn('fail_growth_run', { run_id: job.run_id, error: `The run finished without a usable answer: ${problem}` });
    await log(job.run_id, `finished in ${Math.round((Date.now() - started) / 60000)} min`);
    return hookFn('submit_growth_result', { run_id: job.run_id, summary: result.summary || null, result, model: job.model });
  } catch (err) {
    return hookFn('fail_growth_run', { run_id: job.run_id, error: String(err.message || err).slice(0, 900) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  for (;;) {
    const res = await hook('claim_growth_runs', { worker: WORKER, limit: 1 });
    const runs = res.data?.runs || [];
    if (!runs.length) break;
    for (const job of runs) {
      try {
        const r = await runJob(job);
        console.log(`[growth] #${job.run_id} ${r?.message || 'reported'}`);
      } catch (err) {
        console.error(`[growth] #${job.run_id} crashed:`, err.message);
        try { await hook('fail_growth_run', { run_id: job.run_id, error: `worker crashed: ${err.message}`.slice(0, 900) }); } catch { /* server unreachable */ }
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[growth] worker failed:', err.message); process.exit(1); });
}
