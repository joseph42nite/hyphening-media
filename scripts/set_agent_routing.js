/**
 * Chooses which model each skill requests, via the chat-model-switch plugin.
 *
 * History: this used to set which OpenClaw *agent* a run dispatched to,
 * because the plan was for the model to follow the agent
 * (agent.defaults.model.primary). Confirmed 2026-07-30 that OpenClaw never
 * actually routed on the agentId field — every call executed on 'main'
 * regardless. The column is repurposed: it now selects a phrase embedded in
 * the trigger message, which OpenClaw's chat-model-switch plugin reads out of
 * the prompt text and uses to override the session's model for that call.
 * Unverified for hook-triggered runs as of 2026-07-30 — check actual_model
 * on a real run before trusting it.
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

function phraseFor(agentId) {
  return agentId === 'kimi' ? 'kimi' : 'nemotron ultra';
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
    console.log(`  "${phrase}"  (${skills.length})`);
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
