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

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

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

/** GA4 sessions for the client's own site in that month, or throws. */
async function ga4Sessions(propertyId, websiteUrl, month, sources) {
  const rows = (await sources.getSessionMonths(propertyId, monthRange(month))).filter(r => r.month === month);
  // One property can hold several sites (ads.example.com); count the client's
  // main host when it appears, everything otherwise.
  const host = hostOf(websiteUrl);
  const own = host ? rows.filter(r => r.host.replace(/^www\./, '') === host) : [];
  const use = own.length ? own : rows;
  return use.reduce((sum, r) => sum + r.sessions, 0);
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
      found.website_traffic = await ga4Sessions(client.ga4_property_id, client.website_url, month, sources);
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

    const traffic = row.website_traffic ?? updates.website_traffic;
    if (row.mom_growth_sessions == null && traffic != null) {
      const prev = db.prepare('SELECT website_traffic FROM marketing_monthly_report WHERE client_id = ? AND month = ?')
        .get(clientId, previousMonth(month));
      if (prev?.website_traffic > 0) {
        updates.mom_growth_sessions = round((traffic - prev.website_traffic) / prev.website_traffic, 4);
        filled.push('mom_growth_sessions');
      }
    }

    const sets = Object.keys(updates).map(col => `${col} = @${col}`);
    db.prepare(`
      UPDATE marketing_monthly_report SET
        ${sets.length ? sets.join(', ') + ',' : ''}
        status = 'draft',
        auto_sources = @auto_sources,
        auto_filled_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...updates, auto_sources: JSON.stringify({ filled, notes }), id: row.id });

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
