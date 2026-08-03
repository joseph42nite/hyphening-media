/**
 * Chooses which model each skill requests, via the chat-model-switch plugin.
 *
 * WARNING: agent_id does two things, and only one of them is visible here.
 *
 * It picks the model phrase below, AND it is sent to OpenClaw as the agentId
 * that serves the run. The note that OpenClaw "never routed on agentId" held
 * only until it gained a second agent on 2026-07-30; setting this to 'seo'
 * then sent every audit to a bare agent with no hyphening-ops-api skill, which
 * ran them and never POSTed results back. Four runs timed out before anyone
 * connected the two. Only set values naming an agent provisioned with the
 * Hyphening API skills — 'main' is the one known to be.
 *
 * Note that show() below groups by model phrase, not by agent_id, and both
 * 'main' and 'seo' resolve to the same "no model named" bucket — so this
 * script's output cannot confirm which agent you are routing to. Query
 * agent_run_config.agent_id directly for that.
 *
 * Model selection itself is unverified for hook-triggered runs as of
 * 2026-07-30 — check actual_model on a real run before trusting it.
 *
 *   main (default) -> "nemotron ultra"   ('main' is configured as Nemotron
 *                                         as of 2026-07-30; this states it
 *                                         explicitly rather than relying on
 *                                         silence, since the plugin remembers
 *                                         the last model named per session)
 *   kimi           -> "kimi"             (creative / writing-heavy skills)
 *
 * NULL means "use the default" (nemotron ultra). Any value other than 'kimi'
 * also resolves to the default — see modelPhraseFor in agentRunner.js, which
 * this script's grouping mirrors.
 *
 * Usage:
 *   node scripts/set_agent_routing.js                       # show current mapping
 *   node scripts/set_agent_routing.js kimi content flow     # route those skills to kimi
 *   node scripts/set_agent_routing.js kimi --all            # route every skill to kimi
 *   node scripts/set_agent_routing.js main --all            # revert everything to the default
 */

import db from '../database.js';

// Mirrors modelPhraseFor in src/services/agentRunner.js — keep in sync.
function phraseFor(agentId) {
  if (agentId === 'kimi') return 'kimi';
  if (agentId === 'nemotron') return 'nemotron ultra';
  return null; // no model named; the agent's own primary decides
}

function show() {
  const rows = db.prepare('SELECT audit_type, agent_id FROM agent_run_config ORDER BY audit_type').all();
  const byPhrase = {};
  for (const r of rows) {
    const key = phraseFor(r.agent_id);
    (byPhrase[key] = byPhrase[key] || []).push(r.audit_type);
  }
  console.log('Current model requests:\n');
  for (const [phrase, skills] of Object.entries(byPhrase)) {
    const label = phrase === 'null' ? 'no model named (agent default)' : `"${phrase}"`;
    console.log(`  ${label}  (${skills.length})`);
    console.log(`    ${skills.join(', ')}\n`);
  }

  // Shown separately because the grouping above collapses every agent that
  // names no model into one bucket — which hid a run of audits routed to an
  // unprovisioned 'seo' agent, since it looked identical to 'main'.
  const byAgent = {};
  for (const r of rows) {
    const key = r.agent_id || '(null — falls back to OPENCLAW_AGENT_ID or main)';
    (byAgent[key] = byAgent[key] || []).push(r.audit_type);
  }
  console.log('Serving agent (sent to OpenClaw as agentId):\n');
  for (const [agentId, skills] of Object.entries(byAgent)) {
    console.log(`  ${agentId}  (${skills.length})`);
    console.log(`    ${skills.join(', ')}\n`);
  }
}

function main() {
  const [agent, ...skills] = process.argv.slice(2);

  if (!agent) {
    show();
    console.log('To change: node scripts/set_agent_routing.js <main|kimi> <skill...|--all>');
    return;
  }

  // 'main' is the default, stored as NULL.
  const value = agent === 'main' ? null : agent;

  let targets;
  if (skills[0] === '--all') {
    targets = db.prepare('SELECT audit_type FROM agent_run_config').all().map(r => r.audit_type);
  } else if (skills.length) {
    targets = skills;
  } else {
    console.error('Name at least one skill, or pass --all.');
    process.exit(1);
  }

  const known = new Set(db.prepare('SELECT audit_type FROM agent_run_config').all().map(r => r.audit_type));
  const unknown = targets.filter(t => !known.has(t));
  if (unknown.length) {
    console.error(`Unknown skill(s): ${unknown.join(', ')}`);
    console.error(`Known: ${[...known].sort().join(', ')}`);
    process.exit(1);
  }

  const update = db.prepare('UPDATE agent_run_config SET agent_id = ? WHERE audit_type = ?');
  db.transaction(() => {
    for (const t of targets) update.run(value, t);
  })();

  console.log(`Set ${targets.length} skill(s) to request "${phraseFor(value)}".\n`);
  show();
  console.log('No restart needed — the phrase is embedded in each trigger message.');
}

main();
