#!/usr/bin/env node
/**
 * The OpenMausBot team's handle on the night blog pipeline. Each command is
 * one signed webhook call (scripts/lib/hook.mjs, the workers' HMAC channel),
 * so a bot runs it in one short turn. The secret is read from the repo .env
 * and never printed. Vault: Companies/Hyphening/SOPs/Client blog pipeline.md.
 *
 *   node scripts/blog-runs.mjs start                       # Leiter, 01:00 IST: queue tonight's posts (only if Blog is on Auto)
 *   node scripts/blog-runs.mjs list [status,status] [hours] # e.g. list ready  ·  list failed 24
 *   node scripts/blog-runs.mjs show <run_id>               # one draft in full, for review
 *   node scripts/blog-runs.mjs review <run_id> <approve|reject|needs-007> "<why>"   # Vesper
 *   node scripts/blog-runs.mjs retry <run_id>              # Q: put a failed run's topic back in tonight's queue
 *
 * Who is calling goes into the record: set BOT_NAME (e.g. BOT_NAME=Vesper).
 * Nothing here approves or publishes; that stays with 007 in the Blog Monitor.
 * Topics are not loaded from here any more: they come from keywords 007
 * approves in the Blog Monitor (src/services/keywordPlan.js).
 */

import { hook } from './lib/hook.mjs';

const BY = process.env.BOT_NAME || 'agent';

const line = (r) => `#${r.id} ${r.status.toUpperCase()} · ${r.client_name} · ${r.title || r.topic || '(no title yet)'}`
  + (r.quality_score != null ? ` · ${r.quality_score}/${r.quality_bar}` : '')
  + (r.audio_url ? ' · audio' : '')
  + (r.agent_recommendation ? ` · reviewed: ${r.agent_recommendation}` : '')
  + (r.error ? `\n    error: ${r.error}` : '')
  + (r.reject_reason ? `\n    sent back: ${r.reject_reason}` : '')
  + (r.blockers?.length ? `\n    problems: ${r.blockers.join(' | ')}` : '');

const USAGE = 'usage: blog-runs.mjs start | list [statuses] [hours] | show <id> | review <id> <approve|reject|needs-007> "<why>" | retry <id>';

async function main() {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'start': {
      const r = await hook('queue_blog_runs', { by: BY });
      console.log(r.message);
      for (const q of r.data?.queued || []) console.log(`  #${q.run_id} ${q.client_name}`);
      return;
    }
    case 'list': {
      const statuses = a ? a.split(',') : undefined;
      const r = await hook('list_blog_runs', { statuses, since_hours: b ? parseInt(b, 10) : undefined });
      const runs = r.data?.runs || [];
      console.log(runs.length ? runs.map(line).join('\n') : 'No blog runs in that window.');
      return;
    }
    case 'show': {
      const r = await hook('get_blog_run', { run_id: parseInt(a, 10) });
      const run = r.data.run;
      console.log(`#${run.id} ${run.status} · ${run.client_name} · publishes via ${run.publish_target}`);
      console.log(`Title: ${run.title}\nMeta title (${(run.meta_title || '').length}): ${run.meta_title}\nMeta description (${(run.meta_description || '').length}): ${run.meta_description}`);
      console.log(`Score: ${run.quality_score}/${run.quality_bar} (${run.passes_bar ? 'passes' : 'below the bar'}) · cover: ${run.cover_image_url} · audio: ${run.audio_url || 'none'}`);
      if (run.blockers?.length) console.log(`Problems:\n${run.blockers.map(x => `  - ${x}`).join('\n')}`);
      if (run.agent_review) console.log(`Earlier review (${run.agent_recommendation}): ${run.agent_review}`);
      console.log(`\n${run.content}`);
      return;
    }
    case 'review': {
      const note = rest.join(' ').trim();
      if (!a || !b || !note) throw new Error(USAGE);
      const r = await hook('review_blog_run', { run_id: parseInt(a, 10), recommendation: b, note, by: BY });
      console.log(r.message);
      return;
    }
    case 'retry': {
      const r = await hook('retry_blog_run', { run_id: parseInt(a, 10), by: BY });
      console.log(r.message);
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((err) => { console.error(`blog-runs: ${err.message}`); process.exit(1); });
