/**
 * Git worktrees for the night workers: a separate copy of a client repo, so the
 * repo's own working folder (and anyone's uncommitted edits) is never touched.
 */

import path from 'path';
import { existsSync } from 'fs';
import { symlink, readdir } from 'fs/promises';

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
