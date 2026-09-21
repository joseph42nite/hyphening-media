#!/usr/bin/env node
/**
 * Ads Monitor worker.
 *
 * Pulls queued runs from the Ops Center, runs the matching skill, posts the
 * result back. Runs on whichever machine has the Claude CLI; the Ops Center
 * never reaches into it.
 *
 * The direction matters. A push model needs a tunnel into this machine and
 * loses every job dispatched while it is asleep. Pulling means a worker that
 * was off all morning collects its backlog when it wakes, and nothing has to
 * be reachable from the internet.
 *
 *   HYPHENING_API_URL      Ops Center base URL      (default http://localhost:3000)
 *   HYPHENING_HMAC_SECRET  shared webhook secret    (required)
 *   ADS_WORKER_ID          name in the logs         (default hostname)
 *   ADS_POLL_SECONDS       idle poll interval       (default 30)
 *   ADS_CLAUDE_BIN         Claude CLI binary        (default 'claude')
 *   ADS_MODEL              model override           (default: the run's own)
 *   ADS_PLUGIN_DIR         this plugin's directory  (default: two levels up)
 *
 * Usage:
 *   node ads_worker.mjs            # poll for ever
 *   node ads_worker.mjs --once     # drain the queue once and exit (for cron)
 */

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = process.env.ADS_PLUGIN_DIR || path.resolve(HERE, '..');
const API = (process.env.HYPHENING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;
const WORKER = process.env.ADS_WORKER_ID || os.hostname();
const POLL_MS = (Number(process.env.ADS_POLL_SECONDS) || 30) * 1000;
const CLAUDE_BIN = process.env.ADS_CLAUDE_BIN || 'claude';
const ONCE = process.argv.includes('--once');

if (!SECRET) {
  console.error('[ads-worker] HYPHENING_HMAC_SECRET is not set. Every request would 401.');
  process.exit(1);
}

/** Our agent type -> the skill that serves it. Only 'full' differs, the same
 *  way 'full' -> 'seo-audit' does on the SEO side. */
function skillFor(agentType) {
  return agentType === 'full' ? 'ads-audit' : `ads-${agentType.replace(/_/g, '-')}`;
}

/**
 * Signed webhook call.
 *
 * Signs the exact bytes sent, never a re-serialisation of the parsed body.
 * Re-serialising is how a float of 0.0 becomes 0 and breaks a signature that
 * is otherwise correct — a failure that surfaces as a bare 401 indistinguishable
 * from a wrong secret. The Ops Center verifies against its raw body for the
 * same reason.
 */
async function hook(event_type, payload) {
  const body = JSON.stringify({ event_type, payload });
  const res = await fetch(`${API}/api/openclaw/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openclaw-signature': crypto.createHmac('sha256', SECRET).update(body).digest('hex'),
      'x-openclaw-timestamp': new Date().toISOString(),
      'x-openclaw-nonce': crypto.randomUUID(),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${event_type} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/** Progress line into the dashboard console. Never throws: a run must not die
 *  because a log line could not be delivered. */
async function log(runId, line) {
  console.log(`[ads-worker] #${runId} ${line}`);
  try { await hook('ads_run_log', { run_id: runId, log: line }); } catch { /* ignore */ }
}

/** The prompt: the contract, the references the skill leans on, the skill
 *  itself, and the fact pack. Assembled here rather than left to the CLI's own
 *  skill discovery so the run is reproducible from the files in this repo. */
async function buildPrompt(job) {
  const skill = skillFor(job.agent_type);
  const read = async (p) => readFile(path.join(PLUGIN_DIR, p), 'utf8');

  const [contract, factPackRef, scoring, skillBody] = await Promise.all([
    read('references/contract.md'),
    read('references/fact-pack.md'),
    read('references/scoring.md'),
    read(`skills/${skill}/SKILL.md`),
  ]);

  return [
    '# Contract', contract,
    '# Fact pack reference', factPackRef,
    '# Scoring', scoring,
    '# Your skill', skillBody,
    '# Your run',
    `run_id: ${job.run_id}`,
    `client_id: ${job.client_id}`,
    `agent_type: ${job.agent_type}`,
    `period_month: ${job.period_month}`,
    `facts_hash: ${job.facts_hash}`,
    '# Fact pack',
    '```json', JSON.stringify(job.facts, null, 2), '```',
    '# Reply',
    'Reply with ONE JSON object and nothing else — no prose before it, no code',
    'fence around it. It is the `payload` of a create_ads_audit event, exactly',
    'as the contract specifies. Echo run_id, client_id, agent_type,',
    'period_month and facts_hash back unchanged.',
  ].join('\n\n');
}

/** Runs the CLI and returns its stdout. */
function runClaude(promptFile, model) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text'];
    if (model) args.push('--model', model);

    const proc = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`));
      resolve(out);
    });
    readFile(promptFile, 'utf8').then(text => { proc.stdin.write(text); proc.stdin.end(); }).catch(reject);
  });
}

/**
 * Pulls the JSON object out of the model's reply.
 *
 * Tolerant on purpose. A run costs real tokens, so a reply wrapped in a code
 * fence or trailed by a sentence is worth recovering rather than discarding —
 * as long as recovery is unambiguous. Brace matching, not a regex: a report
 * body legitimately contains braces, and a greedy match would swallow them.
 */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidates = fenced ? [fenced[1], text] : [text];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

async function runJob(job) {
  const started = Date.now();
  await log(job.run_id, `Starting ${skillFor(job.agent_type)} for ${job.client_name} (${job.period_month}). Sections: ${job.facts.sections_included?.join(', ') || 'none'}.`);

  const dir = await mkdtemp(path.join(tmpdir(), 'ads-run-'));
  const promptFile = path.join(dir, 'prompt.md');

  try {
    await writeFile(promptFile, await buildPrompt(job), 'utf8');
    const raw = await runClaude(promptFile, process.env.ADS_MODEL || job.model || null);
    const parsed = extractJson(raw);

    if (!parsed) {
      // Reported as a failure rather than retried. A reply we cannot parse is
      // usually a refusal or a truncation, and re-running it spends the same
      // tokens for the same result.
      await hook('create_ads_audit', {
        run_id: job.run_id, client_id: job.client_id, agent_type: job.agent_type,
        period_month: job.period_month, facts_hash: job.facts_hash,
        status: 'error',
        error: 'The model reply contained no parsable JSON object.',
        summary: raw.slice(0, 1000),
      });
      await log(job.run_id, 'Failed: no JSON in the reply.');
      return;
    }

    // Identity is ours to assert, not the model's. A reply that renamed its own
    // agent_type would otherwise be stored against the wrong card — and the Ops
    // Center's mismatch guard would fail the run, losing work that was fine.
    const payload = {
      ...parsed,
      run_id: job.run_id,
      client_id: job.client_id,
      agent_type: job.agent_type,
      period_month: job.period_month,
      facts_hash: job.facts_hash,
      token_usage: {
        ...(parsed.token_usage || {}),
        model: parsed.token_usage?.model || process.env.ADS_MODEL || job.model || 'unknown',
        duration_seconds: Math.round((Date.now() - started) / 1000),
      },
    };

    const res = await hook('create_ads_audit', payload);
    await log(job.run_id, `Done in ${Math.round((Date.now() - started) / 1000)}s. ${res?.result?.summary || res?.summary || 'Stored.'}`);
  } catch (err) {
    await log(job.run_id, `Error: ${err.message}`);
    // Always close the run. A worker that dies silently leaves it holding the
    // dedupe slot until the timeout fires, and that agent cannot be run again
    // in the meantime.
    try {
      await hook('create_ads_audit', {
        run_id: job.run_id, client_id: job.client_id, agent_type: job.agent_type,
        period_month: job.period_month, facts_hash: job.facts_hash,
        status: 'error', error: err.message.slice(0, 1000),
      });
    } catch (inner) {
      console.error(`[ads-worker] #${job.run_id} could not report its own failure: ${inner.message}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function drain() {
  const res = await hook('claim_ads_runs', { worker_id: WORKER, limit: 3 });
  const runs = res?.result?.data?.runs || res?.data?.runs || [];
  // Sequential on purpose: these runs share one Claude CLI and one rate limit,
  // and three concurrent calls would mostly queue behind each other anyway.
  for (const job of runs) await runJob(job);
  return runs.length;
}

async function main() {
  console.log(`[ads-worker] ${WORKER} -> ${API} (${ONCE ? 'single pass' : `polling every ${POLL_MS / 1000}s`})`);

  if (ONCE) {
    console.log(`[ads-worker] Ran ${await drain()} job(s).`);
    return;
  }

  for (;;) {
    try {
      const n = await drain();
      // Back-to-back while there is work, idle interval when there is not.
      if (n > 0) continue;
    } catch (err) {
      console.error(`[ads-worker] Poll failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(err => { console.error('[ads-worker] Fatal:', err); process.exit(1); });
