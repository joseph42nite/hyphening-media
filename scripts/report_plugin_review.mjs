#!/usr/bin/env node
/**
 * Q's weekly plugin review → the SEO and Ads Monitors (report_plugin_review).
 *
 * The routine "Weekly plugin repo update check" calls this once per plugin it
 * reviewed. The Update & test button stays off until the release it would
 * install has a review, and when the verdict is 'breaks'.
 *
 *   node scripts/report_plugin_review.mjs --plugin claude-seo --version 2.6.2 \
 *     --sha 468ed5b... --verdict test_first \
 *     --summary "Four releases: ..." --impact "needs a test: ..." --new-skills seo-bing,seo-shopify
 *
 *   --verdict   safe | test_first | wait | breaks
 *   --summary   2-4 plain lines on what changed
 *   --impact    effect on our pipelines
 */

import { hook } from './lib/hook.mjs';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return out;
}

const a = args(process.argv.slice(2));
const missing = ['plugin', 'version', 'verdict'].filter((k) => !a[k]);
if (missing.length) {
  console.error(`missing --${missing.join(', --')}`);
  process.exit(2);
}

const res = await hook('report_plugin_review', {
  plugin: a.plugin,
  version: a.version,
  sha: a.sha || null,
  verdict: a.verdict,
  summary: a.summary || null,
  impact: a.impact || null,
  new_skills: (a['new-skills'] || '').split(',').map((s) => s.trim()).filter(Boolean),
  reviewed_by: a.by || 'Q',
});
// hook() throws on a refusal (a bad verdict or version), which exits non-zero.
console.log(res.message || JSON.stringify(res));
