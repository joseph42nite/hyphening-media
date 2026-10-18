#!/usr/bin/env node
/**
 * SEO Monitor worker.
 *
 * Pulls queued runs from the Ops Center, runs the matching claude-seo skill,
 * posts the result back. Runs on whichever machine has the Claude CLI and the
 * claude-seo plugin installed; the Ops Center never reaches into it.
 *
 * Pull, not push, for the same reason as the ads worker: a push model needs a
 * tunnel into this machine and loses every job dispatched while it is asleep.
 *
 *   HYPHENING_API_URL      Ops Center base URL      (default http://localhost:3000)
 *   HYPHENING_HMAC_SECRET  shared webhook secret    (required)
 *   SEO_WORKER_ID          name in the logs         (default hostname)
 *   SEO_POLL_SECONDS       idle poll interval       (default 30)
 *   SEO_CLAUDE_BIN         Claude CLI binary        (default 'claude')
 *   SEO_MODEL              model the worker runs on (default: claude-sonnet-5-5)
 *
 * Usage:
 *   node seo_worker.mjs            # poll for ever
 *   node seo_worker.mjs --once     # drain the queue once and exit (for cron)
 */

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Explicit path, not dotenv's cwd-relative default: cron's working directory
// is not guaranteed to be the repo root, but this file's location is fixed.
dotenv.config({ path: path.resolve(HERE, '../.env') });

