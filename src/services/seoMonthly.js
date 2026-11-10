/**
 * Month-end SEO report: fills a client's marketing_monthly_report row for a
 * finished month from Search Console, GA4 and our own tables. No AI involved —
 * every number is a straight API call or a count.
 *
 * Rules:
 *  - Only empty cells are filled, so nothing typed by hand is overwritten.
 *  - Any row the job writes into becomes a 'draft'; the client portal shows it
 *    only once someone presses Publish.
 *  - A missing connection (no gsc_property, no GA4 id, an API error) is written
 *    into auto_sources.notes, never as zeros.
 *
 * Runs on the 3rd of each month (scheduler.js) for the month before, because
 * Search Console's final data lags 2-3 days.
 */

import db from '../../database.js';
import * as gsc from './searchConsoleClient.js';
import { getSessionMonths } from './ga4Client.js';

// A search needs this many impressions in the month before it counts towards
// "top 3" / "top 10". Without a floor, one-off long-tail searches seen once at
// position 2 would make the count meaningless.
export const MIN_IMPRESSIONS = 10;
const TOP_QUERIES = 10;

const defaultSources = { gsc, getSessionMonths };

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export const previousMonth = (month) => shiftMonth(month, -1);
export const nextMonth = (month) => shiftMonth(month, 1);

/** The month before today's, e.g. on 2026-12-03 → '2026-11'. */
export function lastFinishedMonth(now = new Date()) {
  return previousMonth(now.toISOString().slice(0, 7));
}

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { since: `${month}-01`, until: `${month}-${String(last).padStart(2, '0')}` };
}

const round = (n, places) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/**
 * The site the report is about: the one in Search Console. website_url can be
 * an ads landing page while the main site is elsewhere (DentAlchemy runs
 * ads.dentalchemy.in until its new site is built), so it is only the fallback.
 */
export function reportHost(client) {
  const p = client.gsc_property || '';
  if (p.startsWith('sc-domain:')) return p.slice('sc-domain:'.length).toLowerCase().replace(/^www\./, '');
  return hostOf(p) || hostOf(client.website_url);
}

const growth = (now, prev) => (now != null && prev > 0 ? round((now - prev) / prev, 4) : null);

/**
 * Month-on-month growth is worked out from the stored numbers, never typed in,
 * so it is recalculated for this month and the next whenever a month changes.
 * That way the order months are filled or edited in does not matter.
 */
export function refreshMomGrowth(clientId, month) {
  const get = db.prepare('SELECT id, website_traffic, map_views FROM marketing_monthly_report WHERE client_id = ? AND month = ?');
  const set = db.prepare('UPDATE marketing_monthly_report SET mom_growth_sessions = ?, mom_growth_gmb_views = ? WHERE id = ?');
  for (const m of [month, nextMonth(month)]) {
    const row = get.get(clientId, m);
    if (!row) continue;
    const prev = get.get(clientId, previousMonth(m));
    set.run(growth(row.website_traffic, prev?.website_traffic), growth(row.map_views, prev?.map_views), row.id);
  }
}

/** Search Console numbers for one month, or throws. */
async function searchConsoleFigures(property, month, sources) {
  const range = monthRange(month);
  const [totals, queries, prevQueries] = await Promise.all([
    sources.gsc.getTotals(property, range),
    sources.gsc.getQueries(property, range),
    sources.gsc.getQueries(property, monthRange(previousMonth(month))),
  ]);
  const counted = queries.filter(q => q.impressions >= MIN_IMPRESSIONS);
  const prevPos = new Map(prevQueries.map(q => [q.query, q.position]));
  const top = [...queries]
    .sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions))
    .slice(0, TOP_QUERIES)
    .map(q => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      position: round(q.position, 1),
      prev_position: round(prevPos.get(q.query) ?? null, 1),
    }));
  return {
    search_clicks: totals.clicks,
    search_impressions: totals.impressions,
    avg_position: round(totals.position, 1),
    queries_top3: counted.filter(q => q.position <= 3).length,
    queries_top10: counted.filter(q => q.position <= 10).length,
    top_queries: JSON.stringify(top),
  };
}

/**
 * GA4 sessions for the report's site in that month, or throws. One property
 * can carry other sites too (a landing page, another site sharing the tag,
 * localhost), so only that host is counted. Nothing for it → null, not a
 * total of whatever else is in the property.
 */
async function ga4Sessions(propertyId, host, month, sources) {
  const rows = (await sources.getSessionMonths(propertyId, monthRange(month))).filter(r => r.month === month);
  const own = rows.filter(r => (r.host || '').toLowerCase().replace(/^www\./, '') === host);
  if (!own.length) return null;
  return own.reduce((sum, r) => sum + r.sessions, 0);
}

