/**
 * The deploy manifest (`hyphening.deploy.json` at a client repo's root): how
 * the repo is checked, deployed, verified and rolled back, and which files the
 * night SEO fixes may touch. The fix worker and the Deploy button only ever do
 * what it says. Format and rules: vault Companies/Hyphening/SOPs/Deploy manifest.md.
 *
 * No secrets live in it: an SSH host is named by its ~/.ssh/config alias.
 */

import { readFile } from 'fs/promises';
import path from 'path';

export const MANIFEST_FILE = 'hyphening.deploy.json';
export const DEPLOY_TYPES = ['git_push', 'ssh_pull_build', 'ssh_rsync_static', 'cms_api', 'handoff'];
// The Deploy button can only run these; the others are publish-only.
export const NIGHT_DEPLOY_TYPES = ['git_push', 'ssh_pull_build', 'ssh_rsync_static'];
// ssh_rsync_static: the site is built on this Mac and the output folder is
// uploaded with rsync (hosting with no Node, e.g. cPanel). This file on the
// server records which commit is live, written by every upload.
export const DEPLOYED_COMMIT_FILE = '.deployed-commit';

const relPath = (p) => typeof p === 'string' && p.trim() && !p.startsWith('/') && !p.split('/').includes('..');
export const BLOG_TYPES = ['hyphening_webhook', 'cms_api', 'repo_file', 'handoff'];

// Never editable by a night fix, whatever a manifest's own list says.
const ALWAYS_NEVER = ['.env', '.git/', 'node_modules/', 'data/', 'hyphening.deploy.json'];
const SECRET_HINT = /(password|passwd|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|\.pem\b)/i;

const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim());

/** Every problem with a manifest, as plain sentences; empty when it's valid. */
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['the manifest is not a JSON object'];
  if (!Number.isInteger(m.client_id) || m.client_id <= 0) errors.push('client_id must be the portal client id (a positive number)');
  if (typeof m.branch !== 'string' || !m.branch) errors.push('branch is required (e.g. "main")');
  if (m.checks !== undefined && !isStrList(m.checks)) errors.push('checks must be a list of commands');
  if (m.install !== undefined && !isStrList(m.install)) errors.push('install must be a list of commands (e.g. "npm ci")');

  const d = m.deploy;
  if (!d || !DEPLOY_TYPES.includes(d.type)) {
    errors.push(`deploy.type must be one of ${DEPLOY_TYPES.join(', ')}`);
  } else if (d.type === 'ssh_pull_build') {
    if (typeof d.host_alias !== 'string' || !/^[A-Za-z0-9._-]+$/.test(d.host_alias)) errors.push('deploy.host_alias must be an SSH config alias (letters, digits, . _ -)');
    if (typeof d.dir !== 'string' || !d.dir.startsWith('/')) errors.push('deploy.dir must be the absolute app folder on the server');
    if (!isStrList(d.commands) || d.commands.length === 0) errors.push('deploy.commands must list the server commands');
  } else if (d.type === 'ssh_rsync_static') {
    if (typeof d.host_alias !== 'string' || !/^[A-Za-z0-9._-]+$/.test(d.host_alias)) errors.push('deploy.host_alias must be an SSH config alias (letters, digits, . _ -)');
    if (!isStrList(d.build) || d.build.length === 0) errors.push('deploy.build must list the commands that build the site');
    if (!relPath(d.local_dir)) errors.push('deploy.local_dir must be the build output folder, relative to the repo (e.g. "out")');
    if (!relPath(d.remote_dir)) errors.push('deploy.remote_dir must be the web root, relative to the server home (e.g. "public_html")');
    if (d.require !== undefined && !(isStrList(d.require) && d.require.every(relPath))) errors.push('deploy.require must list files the build must produce, relative to local_dir');
    for (const key of ['protect', 'exclude']) {
      if (d[key] !== undefined && !(isStrList(d[key]) && d[key].every(relPath))) errors.push(`deploy.${key} must be a list of paths relative to the web root`);
    }
  }

  if (!isStrList(m.health_check) || m.health_check.length === 0 || !m.health_check.every((u) => /^https:\/\//.test(u))) {
    errors.push('health_check must list at least one https:// URL');
  }
  if (m.rollback !== undefined && m.rollback !== 'git_revert') errors.push('rollback must be "git_revert"');
  if (m.blog !== undefined && !BLOG_TYPES.includes(m.blog?.type)) errors.push(`blog.type must be one of ${BLOG_TYPES.join(', ')}`);

  const f = m.seo_fixes;
  if (f !== undefined) {
    if (typeof f.enabled !== 'boolean') errors.push('seo_fixes.enabled must be true or false');
    if (f.enabled) {
      if (!isStrList(f.paths) || f.paths.length === 0) errors.push('seo_fixes.paths must list the files or folders night fixes may edit');
      if (f.never_touch !== undefined && !isStrList(f.never_touch)) errors.push('seo_fixes.never_touch must be a list of paths');
      if (d && !NIGHT_DEPLOY_TYPES.includes(d.type)) errors.push(`night SEO fixes need deploy.type ${NIGHT_DEPLOY_TYPES.join(' or ')}`);
      for (const p of f.paths || []) {
        if (p.startsWith('/') || p.includes('..')) errors.push(`seo_fixes.paths entry "${p}" must be relative to the repo`);
      }
    }
  }

  if (SECRET_HINT.test(JSON.stringify(m))) errors.push('the manifest looks like it contains a secret (password, token, key or .pem); name an SSH alias instead');
  return errors;
}

/** Reads and validates `<repoPath>/hyphening.deploy.json`. */
export async function loadManifest(repoPath) {
  let raw;
  try {
    raw = await readFile(path.join(repoPath, MANIFEST_FILE), 'utf8');
  } catch {
    return { manifest: null, errors: [`no ${MANIFEST_FILE} in ${repoPath}`] };
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    return { manifest: null, errors: [`${MANIFEST_FILE} is not valid JSON: ${err.message}`] };
  }
  return { manifest, errors: validateManifest(manifest) };
}

const norm = (p) => p.replace(/^\.\//, '');
const under = (file, entry) => (entry.endsWith('/') ? file.startsWith(norm(entry)) : file === norm(entry));

/** Whether a night fix may edit this repo-relative file. */
export function fixMayTouch(manifest, file) {
  const f = norm(file);
  const never = [...ALWAYS_NEVER, ...(manifest.seo_fixes?.never_touch || [])];
  if (never.some((e) => under(f, e) || f === norm(e).replace(/\/$/, ''))) return false;
  return (manifest.seo_fixes?.paths || []).some((e) => under(f, e));
}