const API = (process.env.HYPHENING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;
const WORKER = process.env.SEO_WORKER_ID || os.hostname();
const POLL_MS = (Number(process.env.SEO_POLL_SECONDS) || 30) * 1000;
const CLAUDE_BIN = process.env.SEO_CLAUDE_BIN || 'claude';
// A run's own routed model (kimi / deepseek-v4-flash, per claude_seo_SKILL.md's
// "Model Selection Routing") is an OpenRouter id the local claude CLI cannot
// run — same reasoning as the ads worker. Pinned here instead.
const MODEL = process.env.SEO_MODEL || 'claude-sonnet-5-5';
const ONCE = process.argv.includes('--once');

if (!SECRET) {
  console.error('[seo-worker] HYPHENING_HMAC_SECRET is not set. Every request would 401.');
  process.exit(1);
}

/**
 * The job's audit_type -> the claude-seo `/seo <command>` sub-command.
 *
 * Mirrors skillNameForAuditType() in src/routes/seo.js exactly (underscores
 * become hyphens, 'full' is the odd one out) but returns the CLI command
 * token ('audit', 'technical', 'content-brief', ...), not the skill name
 * ('seo-audit', 'seo-technical', ...) — the two differ by the 'seo-' prefix,
 * and only the command token is valid after `/seo `.
 */
function commandFor(job) {
  return job.audit_type === 'full' ? 'audit' : job.audit_type.replace(/_/g, '-');
}

/** Signed webhook call — identical pattern to ads_worker.mjs's hook(). */
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

async function log(runId, line) {
  console.log(`[seo-worker] #${runId} ${line}`);
  try { await hook('ads_run_log', { run_id: runId, log: line }); } catch { /* ignore — a lost log line must not kill the run */ }
}

/**
 * The prompt.
 *
 * Deliberately overrides two things claude_seo_SKILL.md tells the skill to do
 * on its own, both because this run arrives already past those checks:
 *
 * 1. Section "Gated Execution & Dashboard Integration" §1 (Pre-Execution Gate
 *    & Approvals) assumes the skill is checking `openclaw_pending_actions` and
 *    an "Approvals Tab" itself. That tab does not exist in this codebase (the
 *    Approval Center was built, then abandoned — src/routes/seo.js now hard-
 *    403s non-admins instead of staging an approval). A run only reaches this
 *    worker because src/routes/seo.js already ran its own gates (budget,
 *    freshness, admin-only) before queuing it. Telling the skill to re-check
 *    a tab that does not exist would make every run refuse itself.
 * 2. Section "Webhook Data Delivery" §5 tells the *skill* to compute the HMAC
 *    and POST it directly. This worker does that instead, exactly like
 *    ads_worker.mjs — asking a model to hand-compute a cryptographic HMAC and
 *    curl it is unreliable in a way that asking it to emit one JSON object is
 *    not, and the ads side already proves the worker-signs pattern works.
 */
function buildPrompt(job) {
  return [
    `Use the \`/seo ${commandFor(job)}\` command for **${job.client_name}** (client_id ${job.client_id}).`,
    `Target URL: ${job.url}`,
    job.is_competitor ? 'This is a COMPETITOR research run, not an audit of our own client — do not use any of our own Search Console/GA4 property data for it.' : '',
    !job.is_competitor && job.gsc_property ? `Search Console property: ${job.gsc_property}` : '',
    !job.is_competitor && job.ga4_property_id ? `GA4 property: ${job.ga4_property_id}` : '',
    '',
    'Do not perform the "Pre-Execution Gate & Approvals" or staleness check from',
    'your own skill instructions — this run was already approved, budget-checked,',
    'and freshness-checked by the Ops Center before being queued for you. Proceed',
    'directly to the analysis.',
    '',
    'Do NOT compute an HMAC signature or POST anything yourself. Do not use the',
    '"Webhook Data Delivery" section of your own instructions. Instead, reply with',
    'ONE JSON object and nothing else — no prose before it, no code fence around',
    'it — using this shape (null any field your command type does not produce):',
    '```json',
    JSON.stringify({
      health_score: null, technical_score: null, content_score: null,
      on_page_score: null, schema_score: null, performance_score: null,
      geo_score: null, backlinks_score: null, local_score: null, sxo_score: null,
      audit_score: null, summary: 'string', recommendations: [{ priority: 'Critical|High|Medium|Low', metric: 'string', issue: 'string', action_required: 'string' }],
      report_json: {}, token_usage: { model: 'string', input_tokens: 0, output_tokens: 0 },
    }, null, 2),
    '```',
    '# This run',
    '```json',
    JSON.stringify({ run_id: job.run_id, client_id: job.client_id, audit_type: job.audit_type, url: job.url }, null, 2),
    '```',
  ].filter(Boolean).join('\n');
}

/** Runs the CLI and returns its stdout. Identical to ads_worker.mjs. */
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
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${(err || out).trim().slice(0, 500)}`));
      resolve(out);
    });
    readFile(promptFile, 'utf8').then(text => { proc.stdin.write(text); proc.stdin.end(); }).catch(reject);
  });
}

/** Brace-matched JSON extraction. Identical to ads_worker.mjs. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidates = fenced ? [fenced[1], text] : [text];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    if (start === -1) continue;
    let depth = 0, inString = false, escaped = false;
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
  await log(job.run_id, `Starting /seo ${commandFor(job)} for ${job.client_name} (${job.url}).`);

  const dir = await mkdtemp(path.join(tmpdir(), 'seo-run-'));
  const promptFile = path.join(dir, 'prompt.md');

  try {
    await writeFile(promptFile, buildPrompt(job), 'utf8');
    const raw = await runClaude(promptFile, MODEL);
    const parsed = extractJson(raw);

    if (!parsed) {
      await hook('create_seo_audit', {
        run_id: job.run_id, client_id: job.client_id, audit_type: job.audit_type, url: job.url,
        status: 'error', error: 'The model reply contained no parsable JSON object.',
        summary: raw.slice(0, 1000),
      });
      await log(job.run_id, 'Failed: no JSON in the reply.');
      return;
    }

    // Identity is ours to assert, not the model's — same reasoning as
    // ads_worker.mjs: a reply that renamed its own audit_type would be stored
    // against the wrong card.
    const payload = {
      ...parsed,
      run_id: job.run_id,
      client_id: job.client_id,
      audit_type: job.audit_type,
      url: job.url,
      is_competitor: job.is_competitor,
      competitor_domain: job.competitor_domain || null,
      token_usage: {
        ...(parsed.token_usage || {}),
        model: parsed.token_usage?.model || MODEL,
        duration_seconds: Math.round((Date.now() - started) / 1000),
      },
    };

    const res = await hook('create_seo_audit', payload);
    await log(job.run_id, `Done in ${Math.round((Date.now() - started) / 1000)}s. ${res?.result?.summary || res?.summary || 'Stored.'}`);
  } catch (err) {
    await log(job.run_id, `Error: ${err.message}`);
    try {
      await hook('create_seo_audit', {
        run_id: job.run_id, client_id: job.client_id, audit_type: job.audit_type, url: job.url,
        status: 'error', error: err.message.slice(0, 1000),
      });
    } catch (inner) {
      console.error(`[seo-worker] #${job.run_id} could not report its own failure: ${inner.message}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function drain() {
  const res = await hook('claim_seo_runs', { worker_id: WORKER, limit: 3 });
  const runs = res?.result?.data?.runs || res?.data?.runs || [];
  // Sequential on purpose, same reasoning as ads: one Claude CLI, one rate limit.
  for (const job of runs) await runJob(job);
  return runs.length;
}

async function main() {
  console.log(`[seo-worker] ${WORKER} -> ${API} (${ONCE ? 'single pass' : `polling every ${POLL_MS / 1000}s`})`);

  if (ONCE) {
    console.log(`[seo-worker] Ran ${await drain()} job(s).`);
    return;
  }

  for (;;) {
    try {
      const n = await drain();
      if (n > 0) continue;
    } catch (err) {
      console.error(`[seo-worker] Poll failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(err => { console.error('[seo-worker] Fatal:', err); process.exit(1); });
