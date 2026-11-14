/**
 * Git worktrees for the night workers: a separate copy of a client repo, so the
 * repo's own working folder (and anyone's uncommitted edits) is never touched.
 */

import path from 'path';
import { existsSync } from 'fs';
import { symlink, readdir } from 'fs/promises';
import { sh, tail } from './proc.mjs';

/**
 * The real repo's node_modules (root and each first-level folder with a
 * package.json, e.g. frontend/), linked into the worktree so the manifest's
 * checks can build. Returns the linked paths, which callers leave out of
 * "changed files" and of git clean.
 */
export async function linkNodeModules(repo, wt) {
  const linked = [];
  const dirs = [''];
  for (const e of await readdir(repo, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && existsSync(path.join(repo, e.name, 'package.json'))) dirs.push(e.name);
  }
  for (const d of dirs) {
    const from = path.join(repo, d, 'node_modules');
    const to = path.join(wt, d, 'node_modules');
    if (existsSync(from) && existsSync(path.join(wt, d)) && !existsSync(to)) {
      await symlink(from, to, 'dir');
      linked.push(path.join(d, 'node_modules'));
    }
  }
  return linked;
}

/**
 * Gets a worktree ready for the manifest's checks and build. With a manifest
 * `install` list, those commands install the packages inside the worktree (on
 * the internal disk, from npm's cache): needed where node_modules can't be a
 * link, as Turbopack refuses one that points outside the project ("Symlink
 * node_modules is invalid, it points out of the filesystem root"). Otherwise
 * the repo's node_modules are linked. Returns the linked paths; throws when an
 * install command fails.
 */
export async function prepareWorktree(repo, wt, manifest) {
  if (!manifest.install?.length) return linkNodeModules(repo, wt);
  for (const cmd of manifest.install) {
    const res = await sh(cmd, wt, 15 * 60 * 1000);
    if (res.code !== 0) throw new Error(`install "${cmd}" failed: ${tail(res.err || res.out, 300)}`);
  }
  return [];
}
