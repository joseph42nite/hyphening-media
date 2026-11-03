/**
 * Small process helpers shared by the night fix and deploy workers.
 */

import { spawn } from 'child_process';

/** Run a command; resolves { code, out, err }. Never rejects on a non-zero exit. */
export function run(cmd, args, { input, timeoutMs, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: env ? { ...process.env, ...env } : process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = timeoutMs ? setTimeout(() => { proc.kill('SIGTERM'); err += `\n[timed out after ${Math.round(timeoutMs / 60000)} min]`; }, timeoutMs) : null;
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, out, err }); });
    if (input !== undefined) proc.stdin.write(input);
    proc.stdin.end();
  });
}

/** git in a folder; throws with git's own message unless `allowFail`. */
export async function git(cwd, args, { allowFail = false } = {}) {
  const res = await run('git', args, { cwd });
  if (res.code !== 0 && !allowFail) throw new Error(`git ${args[0]} failed: ${(res.err || res.out).trim().slice(-400)}`);
  return allowFail ? res : res.out.trim();
}

/** A shell command from a manifest (checks), run in the worktree. */
export function sh(command, cwd, timeoutMs = 10 * 60 * 1000) {
  return run('/bin/sh', ['-c', command], { cwd, timeoutMs });
}

export const tail = (s, n = 600) => String(s || '').trim().slice(-n);

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
