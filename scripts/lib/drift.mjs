/**
 * Drift baselines for the SEO worker's capabilities report.
 *
 * src/routes/seo.js unlocks a client's Drift card only when a recent run says
 * report_json.capabilities.drift_baseline.present is true, and the Drift skill
 * can only compare against a baseline that already exists. Nothing captured
 * one, so the card stayed grey. After each run the worker asks the claude-seo
 * plugin whether this URL has a baseline and, if not, captures one. Capturing
 * fetches the page once; it uses no DataForSEO credit.
 *
 * The plugin's Python tools run through its own launcher, in the same data
 * directory Claude Code gives the plugin, so they share the plugin's venv and
 * its baselines.db with the skill runs.
 *
 *   SEO_PLUGIN_ROOT  claude-seo install (default: newest version in the plugin cache)
 *   SEO_PLUGIN_DATA  its data directory (default: ~/.claude/plugins/data/claude-seo-agricidaniel-claude-seo)
 */

import os from 'os';
import path from 'path';
import { readdirSync, existsSync } from 'fs';
import { execFile } from 'child_process';

const CACHE = path.join(os.homedir(), '.claude/plugins/cache/agricidaniel-claude-seo/claude-seo');
const DATA = process.env.SEO_PLUGIN_DATA || path.join(os.homedir(), '.claude/plugins/data/claude-seo-agricidaniel-claude-seo');

function pluginRoot() {
  if (process.env.SEO_PLUGIN_ROOT) return process.env.SEO_PLUGIN_ROOT;
  try {
    const versions = readdirSync(CACHE).filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return versions.length ? path.join(CACHE, versions[versions.length - 1]) : null;
  } catch { return null; }
}

function runTool(root, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(path.join(root, 'scripts/claude-seo'), ['run', ...args], {
      cwd: os.tmpdir(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, CLAUDE_PLUGIN_DATA: DATA },
    }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

/** First JSON value in a tool's stdout, or undefined. */
function json(text) {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  try { return JSON.parse(text.slice(start)); } catch { return undefined; }
}

/**
 * { present, captured?, reason? } for this URL. Never throws: a broken plugin
 * runtime reports present:false with the reason, which keeps the card grey and
 * says why, rather than unlocking a skill that cannot run.
 */
export async function ensureDriftBaseline(url) {
  const root = pluginRoot();
  if (!root || !existsSync(path.join(root, 'scripts/claude-seo'))) return { present: false, reason: 'claude-seo plugin not found' };

  const history = await runTool(root, ['drift_history.py', url], 60_000);
  if (!history.ok) return { present: false, reason: (history.stderr.trim().split('\n').pop() || 'drift_history failed').slice(0, 200) };
  const rows = json(history.stdout);
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.baselines) ? rows.baselines : [];
  if (list.length) return { present: true };

  const capture = await runTool(root, ['drift_baseline.py', url, '--skip-cwv'], 180_000);
  if (!capture.ok) return { present: false, reason: (capture.stderr.trim().split('\n').pop() || 'drift_baseline failed').slice(0, 200) };
  return { present: true, captured: true };
}
