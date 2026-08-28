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
 * with? Two things clear a count, and both have to work:
 *
 *   1. Doing the work — running the due audit, publishing the draft, delivering
 *      the task. The item stops matching the query at all.
 *   2. Looking at the tab — the badge told you, you went, you saw. Opening a tab
 *      stamps `tab_seen`, and from then on only items that became actionable
 *      *after* that stamp count. The next client reply, the next audit to go
 *      stale, restarts the number at 1.
 *
 * The second rule is why every count below is a "since" query rather than a
 * plain total. A total can only be cleared by the first rule, which is fine for
 * scripts but impossible for "audits that are due" — nothing you do in the SEO
 * Monitor makes a stale audit un-stale except running it, so a total would sit
 * there and the badge would teach you to ignore it.
 */

import db from '../../database.js';

/** Silent above this, to keep the badge readable. */
const MAX_DISPLAY = 99;

/**
 * Timestamps in this database are written two ways: SQLite's own
 * `datetime('now')` gives `2026-08-09 05:08:18`, while the route handlers use
 * `new Date().toISOString()` and give `2026-08-09T05:08:18.000Z`. Both are UTC,
 * but they do not compare as strings — 'T' sorts after ' ', so an ISO value
 * always looks newer than a SQLite one. Every comparison below goes through
 * this, which flattens both to `YYYY-MM-DD HH:MM:SS`.
 */
const NORM = (col) => `replace(substr(${col}, 1, 19), 'T', ' ')`;

/**
 * The user's mark for a tab, or '' when they have never opened it.
 *
 * Empty string sorts before every real timestamp, so a first-time user sees the
 * full outstanding count rather than a silent dashboard.
 */
function seenAt(userId, tab) {
  if (!userId) return '';
  const row = db.prepare('SELECT seen_at FROM tab_seen WHERE user_id = ? AND tab = ?').get(userId, tab);
  return row ? row.seen_at : '';
}

/** Record that the user has looked at a tab, from this moment on. */
export function markTabSeen(userId, tab) {
  if (!userId || !tab) return;
  db.prepare(`
    INSERT INTO tab_seen (user_id, tab, seen_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id, tab) DO UPDATE SET seen_at = datetime('now')
  `).run(userId, tab);
}

/**
 * SEO audits that are due.
 *
 * Mirrors the freshness rule the SEO Monitor cards colour by, so the badge and
 * the amber cards can never disagree. On-demand skills (a very large
 * stale_after_days) and skills the trigger route refuses are excluded — neither
 * is work anyone can act on.
 *
 * An audit's "due since" is the moment it went stale: the last run plus its
 * stale_after_days, or — if it has never run — the moment the client was added.
 * Counting only the ones that went stale after `since` is what lets the badge
 * clear on a click and come back on its own when the next skill ages out.
 */
const ON_DEMAND_THRESHOLD_DAYS = 365;
// Skills nothing can make due, because no amount of waiting makes them
// runnable. `dataforseo` and `maps` used to be here too; they are gated on
// whether the worker actually reports DataForSEO, so once it is configured they
// age out and become due like anything else. Leaving them listed would have
// meant a configured, paid API whose two skills never once appeared in the
// badge — the reverse of the problem this count exists to solve.
const UNRUNNABLE_SKILLS = ['image_gen', 'drift'];

function countDueAudits(since) {
  const placeholders = UNRUNNABLE_SKILLS.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT CASE
               WHEN a.last_run IS NULL THEN ${NORM('c.created_at')}
               ELSE datetime(${NORM('a.last_run')}, '+' || conf.stale_after_days || ' days')
             END AS due_at
      FROM crm_clients c
      CROSS JOIN agent_run_config conf
      LEFT JOIN (
        SELECT client_id, audit_type, MAX(created_at) AS last_run
        FROM seo_audits WHERE is_competitor = 0
        GROUP BY client_id, audit_type
      ) a ON a.client_id = c.id AND a.audit_type = conf.audit_type
      WHERE c.is_active = 1
        AND c.client_type != 'artist_curation'
        AND c.website_url IS NOT NULL
        AND conf.stale_after_days < ?
        AND conf.audit_type NOT IN (${placeholders})
    )
    WHERE due_at <= datetime('now') AND due_at > ?
  `).get(ON_DEMAND_THRESHOLD_DAYS, ...UNRUNNABLE_SKILLS, since);
  return row.n;
}

/**
 * Scripts the client has responded to.
 *
 * `has_unseen_changes` is cleared by opening that client in the Script Tracker,
 * which is the "I have worked through this" signal; `updated_at > since` is the
 * "I have at least looked" one. A client approving or rejecting again bumps
 * updated_at, so the badge comes back at 1 — which is the whole point.
 */
function countScriptResponses(since) {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM marketing_scripts
    WHERE has_unseen_changes = 1
      AND last_changed_by = 'client'
      AND ${NORM('updated_at')} > ?
  `).get(since);
  return row.n;
}

/**
 * Tasks past their due date and not delivered.
 *
 * A task becomes overdue at midnight after its due date, so that — not the due
 * date itself — is what `since` is measured against. Today's newly-overdue
 * tasks count even if you dismissed yesterday's.
 *
 * A task logged today with last week's due date is overdue from the moment it
 * exists, not from a midnight that has already passed, so the later of the two
 * is what counts. Without the max() a backdated task would arrive silently.
 */
function countOverdueTasks(since) {
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM kanban_tasks
    WHERE status != 'delivered'
      AND due_date IS NOT NULL
      AND date(due_date) < date('now')
      AND max(datetime(date(due_date), '+1 day'), ${NORM('created_at')}) > ?
  `).get(since);
  return row.n;
}

/**
 * Blog posts drafted but never published.
 *
 * Keyed on created_at, not updated_at: a draft is news once. Re-badging every
 * time someone edits their own draft would be a count of your own typing.
 */
function countDraftPosts(since) {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS n FROM blog_posts
      WHERE status = 'draft' AND ${NORM('created_at')} > ?
    `).get(since);
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
const COUNTERS = {
  seo: countDueAudits,
  scripts: countScriptResponses,
  tasks: countOverdueTasks,
  blog: countDraftPosts,
};

/** Tab ids that carry a badge, so callers can reject anything else. */
export const BADGED_TABS = Object.keys(COUNTERS);

export function getTabNotifications(userId) {
  // Keys are the tab ids Dashboard.jsx passes to setActiveTab. The
  // client-workspaces badge is deliberately absent — it is driven by per-client
  // unseen message counts the workspace view already tracks, and duplicating
  // that here would give two sources for one number.
  const out = {};
  for (const [tab, fn] of Object.entries(COUNTERS)) {
    try {
      const n = fn(seenAt(userId, tab));
      if (n > 0) out[tab] = Math.min(n, MAX_DISPLAY);
    } catch (err) {
      console.error(`[TAB NOTIFICATIONS] '${tab}' count failed:`, err.message);
    }
  }
  return out;
}
