#!/usr/bin/env node
/**
 * The OpenMausBot team's handle on backlink outreach. Each command is one
 * signed webhook call (scripts/lib/hook.mjs). Vault: Companies/Hyphening/SOPs/Backlink outreach.md.
 *
 *   node scripts/outreach.mjs find     # Boothroyd, weekly: queue an outreach run per SEO-on client
 *   node scripts/outreach.mjs status   # anyone: counts, and whether DataForSEO worked on the last run
 *
 * Who is calling goes into the record: set BOT_NAME (e.g. BOT_NAME=Boothroyd).
 * Nothing here sends email or approves; 007 approves in the SEO Monitor and
 * staff send from their own Gmail.
 */

import { hook } from './lib/hook.mjs';

const BY = process.env.BOT_NAME || 'agent';

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'find') return console.log((await hook('queue_outreach_runs', { by: BY })).message);
  if (cmd === 'status') return console.log((await hook('outreach_summary', {})).data?.text);
  console.log('usage: outreach.mjs find | status');
  process.exitCode = 1;
}

main().catch((err) => { console.error(`outreach: ${err.message}`); process.exit(1); });
