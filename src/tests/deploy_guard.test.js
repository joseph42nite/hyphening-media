/**
 * The Deploy guard's tooling exception: which changed files count as the live
 * site's, and that hyphening.deploy.json names every tooling file the server
 * itself imports, so a change to one still blocks a Deploy.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { siteFiles, validateManifest } from '../../scripts/lib/deployManifest.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'hyphening.deploy.json'), 'utf8'));

describe('siteFiles', () => {
  const m = {
    tooling_paths: ['scripts/', 'src/tests/', 'docs/'],
    site_uses: ['scripts/lib/dataforseo.mjs'],
    deploy: { commands: ['node scripts/backup-db.mjs', 'git pull --ff-only'] },
  };

  it('drops files under tooling_paths', () => {
    expect(siteFiles(m, ['scripts/seo_fix_worker.mjs', 'src/tests/x.test.js', 'docs/a.md'])).toEqual([]);
  });

  it('keeps site files, site_uses, files a deploy command runs and the manifest', () => {
    const files = ['server.js', 'scripts/lib/dataforseo.mjs', 'scripts/backup-db.mjs', 'hyphening.deploy.json', 'scripts/other.mjs'];
    expect(siteFiles(m, files)).toEqual(files.slice(0, 4));
  });

  it('counts everything as the site when there are no tooling_paths', () => {
    expect(siteFiles({}, ['scripts/a.mjs'])).toEqual(['scripts/a.mjs']);
  });

  it('validates the lists as repo-relative paths', () => {
    const base = { ...manifest };
    expect(validateManifest({ ...base, tooling_paths: ['/etc/'] }).join()).toMatch(/tooling_paths/);
    expect(validateManifest({ ...base, site_uses: ['../x'] }).join()).toMatch(/site_uses/);
  });
});

describe('this repo\'s manifest', () => {
  const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'tests' ? [] : sources(p);
    return /\.(m?js)$/.test(e.name) ? [p] : [];
  });

  it('lists in site_uses every tooling file the server imports', () => {
    const imported = new Set();
    for (const file of [path.join(root, 'server.js'), ...sources(path.join(root, 'src'))]) {
      const code = fs.readFileSync(file, 'utf8');
      for (const [, spec] of code.matchAll(/(?:from\s+|import\()\s*['"]([^'"]+)['"]/g)) {
        if (!spec.startsWith('.')) continue;
        const rel = path.relative(root, path.resolve(path.dirname(file), spec));
        if (siteFiles({ ...manifest, site_uses: [] }, [rel]).length === 0) imported.add(rel);
      }
    }
    expect([...imported].filter((f) => !manifest.site_uses.includes(f))).toEqual([]);
  });
});
