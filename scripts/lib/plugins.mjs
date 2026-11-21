/**
 * Which version of a Claude Code plugin actually runs on this Mac.
 *
 * Claude Code's own record is ~/.claude/plugins/installed_plugins.json. The
 * plugin cache can hold newer folders that were downloaded and never switched
 * to (on 2026-11-21 claude-seo had 2.4.2 and 2.5.0 there while 2.4.2 ran), so
 * "the newest folder in the cache" is the wrong answer; this is the right one.
 */

import os from 'os';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

export const PLUGINS_DIR = path.join(os.homedir(), '.claude/plugins');
export const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');

/** { version, installPath, sha } for an install id such as 'claude-seo@agricidaniel-claude-seo', or null. */
export function installedPlugin(installId, file = INSTALLED_FILE) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const entries = data?.plugins?.[installId];
    const e = Array.isArray(entries) ? (entries.find((x) => x.scope === 'user') || entries[0]) : null;
    if (!e?.installPath) return null;
    return { version: e.version || null, installPath: e.installPath, sha: e.gitCommitSha || null };
  } catch {
    return null;
  }
}

/** The running install folder, if it is on disk; else null so callers can fall back. */
export function installedRoot(installId) {
  const p = installedPlugin(installId);
  return p && existsSync(p.installPath) ? p.installPath : null;
}
