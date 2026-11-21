/**
 * Small process helpers shared by the night fix and deploy workers.
 */

import { spawn } from 'child_process';

/**
 * Run a command; resolves { code, out, err }. Never rejects on a non-zero exit.
 *
 * `killTree`: run it in its own process group and stop the whole group on a
 * timeout. Without it only the direct child is stopped: on 2026-11-21 a
 * timed-out claude-seo setup left its pip running for an hour, holding the
 * setup lock, so the rollback's own setup was refused.
 */
export function run(cmd, args, { input, timeoutMs, cwd, env, killTree = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: env ? { ...process.env, ...env } : process.env, stdio: ['pipe', 'pipe', 'pipe'], detached: killTree });
    let out = '';
    let err = '';
    const stop = () => {
      if (killTree) {
        try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* already gone */ }
        // Anything that ignores SIGTERM (pip mid-download can) goes 10 s later.
        setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* gone */ } }, 10000).unref();
      } else {
        proc.kill('SIGTERM');
      }
    };
    const timer = timeoutMs ? setTimeout(() => { stop(); err += `\n[timed out after ${Math.round(timeoutMs / 60000)} min]`; }, timeoutMs) : null;
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, out, err }); });
    if (input !== undefined) proc.stdin.write(input);
    proc.stdin.end();
  });
}

/**
 * Who the night workers' commits (fixes, the Deploy button's cherry-picks and
 * rollbacks) are by. Set here rather than left to git: with no user.email
 * configured, git guesses one from the Mac's hostname, and at night that can be
 * a bare "MacBookAir" it cannot use, so every commit failed with "Author
 * identity unknown". Override with NIGHT_GIT_NAME / NIGHT_GIT_EMAIL.
 */
const NIGHT_GIT_NAME = process.env.NIGHT_GIT_NAME || 'Hyphening night fixes';
const NIGHT_GIT_EMAIL = process.env.NIGHT_GIT_EMAIL || '205165067+joseph42nite@users.noreply.github.com';
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: NIGHT_GIT_NAME, GIT_AUTHOR_EMAIL: NIGHT_GIT_EMAIL,
  GIT_COMMITTER_NAME: NIGHT_GIT_NAME, GIT_COMMITTER_EMAIL: NIGHT_GIT_EMAIL,
};

/** git in a folder; throws with git's own message unless `allowFail`. */
export async function git(cwd, args, { allowFail = false } = {}) {
  const res = await run('git', args, { cwd, env: GIT_IDENTITY });
  if (res.code !== 0 && !allowFail) throw new Error(`git ${args[0]} failed: ${(res.err || res.out).trim().slice(-400)}`);
  return allowFail ? res : res.out.trim();
}

/** A shell command from a manifest (checks), run in the worktree. */
export function sh(command, cwd, timeoutMs = 10 * 60 * 1000) {
  return run('/bin/sh', ['-c', command], { cwd, timeoutMs });
}

export const tail = (s, n = 600) => String(s || '').trim().slice(-n);

/**
 * One headless Claude run (`claude -p`), prompt on stdin; resolves stdout.
 *
 * Shared by the SEO and ads workers, which each had their own copy. `-p` has no
 * TTY to answer a permission prompt, so a tool that is not pre-approved is
 * denied rather than waited on: pass `allowedTools` (preferred: a fixed list)
 * or a `permissionMode`. With neither, the run cannot read a file or fetch a
 * page — which is how the ads fleet's brand and landing cards came back empty.
 */
export async function runClaude({ prompt, model, cwd, allowedTools, permissionMode, timeoutMs, bin = 'claude' }) {
  const args = ['-p', '--output-format', 'text'];
  if (permissionMode) args.push('--permission-mode', permissionMode);
  if (allowedTools) args.push('--allowedTools', allowedTools);
  if (model) args.push('--model', model);
  const res = await run(bin, args, { input: prompt, cwd, timeoutMs });
  if (res.code !== 0) throw new Error(`claude exited ${res.code}: ${String(res.err || res.out).trim().slice(0, 500)}`);
  return res.out;
}

/** Every URL answers 200 (redirects followed), retried while a restart settles. */
export async function healthCheck(urls, { tries = 12, waitMs = 10000 } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    const bad = [];
    for (const url of urls) {
      try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
        if (res.status !== 200) bad.push(`${url} → ${res.status}`);
      } catch (err) {
        bad.push(`${url} → ${err.cause?.code || err.message}`);
      }
    }
    if (bad.length === 0) return { ok: true };
    last = bad.join('; ');
    if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  return { ok: false, error: last };
}

/**
 * The first complete JSON object in a model's answer (a ```json fence first,
 * then the raw text), matched brace by brace so prose around it is ignored.
 */
export function firstJsonObject(text) {
  const fenced = String(text).match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidates = fenced ? [fenced[1], String(text)] : [String(text)];
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

/** The JSON between <json> and </json> in a model's answer (the last such block). */
export function jsonBetweenTags(text) {
  const blocks = [...String(text).matchAll(/<json>([\s\S]*?)<\/json>/g)];
  if (!blocks.length) return null;
  try { return JSON.parse(blocks[blocks.length - 1][1].trim()); } catch { return null; }
}
