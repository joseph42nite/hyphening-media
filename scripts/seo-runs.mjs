#!/usr/bin/env node
/**
 * The OpenMausBot team's handle on night SEO. Each command is one signed
 * webhook call, so a bot runs it in one short turn. Vault:
 * Companies/Hyphening/SOPs/SEO run to push.md.
 *
 *   node scripts/seo-runs.mjs start    # Tanner, 01:15 IST: queue overdue skills (only if SEO is on Auto)
 *   node scripts/seo-runs.mjs fix      # Boothroyd, 03:30 IST: queue tonight's safe fixes (only if SEO is on Auto)
 *   node scripts/seo-runs.mjs status   # anyone: last night per client (for the morning brief)
 *
 * Who is calling goes into the record: set BOT_NAME (e.g. BOT_NAME=Tanner).
 * Nothing here deploys; that's 007's Deploy button in the SEO Monitor.
 */

import { hook } from './lib/hook.mjs';

const BY = process.env.BOT_NAME || 'agent';
const USAGE = 'usage: seo-runs.mjs start | fix | status';

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'start') return console.log((await hook('queue_seo_night', { by: BY })).message);
  if (cmd === 'fix') return console.log((await hook('queue_seo_fixes', { by: BY })).message);
  if (cmd === 'status') return console.log((await hook('seo_night_summary', {})).data?.text);
  console.log(USAGE);
  process.exitCode = 1;
}

main().catch((err) => { console.error(`seo-runs: ${err.message}`); process.exit(1); });
