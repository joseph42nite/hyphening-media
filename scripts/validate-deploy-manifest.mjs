#!/usr/bin/env node
/**
 * Check a repo's deploy manifest. Exit 0 when valid, 2 when not.
 *
 *   node scripts/validate-deploy-manifest.mjs [repo_path]   # default: this repo
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { loadManifest, MANIFEST_FILE } from './lib/deployManifest.mjs';

const repo = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { manifest, errors } = await loadManifest(repo);
if (errors.length) {
  console.log(`${MANIFEST_FILE} in ${repo}: NOT valid`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(2);
}
console.log(`${MANIFEST_FILE} in ${repo}: valid · client ${manifest.client_id} · deploy ${manifest.deploy.type} · night fixes ${manifest.seo_fixes?.enabled ? 'on' : 'off'}`);
