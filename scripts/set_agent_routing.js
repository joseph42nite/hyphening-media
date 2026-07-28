/**
 * Chooses which OpenClaw agent — and therefore which model — serves each skill.
 *
 * OpenClaw resolves the model from agent.defaults.model.primary on the agent
 * that handles the request, so naming a different agent is the whole mechanism:
 *
 *   main  -> openrouter/deepseek/deepseek-v4-flash   (fast, cheap, no daily cap)
 *   seo   -> nemotron-3-ultra:free
 *              -> nemotron-3-super:free -> deepseek-v4-flash
 *
 * NULL routes to OPENCLAW_AGENT_ID, or 'main' when that is unset.
 *
 * Usage:
 *   node scripts/set_agent_routing.js                      # show current routing
 *   node scripts/set_agent_routing.js seo technical schema # route those skills to 'seo'
 *   node scripts/set_agent_routing.js seo --all            # route every skill to 'seo'
 *   node scripts/set_agent_routing.js main --all           # revert everything
 */

import db from '../database.js';

function show() {
  const rows = db.prepare('SELECT audit_type, agent_id FROM agent_run_config ORDER BY audit_type').all();
  const byAgent = {};
  for (const r of rows) {
    const key = r.agent_id || 'main (default)';
    (byAgent[key] = byAgent[key] || []).push(r.audit_type);
  }
  console.log('Current routing:\n');
  for (const [agent, skills] of Object.entries(byAgent)) {
    console.log(`  ${agent}  (${skills.length})`);
    console.log(`    ${skills.join(', ')}\n`);
  }
}

function main() {
  const [agent, ...skills] = process.argv.slice(2);

  if (!agent) {
    show();
    console.log('To change: node scripts/set_agent_routing.js <agentId> <skill...|--all>');
    return;
  }

  // 'main' is the default agent, so it is stored as NULL rather than a literal
  // — that keeps OPENCLAW_AGENT_ID working as a global override.
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

  console.log(`Routed ${targets.length} skill(s) to '${agent}'.\n`);
  show();
  console.log('No restart needed — the agent is read per request.');
}

main();
