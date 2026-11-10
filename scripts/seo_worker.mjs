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

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import dotenv from 'dotenv';
import { hook, API } from './lib/hook.mjs';
import { firstJsonObject, runClaude } from './lib/proc.mjs';
import { probe as probeDataForSeo } from './lib/dataforseo.mjs';
import { ensureDriftBaseline } from './lib/drift.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Explicit path, not dotenv's cwd-relative default: cron's working directory
// is not guaranteed to be the repo root, but this file's location is fixed.
dotenv.config({ path: path.resolve(HERE, '../.env') });

const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;
const WORKER = process.env.SEO_WORKER_ID || os.hostname();
const POLL_MS = (Number(process.env.SEO_POLL_SECONDS) || 30) * 1000;
const CLAUDE_BIN = process.env.SEO_CLAUDE_BIN || 'claude';
// Every skill runs on the Claude subscription through the local claude CLI,
// pinned here (agent_run_config.default_model says the same since migration
// 104; it used to hold OpenRouter ids this CLI can't run).
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
  if (job.audit_type === 'full') return 'audit';
  // A gap run is the backlinks skill's own gap command, against the competitor
  // the run names. There is no `backlink-gap` command: sent that, the skill ran a
  // plain profile review and went looking for competitors itself (run #125).
  if (job.audit_type === 'backlink_gap') return `backlinks gap ${job.url} https://${job.competitor_domain}`;
  // seo-drift has three sub-commands; the card's job is comparing against the
  // baseline the worker captures (lib/drift.mjs).
  if (job.audit_type === 'drift') return 'drift compare';
  return job.audit_type.replace(/_/g, '-');
}


async function log(runId, line) {
  console.log(`[seo-worker] #${runId} ${line}`);
  try { await hook('seo_run_log', { run_id: runId, log: line }); } catch { /* ignore — a lost log line must not kill the run */ }
}

/**
 * The prompt.
 *
 * Deliberately overrides two things claude_seo_SKILL.md tells the skill to do
 * on its own, both because this run arrives already past those checks:
 *
 * 1. Section "Gated Execution & Dashboard Integration" §1 (Pre-Execution Gate
 *    & Approvals) assumes the skill is checking `pending_actions` and
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
/**
 * What a gap run has to compare and return. The competitor is chosen and
 * approved in the SEO Monitor, so the skill must not substitute its own; and
 * the three lists are the point of the run, so they are asked for by name.
 */
function gapInstructions(job) {
  const ours = new URL(job.url).hostname.replace(/^www\./, '');
  return [
    `Competitor: **${job.competitor_domain}** (approved in the Ops Center). Compare ${ours} against this domain only — do not look for or substitute other competitors.`,
    `Use DataForSEO: fetch \`backlinks_referring_domains\` for both ${ours} and ${job.competitor_domain} (or \`backlinks_domain_intersection\`), then compare the two sets.`,
    'In report_json return:',
    `- \`competitor\`: "${job.competitor_domain}", with both domains' referring-domain counts`,
    `- \`gap_domains\`: domains linking to ${job.competitor_domain} but NOT to ${ours}, best first (domain, rank/authority, why it is relevant) — up to 50`,
    `- \`shared_domains\`: domains linking to both`,
    `- \`only_ours\`: domains linking only to ${ours}`,
    'Recommendations should name specific gap domains to approach. If DataForSEO fails for either domain, say so in data_availability and do not invent a list.',
  ].join('\n');
}

function buildPrompt(job) {
  return [
    `Use the \`/seo ${commandFor(job)}\` command for **${job.client_name}** (client_id ${job.client_id}).`,
    `Target URL: ${job.url}`,
    job.audit_type === 'backlink_gap' ? gapInstructions(job) : '',
    job.is_competitor ? 'This is a COMPETITOR research run, not an audit of our own client — do not use any of our own Search Console/GA4 property data for it.' : '',
    !job.is_competitor && job.gsc_property ? `Search Console property: ${job.gsc_property}` : '',
    !job.is_competitor && job.gsc_property ? `Before writing the brief, run \`python3 -W ignore ~/.claude/plugins/cache/agricidaniel-claude-seo/claude-seo/*/scripts/gsc_query.py --property ${job.gsc_property} --days 90 --limit 50 --json\` and use its rows as real Search Console data. If the command errors or returns no rows, say so explicitly in data_availability — do not silently skip it.` : '',
    !job.is_competitor && job.ga4_property_id ? `GA4 property: ${job.ga4_property_id}` : '',
    !job.is_competitor && job.ga4_property_id ? `Also run \`python3 -W ignore ~/.claude/plugins/cache/agricidaniel-claude-seo/claude-seo/*/scripts/ga4_report.py --property ${job.ga4_property_id} --days 90 --report organic --limit 50 --json\` and use its rows as real GA4 data. If it errors or returns nothing, say so explicitly in data_availability — do not silently skip it.` : '',
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

/**
 * Runs the CLI and returns its stdout.
 *
 * `-p` has no TTY to answer a tool-permission prompt, so every prompt
 * auto-denies (WebFetch, the render_page.py Bash call, any Task sub-agent)
 * instead of waiting — the audit then comes back with empty findings. This
 * run is already admin-gated, budget-checked, and freshness-checked by the
 * Ops Center before being queued (see buildPrompt's comment above), so there
 * is no further approval for a human to give here; bypassPermissions is the
 * correct mode for that, not a workaround. An explicit --allowedTools list
 * was ruled out: audit types route through different claude-seo skills/agents
 * (content via Bash+render_page.py, flow via WebFetch, others via Task
 * sub-agents with their own tool sets), so a fixed allowlist would keep
 * breaking as audit types change.
 */
async function runClaudeFor(promptFile) {
  return runClaude({
    bin: CLAUDE_BIN,
    prompt: await readFile(promptFile, 'utf8'),
    model: MODEL,
    // The run's own temp folder, not whatever folder the worker inherited:
    // a run once failed with "current working directory was deleted" while
    // another Claude worked on the same repo.
    cwd: path.dirname(promptFile),
    permissionMode: 'bypassPermissions',
  });
}


async function runJob(job) {
  const started = Date.now();
  await log(job.run_id, `Starting /seo ${commandFor(job)} for ${job.client_name} (${job.url}).`);

  const dir = await mkdtemp(path.join(tmpdir(), 'seo-run-'));
  const promptFile = path.join(dir, 'prompt.md');

  try {
    await writeFile(promptFile, buildPrompt(job), 'utf8');
    const raw = await runClaudeFor(promptFile);
    const parsed = firstJsonObject(raw);

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
    // What this Mac can reach, checked by us rather than claimed by the model:
    // src/routes/seo.js unlocks the DataForSEO cards only on this field.
    const report = parsed.report_json && typeof parsed.report_json === 'object' ? parsed.report_json : {};
    const { balance, ...dataforseo } = await probeDataForSeo();
    // Drift baselines belong to our own clients' sites, never a competitor's.
    const drift_baseline = job.is_competitor ? undefined : await ensureDriftBaseline(job.url);
    const payload = {
      ...parsed,
      report_json: { ...report, capabilities: { ...(report.capabilities || {}), dataforseo, ...(drift_baseline && { drift_baseline }) } },
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
