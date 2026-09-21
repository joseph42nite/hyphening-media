/**
 * Unattended ads runs.
 *
 * The point of the Ads Monitor is that nobody has to remember to run it. That
 * makes the scheduler the part most able to do damage: a sweep that queues
 * every agent for every client every night spends real tokens nightly, and the
 * output stops being read within a week — at which point the monitor is worse
 * than nothing, because it looks like something is watching.
 *
 * So the policy is deliberately narrow:
 *
 *   Daily   — the anomaly watch, and only for clients with enough history for
 *             it to mean anything. It exists to answer "did something break
 *             overnight", which is the only question worth asking every day.
 *   Weekly  — a sweep of agents that are genuinely stale, capped per client.
 *             The cap is what stops a client who was ignored for a month from
 *             queueing forty runs the moment someone notices.
 *
 * Everything else stays manual. An agent nobody has asked for, on data that
 * has not changed, is a bill rather than an insight.
 */

import db from '../../database.js';
import { buildFactPack, checkRequirements } from './adsFacts.js';
import { createRun, getActiveRunsForClient } from './adsRuns.js';

// Per client, per weekly sweep. Twelve agents exist; queueing at most three at
// a time means a fully-neglected client catches up over a month rather than in
// one expensive night, and the queue stays readable while it does.
const WEEKLY_CAP_PER_CLIENT = Number(process.env.ADS_WEEKLY_CAP || 3);

/** Marketing clients only. Artist-curation clients run no ads. */
function adsClients() {
  return db.prepare(`SELECT id, name FROM crm_clients WHERE client_type = 'marketing'`).all();
}

/**
 * Queues one agent if it can run, is not already in flight, and is stale.
 * Returns the run, or null with the reason it was skipped.
 */
function maybeQueue(client, conf, available, activeRuns) {
  if (activeRuns.has(conf.agent_type)) return { skipped: 'in_flight' };
  if (!checkRequirements(conf, available).ok) return { skipped: 'missing_data' };

  const last = db.prepare(
    'SELECT created_at FROM ads_audits WHERE client_id = ? AND agent_type = ? ORDER BY created_at DESC LIMIT 1'
  ).get(client.id, conf.agent_type);

  if (last) {
    const ageDays = Math.floor((Date.now() - new Date(`${last.created_at.replace(' ', 'T')}Z`).getTime()) / 86_400_000);
    if (ageDays < conf.stale_after_days) return { skipped: 'fresh' };
  }

  const { run, conflict } = createRun({
    clientId: client.id,
    agentType: conf.agent_type,
    model: conf.default_model,
    requestedBy: 'scheduler',
    triggerSource: 'scheduled',
  });
  // The unique index is the authority, not the check above: a manual trigger
  // landing in the same millisecond loses nothing this way.
  if (conflict) return { skipped: 'in_flight' };
  return { run };
}

/**
 * Daily anomaly watch.
 *
 * Skipped for clients without multiple months of spend. Run against a single
 * month the agent has nothing to compare and produces a confident report about
 * one data point, which is the failure mode this whole design avoids.
 */
export function runDailyAdsWatch() {
  const conf = db.prepare(`SELECT * FROM ads_agent_config WHERE agent_type = 'anomaly'`).get();
  if (!conf) return { queued: 0 };

  let queued = 0;
  const skipped = [];

  for (const client of adsClients()) {
    try {
      const { available } = buildFactPack(client.id);
      const result = maybeQueue(client, conf, available, getActiveRunsForClient(client.id));
      if (result.run) queued++;
      else skipped.push(`${client.name}:${result.skipped}`);
    } catch (err) {
      console.error(`[ADS SCHEDULER] Anomaly watch failed for ${client.name}:`, err.message);
    }
  }

  console.log(`[ADS SCHEDULER] Daily anomaly watch: ${queued} queued${skipped.length ? `, skipped ${skipped.join(', ')}` : ''}.`);
  return { queued, skipped };
}

/**
 * Weekly sweep of stale agents, capped per client.
 *
 * Ordered by sort_order, which puts the full audit and the efficiency agents
 * first. A cap that took agents in an arbitrary order would reliably spend the
 * budget on whichever agent happened to sort first alphabetically.
 */
export function runWeeklyAdsSweep() {
  const configs = db.prepare(`
    SELECT * FROM ads_agent_config WHERE agent_type != 'anomaly' ORDER BY sort_order ASC
  `).all();

  let queued = 0;
  const perClient = [];

  for (const client of adsClients()) {
    try {
      const { available } = buildFactPack(client.id);
      const activeRuns = getActiveRunsForClient(client.id);
      let count = 0;

      for (const conf of configs) {
        if (count >= WEEKLY_CAP_PER_CLIENT) break;
        const result = maybeQueue(client, conf, available, activeRuns);
        if (result.run) {
          // Added to the local view so a second agent in the same sweep sees
          // the slot as taken rather than racing the index for it.
          activeRuns.set(conf.agent_type, result.run);
          count++;
          queued++;
        }
      }
      if (count) perClient.push(`${client.name}:${count}`);
    } catch (err) {
      console.error(`[ADS SCHEDULER] Weekly sweep failed for ${client.name}:`, err.message);
    }
  }

  console.log(`[ADS SCHEDULER] Weekly sweep: ${queued} queued${perClient.length ? ` (${perClient.join(', ')})` : ''}.`);
  return { queued, perClient };
}
