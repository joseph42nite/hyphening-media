/**
 * Counts of things waiting for attention, per dashboard tab.
 *
 * Replaces the daily Telegram digests. Those pushed a list every morning
 * whether or not anything had changed, which is how a channel gets muted — and
 * once muted it carries no signal at all. A number on the tab is only visible
 * while the work exists, disappears when it is done, and needs nobody to
 * remember to read it.
 *
 * Every count answers one question: is there something here I have not dealt
 * with? A count that never reaches zero is noise, so each definition below has
 * to describe a state that gets cleared by doing the work.
 */

import db from '../../database.js';

/** Silent above this, to keep the badge readable. */
const MAX_DISPLAY = 99;

/**
 * SEO audits that are due.
 *
 * Mirrors the freshness rule the SEO Monitor cards colour by, so the badge and
 * the amber cards can never disagree. On-demand skills (a very large
 * stale_after_days) and skills the trigger route refuses are excluded — neither
 * is work anyone can act on.
 */
const ON_DEMAND_THRESHOLD_DAYS = 365;
const UNRUNNABLE_SKILLS = new Set(['dataforseo', 'maps', 'image_gen', 'drift']);

function countDueAudits() {
  const clients = db.prepare(`
    SELECT id FROM crm_clients
    WHERE is_active = 1 AND client_type != 'artist_curation' AND website_url IS NOT NULL
  `).all();
  const configs = db.prepare('SELECT audit_type, stale_after_days FROM agent_run_config').all();
  const lastAudit = db.prepare(`
    SELECT created_at FROM seo_audits
    WHERE client_id = ? AND audit_type = ?
    ORDER BY created_at DESC LIMIT 1
  `);

  let due = 0;
  for (const client of clients) {
    for (const conf of configs) {
      if (conf.stale_after_days >= ON_DEMAND_THRESHOLD_DAYS) continue;
      if (UNRUNNABLE_SKILLS.has(conf.audit_type)) continue;

      const last = lastAudit.get(client.id, conf.audit_type);
      if (!last) { due++; continue; }
      const ageDays = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000);
      if (ageDays >= conf.stale_after_days) due++;
    }
  }
  return due;
}

/**
 * Scripts the client has responded to.
 *
 * Approved scripts are ready to produce and stop counting once posted; scripts
 * carrying client_comments are feedback nobody has worked through yet. Both
 * clear by doing the work, which is what makes them worth a badge — a count of
 * "all approved scripts ever" would sit at 41 for ever and teach you to ignore
 * the number.
 */
function countScriptResponses() {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM marketing_scripts
    WHERE status = 'Client Approved'
       OR (client_comments IS NOT NULL AND TRIM(client_comments) != '')
  `).get();
  return row.n;
}

/** Tasks past their due date and not delivered. */
function countOverdueTasks() {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM kanban_tasks
    WHERE status != 'delivered'
      AND due_date IS NOT NULL
      AND date(due_date) < date('now')
  `).get();
  return row.n;
}

/** Blog posts drafted but never published. */
function countDraftPosts() {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_posts WHERE status = 'draft'
    `).get();
    return row.n;
  } catch {
    return 0;
  }
}

/**
 * One count per tab id, matching the ids Dashboard.jsx uses for setActiveTab.
 *
 * A failing count returns 0 rather than throwing: a badge is an affordance, and
 * losing the whole dashboard because one query broke would be a poor trade.
 */
export function getTabNotifications() {
  // Keys are the tab ids Dashboard.jsx passes to setActiveTab. The
  // client-workspaces badge is deliberately absent — it is driven by per-client
  // unseen message counts the workspace view already tracks, and duplicating
  // that here would give two sources for one number.
  const counts = {
    seo: countDueAudits,
    scripts: countScriptResponses,
    tasks: countOverdueTasks,
    blog: countDraftPosts,
  };

  const out = {};
  for (const [tab, fn] of Object.entries(counts)) {
    try {
      const n = fn();
      if (n > 0) out[tab] = Math.min(n, MAX_DISPLAY);
    } catch (err) {
      console.error(`[TAB NOTIFICATIONS] '${tab}' count failed:`, err.message);
    }
  }
  return out;
}
