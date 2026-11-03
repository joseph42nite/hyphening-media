/**
 * Handlers for the bots' and workers' own pipelines: the night blog and SEO
 * runs (claim, log, queue, review), competitor discovery, SEO run claims, the
 * skill inventory and agent activity lines.
 * Dispatched from src/routes/webhooks.js after the signature check.
 */

import db from '../../database.js';
import {
  claimBlogRuns,
  addBlogTopics,
  queueBlogRuns,
  listBlogRunsForAgents,
  getBlogRunForAgent,
  retryBlogRun,
} from '../services/blogRuns.js';
import { pushRunSignal } from '../services/macConnector.js';
import { queueOutreachRuns } from '../services/outreach.js';
import { queueNightAudits, queueSeoFixes } from '../services/seoNight.js';
import { getRun, broadcastRunLog } from '../services/agentRuns.js';

// ============================================================
// NIGHT BLOG PIPELINE (src/services/blogRuns.js)
// ============================================================

/** The Mac's blog worker claims tonight's queued posts, with each client's blog-config. */
export function handleClaimBlogRuns(payload) {
  const limit = Math.min(parseInt(payload?.limit, 10) || 1, 5);
  const runs = claimBlogRuns(payload?.worker_id || 'local', limit);
  if (runs.length) console.log(`[OPENCLAW] Blog worker '${payload?.worker_id || 'local'}' claimed ${runs.length} run(s): ${runs.map(r => `#${r.run_id}`).join(', ')}`);
  return { success: true, summary: `Claimed ${runs.length} blog run(s)`, data: { runs } };
}

/** A bot loads a client's approved calendar: { client_id, topics: [{ topic, target_keyword?, planned_for?, notes? }] }. */
export function handleAddBlogTopics(payload) {
  const result = addBlogTopics(parseInt(payload?.client_id, 10), payload?.topics, payload?.created_by || 'agent');
  if (result.error) return { success: false, summary: result.error };
  return { success: true, summary: `Added ${result.ids.length} blog topic(s)`, data: { ids: result.ids } };
}

/**
 * Leiter's 01:00 IST routine starts the night: one post per client with Blog
 * on, only while the Blog fleet is on Auto (the switch in the Blog Monitor),
 * then wakes the Mac's blog worker.
 */
export function handleQueueBlogRuns(payload) {
  const queued = queueBlogRuns({ requestedBy: payload?.by || 'agent' });
  if (queued.length) pushRunSignal('blog');
  return {
    success: true,
    summary: queued.length
      ? `Queued ${queued.length} post(s): ${queued.map(q => q.client_name).join(', ')}`
      : 'Nothing queued (Blog fleet on Manual, or no client has Blog on, posts left this month and a planned topic)',
    data: { queued },
  };
}

/** Tanner, 01:15 IST: queue each SEO-on client's overdue skills (SEO fleet on Auto only). */
export function handleQueueSeoNight(payload) {
  const { queued, skipped } = queueNightAudits({ by: payload?.by || 'agent' });
  if (queued.length) pushRunSignal('seo');
  const why = skipped.map(s => (s.client_name ? `${s.client_name}: ${s.reason}` : s.reason)).join('; ');
  return {
    success: true,
    summary: queued.length
      ? `Queued ${queued.length} skill run(s): ${queued.map(q => `${q.client_name} ${q.agent_type}`).join(', ')}${why ? ` (skipped: ${why})` : ''}`
      : `Nothing queued${why ? ` (${why})` : ''}`,
    data: { queued, skipped },
  };
}

/** Boothroyd, 03:30 IST: one fix batch per SEO-on client with a site repo, then wake the fix worker. */
export function handleQueueSeoFixes(payload) {
  const { queued, skipped } = queueSeoFixes({ by: payload?.by || 'agent' });
  if (queued.length) pushRunSignal('seo_fix');
  const why = skipped.map(s => (s.client_name ? `${s.client_name}: ${s.reason}` : s.reason)).join('; ');
  return {
    success: true,
    summary: queued.length
      ? `Queued fixes for ${queued.map(q => q.client_name).join(', ')}${why ? ` (skipped: ${why})` : ''}`
      : `Nothing queued${why ? ` (${why})` : ''}`,
    data: { queued, skipped },
  };
}

/** The bots' list of drafts (no bodies): { statuses?: [...], since_hours? }. */
export function handleListBlogRuns(payload) {
  const runs = listBlogRunsForAgents(Array.isArray(payload?.statuses) && payload.statuses.length ? payload.statuses : undefined, parseInt(payload?.since_hours, 10) || 72);
  return { success: true, summary: `${runs.length} blog run(s)`, data: { runs } };
}

/** One draft in full, for Vesper's review: { run_id }. */
export function handleGetBlogRun(payload) {
  const run = getBlogRunForAgent(parseInt(payload?.run_id, 10));
  if (!run) return { success: false, summary: `Blog run #${payload?.run_id} not found` };
  return { success: true, summary: `Blog run #${run.id}`, data: { run } };
}

/** Q retries a failed run: { run_id, by }. */
export function handleRetryBlogRun(payload) {
  const result = retryBlogRun(payload);
  if (result.success) pushRunSignal('blog');
  return result;
}

/** Progress lines from the blog worker, relayed live to the Blog tab. */
export function handleBlogRunLog(payload) {
  const runId = parseInt(payload?.run_id, 10);
  const line = typeof payload?.log === 'string' ? payload.log.slice(0, 1000) : null;
  if (!runId || !line) return { success: false, summary: 'run_id and log are required' };
  import('../../server.js').then(({ broadcastEvent }) => broadcastEvent('blog_run_log', { run_id: runId, log: line }))
    .catch(() => { /* a lost log line must not fail the call */ });
  return { success: true, summary: `Relayed log for blog run #${runId}` };
}

/**
 * Relays a progress line from the local worker to the dashboard terminal.
 *
 * The terminal used to be fed by the runner's stdout, which the backend could
 * read because it spawned the process itself. A pull worker runs on another
 * machine, so it has to send its own progress — otherwise a run shows as
 * `running` for several minutes with nothing to indicate whether it is working
 * or hung, which is exactly the blindness that made the OpenClaw failures so
 * slow to diagnose.
 *
 * Not persisted, matching the existing terminal behaviour: this is a live view,
 * and the durable record is the audit plus the artifacts on the worker.
 */
export function handleSeoRunLog(payload) {
  const runId = parseInt(payload?.run_id, 10);
  const line = typeof payload?.log === 'string' ? payload.log : null;
  if (!runId || !line) {
    return { success: false, summary: 'run_id and log are required' };
  }

  const run = getRun(runId);
  if (!run) return { success: false, summary: `Run #${runId} not found` };

  broadcastRunLog(run, line);
  return { success: true, summary: `Relayed log for run #${runId}` };
}

/**
 * Records competitors the worker found via live search.
 *
 * Everything lands as 'discovered', never 'approved' — a search result is a
 * suggestion, not a verdict. Directories and aggregators (JustDial, Practo,
 * Yelp) routinely outrank the actual businesses for head terms, and auditing
 * one costs ten minutes and real tokens for a report about a listing page.
 *
 * A domain already marked 'rejected' stays rejected: discovery re-runs would
 * otherwise re-propose the same directories every time.
 */
export function handleReportCompetitors(payload) {
  const clientId = parseInt(payload?.client_id, 10);
  if (!clientId || !Array.isArray(payload?.competitors)) {
    return { success: false, summary: 'client_id and a competitors array are required' };
  }

  const client = db.prepare('SELECT website_url FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) return { success: false, summary: `Client ${clientId} not found` };

  let ownDomain = null;
  try { ownDomain = new URL(client.website_url).hostname.replace(/^www\./, ''); } catch { /* no valid site */ }

  const insert = db.prepare(`
    INSERT INTO client_competitors (client_id, domain, url, label, status, discovered_for_query, discovered_position)
    VALUES (?, ?, ?, ?, 'discovered', ?, ?)
    ON CONFLICT(client_id, domain) DO UPDATE SET
      -- Only refresh the discovery context. status is deliberately untouched:
      -- a human decision, either way, outranks a fresh search result.
      discovered_for_query = excluded.discovered_for_query,
      discovered_position = excluded.discovered_position,
      updated_at = datetime('now')
  `);

  let added = 0;
  let skipped = 0;
  const store = db.transaction(() => {
    for (const c of payload.competitors) {
      let parsed;
      try { parsed = new URL(String(c?.url || '').startsWith('http') ? c.url : `https://${c?.url}`); }
      catch { skipped++; continue; }

      const domain = parsed.hostname.replace(/^www\./, '');
      if (ownDomain && domain === ownDomain) { skipped++; continue; }

      insert.run(
        clientId, domain, parsed.origin, c.label || null,
        c.query || null,
        Number.isInteger(c.position) ? c.position : null,
      );
      added++;
    }
  });
  store();

  console.log(`[WEBHOOK] Competitor discovery for client ${clientId}: ${added} recorded, ${skipped} skipped.`);
  return {
    success: true,
    summary: `Recorded ${added} competitor(s) as discovered, skipped ${skipped}. All await approval before they can be audited.`,
  };
}

/**
 * Hands queued SEO runs to the local worker.
 *
 * Inverts how audits have been dispatched. Until now the backend reached out to
 * the runner, which needed a Tailscale tunnel into a machine we do not control;
 * when that tunnel dropped on 2026-08-01 runs 6 and 7 died with nothing to show
 * for it. Here the worker calls us, so the laptop needs no inbound connectivity
 * and a machine that was asleep simply picks up its backlog on waking.
 *
 * Claiming marks runs `running` in the same transaction that returns them, so
 * two workers cannot take the same job.
 */
export function handleClaimSeoRuns(payload) {
  const limit = Math.min(parseInt(payload?.limit, 10) || 1, 5);
  const worker = payload?.worker_id || 'local';

  const claim = db.transaction(() => {
    const queued = db.prepare(`
      SELECT r.id, r.client_id, r.agent_type, r.requested_by, c.website_url, c.name AS client_name,
             c.gsc_property, c.ga4_property_id, r.target_url, r.is_competitor, r.competitor_domain
      FROM seo_agent_runs r
      JOIN crm_clients c ON c.id = r.client_id
      WHERE r.status = 'queued'
      ORDER BY r.id ASC
      LIMIT ?
    `).all(limit);

    const mark = db.prepare(`
      UPDATE seo_agent_runs
      SET status = 'running', started_at = datetime('now'), actual_model = ?
      WHERE id = ? AND status = 'queued'
    `);
    // actual_model records the claiming worker until the run reports the model
    // that really served it, so a job in flight is attributable to a machine.
    const taken = queued.filter(r => mark.run(`worker:${worker}`, r.id).changes === 1);
    return taken;
  });

  const runs = claim();
  if (runs.length) {
    console.log(`[OPENCLAW] Worker '${worker}' claimed ${runs.length} SEO run(s): ${runs.map(r => `#${r.id} ${r.agent_type}`).join(', ')}`);
  }

  return {
    success: true,
    summary: `Claimed ${runs.length} run(s) for worker '${worker}'.`,
    data: {
      runs: runs.map(r => ({
        run_id: r.id,
        client_id: r.client_id,
        client_name: r.client_name,
        audit_type: r.agent_type,
        // target_url overrides the client's own site for competitor research.
        // Falls back to website_url, so every existing run behaves unchanged.
        url: r.target_url || r.website_url,
        requested_by: r.requested_by,
        is_competitor: r.is_competitor === 1,
        // Passed per run rather than defaulted in the plugin's own config, so a
        // Search Console query can never return another client's data. Null
        // means the skill reports that section as unavailable.
        //
        // Deliberately withheld for competitor runs: we have no Search Console
        // access to anyone else's domain, and passing the client's property
        // while auditing a competitor's URL would attribute our own search data
        // to their site — the same wrong-client-data failure this field exists
        // to prevent.
        gsc_property: r.is_competitor === 1 ? null : (r.gsc_property || null),
        ga4_property_id: r.is_competitor === 1 ? null : (r.ga4_property_id || null),
        // The domain a backlink_gap run compares against. Null for every other
        // audit type, so a worker that ignores the field behaves exactly as it
        // did before — the field is additive to the wire format, not a change
        // to it.
        competitor_domain: r.competitor_domain || null,
      })),
    },
  };
}

/**
 * Stores OpenClaw's report of what it actually has installed.
 *
 * Each report is a full snapshot, so the skills table is replaced wholesale —
 * a skill that vanishes from OpenClaw must vanish here rather than linger as a
 * stale healthy row and keep its trigger enabled.
 */
export function handleSkillInventoryReport(payload) {
  if (!Array.isArray(payload?.skills)) {
    return { success: false, summary: 'skills must be an array' };
  }

  const reportedAt = payload.reported_at || new Date().toISOString();
  const bool = (v) => (v ? 1 : 0);

  // A skill is usable only if its frontmatter parsed and no BOM precedes it —
  // the two conditions that made seo-geo undiscoverable. The webhook pointer is
  // recorded but deliberately excluded here; see migration 058.
  const isHealthy = (s) => bool(s.frontmatter_parsed && !s.bom_present);
  const unhealthy = payload.skills.filter(s => !isHealthy(s)).map(s => s.name || s.dirname);

  const store = db.transaction(() => {
    const reportId = db.prepare(`
      INSERT INTO agent_skill_reports (
        reported_at, trigger, runner_model, skill_count, unhealthy_count,
        missing_skills, unexpected_skills
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportedAt,
      payload.trigger || 'on_demand',
      payload.runner_model || null,
      payload.skills.length,
      unhealthy.length,
      JSON.stringify(payload.missing_skills || []),
      JSON.stringify(payload.unexpected_skills || [])
    ).lastInsertRowid;

    db.prepare('DELETE FROM agent_skills').run();

    const insert = db.prepare(`
      INSERT INTO agent_skills (
        report_id, name, version, dirname, byte_size, sha256, lines,
        frontmatter_parsed, frontmatter_error, bom_present, has_references,
        has_templates, has_assets, webhook_pointer_present, last_modified,
        healthy, reported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of payload.skills) {
      const name = s.name || s.dirname;
      if (!name) continue;
      insert.run(
        reportId, name, s.version || null, s.dirname || null,
        s.byte_size ?? null, s.sha256 || null, s.lines ?? null,
        bool(s.frontmatter_parsed), s.frontmatter_error || null,
        bool(s.bom_present), bool(s.has_references), bool(s.has_templates),
        bool(s.has_assets), bool(s.webhook_pointer_present),
        s.last_modified || null, isHealthy(s), reportedAt
      );
    }

    return reportId;
  });

  const reportId = store();

  const missing = payload.missing_skills || [];
  if (unhealthy.length || missing.length) {
    console.warn(`[AGENT] Skill inventory #${reportId}: ${unhealthy.length} unhealthy${unhealthy.length ? ` (${unhealthy.join(', ')})` : ''}, ${missing.length} missing${missing.length ? ` (${missing.join(', ')})` : ''}.`);
  } else {
    console.log(`[AGENT] Skill inventory #${reportId}: ${payload.skills.length} skills, all healthy.`);
  }

  return {
    success: true,
    summary: `Skill inventory recorded: ${payload.skills.length} skills, ${unhealthy.length} unhealthy, ${missing.length} missing.`
  };
}

export function handleAgentActivityLog(payload) {
  const { action, status, summary, client, details } = payload;
  if (!action || !status || !summary) {
    return { success: false, summary: 'action, status, and summary are required for activity log' };
  }

  db.prepare(`
    INSERT INTO agent_activity_log (action, status, summary, client, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(action, status, summary, client || null, details ? JSON.stringify(details) : null);

  // Broadcast activity log to frontend in real-time
  import('../../server.js').then(({ broadcastEvent }) => {
    broadcastEvent('agent_activity_log', payload);
  }).catch(err => console.error('[WEBHOOK] Broadcast agent_activity_log failed:', err));

  return { success: true, summary: `Logged activity: ${summary}` };
}

/** Boothroyd's weekly start: one outreach run per SEO-on client, then wake the Mac's outreach worker. */
export function handleQueueOutreachRuns(payload) {
  const { queued, skipped } = queueOutreachRuns({ by: payload?.by || 'agent' });
  if (queued.length) pushRunSignal('outreach');
  const why = skipped.map(s => `${s.client_name}: ${s.reason}`).join('; ');
  return {
    success: true,
    summary: queued.length
      ? `Queued outreach for ${queued.map(q => q.client_name).join(', ')}${why ? ` (skipped: ${why})` : ''}`
      : `Nothing queued${why ? ` (${why})` : ' (no client has SEO on)'}`,
    data: { queued, skipped },
  };
}
