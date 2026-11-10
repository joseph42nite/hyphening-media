/**
 * What a backlink gap report turns into.
 *
 * A gap report (audit_type 'backlink_gap', scripts/seo_worker.mjs) lists the
 * domains linking to one approved competitor but not to the client, each with
 * a type. Different types are different work:
 *
 *   directory            submit a profile → a task in Manual tasks
 *   news_pr              usually a paid placement → a task for 007 to decide
 *   blog, resource,
 *   community            a person to write to → an outreach candidate
 *   irrelevant           nothing; stays in the report
 *
 * Tasks are stored as recommendations of the gap audit, already sorted
 * (not_code, Backlinks & off-site), so the night worker leaves them alone and
 * the Manual tasks tab shows them at once. The same domain found against two
 * competitors shares a manual_group and shows as one task.
 */

import db from '../../database.js';

export const OUTREACH_TYPES = ['blog', 'resource', 'community'];
/** How old a gap report outreach still uses. */
export const GAP_MAX_AGE_DAYS = 60;

const clean = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/** The report's gap list, cleaned: each item has a domain and a known type. */
export function gapDomains(report) {
  const list = Array.isArray(report?.gap_domains) ? report.gap_domains : [];
  return list
    .map((g) => ({ ...g, domain: clean(g?.domain), type: String(g?.type || '').toLowerCase() }))
    .filter((g) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(g.domain));
}

/** Manual tasks for the directory and news/PR domains of one gap report. */
export function gapTasks({ clientName, competitor, report }) {
  const tasks = [];
  for (const g of gapDomains(report)) {
    const why = g.why ? ` (${String(g.why).slice(0, 200)})` : '';
    const base = {
      page_url: `https://${g.domain}/`,
      fix_triage: 'not_code',
      manual_area: 'offsite',
      manual_group: `gap:${g.domain}`,
    };
    if (g.type === 'directory') {
      tasks.push({
        ...base,
        priority: (g.rank || 0) >= 50 ? 'High' : 'Medium',
        metric: 'Directory listing',
        issue: `${g.domain} lists ${competitor} but not ${clientName}${why}.`,
        action_required: `Submit ${clientName} to ${g.domain}. Check the site is real and the listing is free, or worth its price, before submitting.`,
        fix_reason: `From the backlink gap against ${competitor}: a profile to submit, not an email to send.`,
      });
    } else if (g.type === 'news_pr') {
      tasks.push({
        ...base,
        priority: 'Low',
        metric: 'News or PR placement',
        issue: `${g.domain} links to ${competitor} but not ${clientName}${why}. Placements on sites like this are usually paid.`,
        action_required: `Decide whether a placement on ${g.domain} is worth paying for. If it is, ask for their rates; if not, mark this as not doing.`,
        fix_reason: `From the backlink gap against ${competitor}: likely a paid placement, so 007 decides.`,
      });
    }
  }
  return tasks;
}

/**
 * Outreach candidates from each approved competitor's latest gap report:
 * the blog, resource and community domains, best ranked first, without the
 * pages outreach already knows. A domain found against several competitors
 * comes once, naming all of them.
 */
export function outreachGapCandidates(clientId, knownPages = []) {
  const known = new Set(knownPages);
  const audits = db.prepare(`
    SELECT a.competitor_domain, a.report_json FROM seo_audits a
    JOIN client_competitors c ON c.client_id = a.client_id AND c.domain = a.competitor_domain AND c.status = 'approved'
    WHERE a.client_id = ? AND a.audit_type = 'backlink_gap' AND COALESCE(a.is_competitor, 0) = 0
      AND a.created_at >= datetime('now', ?)
      AND a.id = (SELECT MAX(b.id) FROM seo_audits b WHERE b.client_id = a.client_id AND b.audit_type = 'backlink_gap'
                  AND b.competitor_domain = a.competitor_domain AND COALESCE(b.is_competitor, 0) = 0)
  `).all(clientId, `-${GAP_MAX_AGE_DAYS} days`);

  const byDomain = new Map();
  for (const a of audits) {
    let report = null;
    try { report = JSON.parse(a.report_json || 'null'); } catch { continue; }
    for (const g of gapDomains(report)) {
      if (!OUTREACH_TYPES.includes(g.type)) continue;
      const page_url = `https://${g.domain}/`;
      if (known.has(page_url)) continue;
      const seen = byDomain.get(g.domain);
      if (seen) {
        if (!seen.competitor_domains.includes(a.competitor_domain)) seen.competitor_domains.push(a.competitor_domain);
        seen.domain_rank = Math.max(seen.domain_rank || 0, Number(g.rank) || 0);
        continue;
      }
      byDomain.set(g.domain, {
        site_domain: g.domain,
        page_url,
        type: g.type,
        why: g.why ? String(g.why).slice(0, 200) : null,
        domain_rank: Number(g.rank) || null,
        competitor_domains: [a.competitor_domain],
      });
    }
  }
  return [...byDomain.values()].sort((x, y) => (y.domain_rank || 0) - (x.domain_rank || 0));
}

/**
 * The latest gap report against each competitor of a client, summarised:
 * { [domain]: { auditId, checkedAt, directories, news_pr, outreach, irrelevant, untyped } }.
 * What the Competitors panel, the gap card's picker and Manual tasks show.
 */
export function gapStatusByCompetitor(clientId) {
  const rows = db.prepare(`
    SELECT a.id, a.competitor_domain, a.created_at, a.report_json FROM seo_audits a
    WHERE a.client_id = ? AND a.audit_type = 'backlink_gap' AND COALESCE(a.is_competitor, 0) = 0
      AND a.competitor_domain IS NOT NULL
      AND a.id = (SELECT MAX(b.id) FROM seo_audits b WHERE b.client_id = a.client_id AND b.audit_type = 'backlink_gap'
                  AND b.competitor_domain = a.competitor_domain AND COALESCE(b.is_competitor, 0) = 0)
  `).all(clientId);
  const out = {};
  for (const r of rows) {
    let report = null;
    try { report = JSON.parse(r.report_json || 'null'); } catch { /* counts stay 0 */ }
    const gaps = gapDomains(report);
    const n = (types) => gaps.filter((g) => types.includes(g.type)).length;
    out[r.competitor_domain] = {
      auditId: r.id,
      checkedAt: r.created_at,
      directories: n(['directory']),
      news_pr: n(['news_pr']),
      outreach: n(OUTREACH_TYPES),
      irrelevant: n(['irrelevant']),
      untyped: gaps.filter((g) => !g.type).length,
    };
  }
  return out;
}