function countFixesLive(clientId, month) {
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM seo_recommendations r
    JOIN seo_fix_batches b ON b.id = r.fix_batch_id
    WHERE r.client_id = ? AND b.status = 'live' AND substr(b.deploy_finished_at, 1, 7) = ?
  `).get(clientId, month).n;
}

function countBlogsPublished(clientId, month) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM blog_agent_runs
    WHERE client_id = ? AND status = 'published' AND substr(published_at, 1, 7) = ?
  `).get(clientId, month).n;
}

/**
 * Fills one client's report for one month. Returns { month, filled, notes, status }.
 * `sources` exists so tests can stand in for the Google APIs.
 */
export async function fillMonthlyReport(clientId, month, { sources = defaultSources } = {}) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('month must be YYYY-MM');
  const client = db.prepare('SELECT id, name, website_url, gsc_property, ga4_property_id FROM crm_clients WHERE id = ?').get(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const found = {};
  const notes = [];

  if (!client.gsc_property) {
    notes.push('Search Console not connected (no property saved for this client).');
  } else {
    try {
      Object.assign(found, await searchConsoleFigures(client.gsc_property, month, sources));
    } catch (err) {
      notes.push(`Search Console failed: ${err.message}`);
    }
  }

  if (!client.ga4_property_id) {
    notes.push('GA4 not connected (no property ID saved for this client).');
  } else {
    try {
      const host = reportHost(client);
      const sessions = host ? await ga4Sessions(client.ga4_property_id, host, month, sources) : null;
      if (sessions == null) notes.push(`GA4 has no sessions for ${host || 'the client site'} in ${month}.`);
      else found.website_traffic = sessions;
    } catch (err) {
      notes.push(`GA4 failed: ${err.message}`);
    }
  }

  found.fixes_live = countFixesLive(clientId, month);
  found.blogs = countBlogsPublished(clientId, month);

  const write = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO marketing_monthly_report (client_id, month, status) VALUES (?, ?, \'draft\')')
      .run(clientId, month);
    const row = db.prepare('SELECT * FROM marketing_monthly_report WHERE client_id = ? AND month = ?').get(clientId, month);

    // Only empty cells. A hand-typed 0 counts as filled.
    const filled = Object.keys(found).filter(col => row[col] == null && found[col] != null);
    const updates = Object.fromEntries(filled.map(col => [col, found[col]]));

    // Keep what earlier runs filled; a rerun that finds nothing empty must not
    // make the row look hand-typed.
    let earlier = [];
    try { earlier = JSON.parse(row.auto_sources || '{}').filled || []; } catch { /* old free text */ }
    const allFilled = [...new Set([...earlier, ...filled])];

    const sets = Object.keys(updates).map(col => `${col} = @${col}`);
    db.prepare(`
      UPDATE marketing_monthly_report SET
        ${sets.length ? sets.join(', ') + ',' : ''}
        status = 'draft',
        auto_sources = @auto_sources,
        auto_filled_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...updates, auto_sources: JSON.stringify({ filled: allFilled, notes }), id: row.id });

    refreshMomGrowth(clientId, month);
    return filled;
  });

  const filled = write();
  return { month, filled, notes, status: 'draft' };
}

/** Every active marketing client with a website, for the month that just ended. */
export async function runMonthEnd({ month = lastFinishedMonth(), sources = defaultSources } = {}) {
  const clients = db.prepare(`
    SELECT id, name FROM crm_clients
    WHERE is_active = 1 AND client_type = 'marketing' AND website_url IS NOT NULL AND website_url <> ''
  `).all();
  const results = [];
  for (const c of clients) {
    try {
      results.push({ client_id: c.id, name: c.name, ...(await fillMonthlyReport(c.id, month, { sources })) });
    } catch (err) {
      results.push({ client_id: c.id, name: c.name, month, error: err.message });
    }
  }
  for (const r of results) {
    console.log(`[SEO MONTHLY] ${r.name} ${month}: ${r.error ? 'ERROR ' + r.error : `filled ${r.filled.length} (${r.filled.join(', ') || 'none'})${r.notes.length ? ' — ' + r.notes.join(' ') : ''}`}`);
  }
  return results;
}

export function setReportStatus(clientId, month, status) {
  if (!['draft', 'published'].includes(status)) throw new Error('status must be draft or published');
  return db.prepare("UPDATE marketing_monthly_report SET status = ?, updated_at = datetime('now') WHERE client_id = ? AND month = ?")
    .run(status, clientId, month).changes;
}
