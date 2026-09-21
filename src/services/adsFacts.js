/**
 * Builds the fact pack an ads agent runs on.
 *
 * This module is the reason the Ads Monitor is cheap to run and hard to
 * fabricate against. Three things follow from doing the work here rather than
 * in the skill:
 *
 * 1. Every number is computed in SQL/JS. The model is handed CTR, CPC, CPL,
 *    qualification rate, pacing and ROAS already calculated and is asked to
 *    explain them, not to derive them. LLM arithmetic over a hundred campaign
 *    rows is both the slowest and the least reliable part of an audit.
 * 2. One database pass per run instead of a conversation. The worker receives
 *    the whole pack in the claim response, so a run is a single model call with
 *    no tool round-trips — which is most of the wall-clock difference between
 *    an ads audit and an SEO audit that has to crawl.
 * 3. A section that has no data is ABSENT and named in `gaps`, never present
 *    and empty. An agent whose required section is missing does not run at all.
 *    The SEO fleet learned this the expensive way: a skill with no data source
 *    does not fail, it writes a plausible audit from training knowledge, and a
 *    fabricated "cut Meta by 40%" is indistinguishable from a real one until
 *    someone acts on it.
 *
 * Everything here is read-only and pure with respect to the database: the same
 * rows always produce the same pack, which is what makes `facts_hash` a usable
 * check on whether two runs disagreed about the account or about the numbers.
 */

import crypto from 'crypto';
import db from '../../database.js';

/** Rounds to `dp` places, or null when the input is not a finite number. */
function round(value, dp = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** a/b as a percentage, null when the denominator cannot support one. */
function pct(numerator, denominator, dp = 2) {
  if (!denominator) return null;
  return round((numerator / denominator) * 100, dp);
}

/** a/b, null when the denominator is zero — a divide-by-zero here becomes
 *  Infinity, and Infinity serialised into a prompt reads as a real number. */
function ratio(numerator, denominator, dp = 2) {
  if (!denominator) return null;
  return round(numerator / denominator, dp);
}

/** Percentage change from `from` to `to`. Null when `from` is zero: growth
 *  from nothing is not a percentage, and reporting it as one is how "CPL up
 *  ∞%" reaches a client report. */
function delta(to, from, dp = 1) {
  if (from == null || to == null || from === 0) return null;
  return round(((to - from) / Math.abs(from)) * 100, dp);
}

/** 'YYYY-MM' for today, in the same shape the campaign rows store. */
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** The month before `month`. */
function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Campaign rows carry `month`, but older ones were written before that column
 *  existed; fall back to the creation date so they are not silently dropped. */
const CAMPAIGN_MONTH = `COALESCE(month, strftime('%Y-%m', created_at))`;

/**
 * Derived efficiency metrics for one campaign row.
 *
 * Recomputed from the raw counters rather than read from ctr_pct/cpc_inr/
 * cpl_inr. Those columns are maintained by the backend on write, so a row
 * edited by an import or a direct update carries stale derivations — and a
 * report explaining a CPL that no longer follows from the spend and leads
 * beside it is worse than no report. Where the stored value disagrees, both
 * are passed through so the discrepancy is visible rather than resolved
 * silently in the model's favour.
 */
function deriveCampaign(row) {
  const spend = row.total_ad_spend_inr || 0;
  const derived = {
    ctr_pct: pct(row.clicks, row.impressions),
    cpc_inr: ratio(spend, row.clicks),
    cpl_inr: ratio(spend, row.leads),
    cpm_inr: ratio(spend * 1000, row.impressions),
    lead_rate_pct: pct(row.leads, row.clicks),
  };

  const drift = [];
  const compare = [['ctr_pct', row.ctr_pct], ['cpc_inr', row.cpc_inr], ['cpl_inr', row.cpl_inr]];
  for (const [key, stored] of compare) {
    const live = derived[key];
    if (stored == null || live == null) continue;
    // 1% tolerance: the stored columns are rounded on write, so an exact
    // comparison would flag every row.
    if (Math.abs(stored - live) > Math.abs(live) * 0.01) {
      drift.push({ metric: key, stored, recomputed: live });
    }
  }

  return {
    campaign: row.ad_campaign_name,
    platform: row.platform,
    month: row.month,
    spend_inr: round(spend),
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    leads: row.leads || 0,
    ...derived,
    // Present only when the stored and recomputed values genuinely disagree,
    // so its absence is not something the model has to reason about.
    ...(drift.length ? { stored_value_drift: drift } : {}),
  };
}

/** Sums a set of campaign rows into one account-level line with its own
 *  derivations — totals of ratios are not ratios of totals, and a weighted CTR
 *  computed by averaging per-campaign CTRs is simply wrong. */
function totalise(rows) {
  const t = rows.reduce((acc, r) => ({
    spend_inr: acc.spend_inr + (r.total_ad_spend_inr || 0),
    impressions: acc.impressions + (r.impressions || 0),
    clicks: acc.clicks + (r.clicks || 0),
    leads: acc.leads + (r.leads || 0),
  }), { spend_inr: 0, impressions: 0, clicks: 0, leads: 0 });

  return {
    ...t,
    spend_inr: round(t.spend_inr),
    ctr_pct: pct(t.clicks, t.impressions),
    cpc_inr: ratio(t.spend_inr, t.clicks),
    cpl_inr: ratio(t.spend_inr, t.leads),
    cpm_inr: ratio(t.spend_inr * 1000, t.impressions),
  };
}

// ---------------------------------------------------------------------------
// Sections
//
// Each returns its data, or null when the client has nothing to say on it.
// Null is what puts the section in `gaps` and blocks the agents that need it.
// ---------------------------------------------------------------------------

/** Spend, reach and cost per lead: per campaign, per platform, per month. */
function spendSection(clientId, month) {
  const rows = db.prepare(`
    SELECT id, platform, ad_campaign_name, leads, total_ad_spend_inr, impressions, clicks,
           ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas, ${CAMPAIGN_MONTH} AS month
    FROM marketing_ad_campaigns
    WHERE client_id = ?
    ORDER BY month DESC, total_ad_spend_inr DESC
  `).all(clientId);

  if (!rows.length) return null;

  const months = [...new Set(rows.map(r => r.month).filter(Boolean))].sort().reverse();
  const focus = month && months.includes(month) ? month : months[0];
  const prior = previousMonth(focus);

  const inFocus = rows.filter(r => r.month === focus);
  const inPrior = rows.filter(r => r.month === prior);

  const focusTotals = totalise(inFocus);
  const priorTotals = inPrior.length ? totalise(inPrior) : null;

  // Platform rollups, each derived from its own totals for the same reason the
  // account line is.
  const byPlatform = {};
  for (const row of inFocus) {
    (byPlatform[row.platform] ||= []).push(row);
  }
  const platforms = Object.entries(byPlatform).map(([platform, rs]) => {
    const priorRs = inPrior.filter(r => r.platform === platform);
    const now = totalise(rs);
    const before = priorRs.length ? totalise(priorRs) : null;
    return {
      platform,
      campaigns: rs.length,
      ...now,
      share_of_spend_pct: pct(now.spend_inr, focusTotals.spend_inr),
      mom: before && {
        spend_pct: delta(now.spend_inr, before.spend_inr),
        cpl_pct: delta(now.cpl_inr, before.cpl_inr),
        ctr_pct: delta(now.ctr_pct, before.ctr_pct),
        leads_pct: delta(now.leads, before.leads),
      },
    };
  }).sort((a, b) => b.spend_inr - a.spend_inr);

  // A per-month account series so trend questions ("is CPL drifting up?") are
  // answered from the series rather than from two points the model picked.
  const series = months.map(m => {
    const t = totalise(rows.filter(r => r.month === m));
    return { month: m, spend_inr: t.spend_inr, leads: t.leads, cpl_inr: t.cpl_inr, ctr_pct: t.ctr_pct, cpc_inr: t.cpc_inr };
  }).reverse();

  return {
    focus_month: focus,
    prior_month: priorTotals ? prior : null,
    months_available: months,
    account: {
      ...focusTotals,
      mom: priorTotals && {
        spend_pct: delta(focusTotals.spend_inr, priorTotals.spend_inr),
        leads_pct: delta(focusTotals.leads, priorTotals.leads),
        cpl_pct: delta(focusTotals.cpl_inr, priorTotals.cpl_inr),
        ctr_pct: delta(focusTotals.ctr_pct, priorTotals.ctr_pct),
        cpc_pct: delta(focusTotals.cpc_inr, priorTotals.cpc_inr),
      },
    },
    platforms,
    campaigns: inFocus.map(deriveCampaign),
    monthly_series: series,
  };
}

/**
 * The outcome side: what the leads a campaign bought actually did.
 *
 * Test leads are excluded everywhere. They exist to exercise the form, and a
 * qualification rate computed over them describes the test, not the campaign.
 */
function leadsSection(clientId, month) {
  const total = db.prepare(
    'SELECT COUNT(*) AS n FROM campaign_leads WHERE client_id = ? AND is_test = 0'
  ).get(clientId).n;
  if (!total) return null;

  const rows = db.prepare(`
    SELECT platform, campaign_name, qualification_status, lead_status, call_outcome,
           appointment_status, treatment_type, rejection_reason,
           strftime('%Y-%m', created_at) AS month
    FROM campaign_leads
    WHERE client_id = ? AND is_test = 0
  `).all(clientId);

  const months = [...new Set(rows.map(r => r.month).filter(Boolean))].sort().reverse();
  const focus = month && months.includes(month) ? month : months[0];
  const inFocus = rows.filter(r => r.month === focus);

  const stageCounts = (set) => ({
    leads: set.length,
    qualified: set.filter(r => r.qualification_status === 'Qualified').length,
    disqualified: set.filter(r => r.qualification_status === 'Disqualified').length,
    pending_qualification: set.filter(r => r.qualification_status === 'Pending').length,
    reached: set.filter(r => r.call_outcome === 'Picked Up').length,
    unreachable: set.filter(r => r.call_outcome === 'No Answer').length,
    booked: set.filter(r => r.appointment_status === 'Booked').length,
    not_booked: set.filter(r => r.appointment_status === 'Not Booked').length,
    following_up: set.filter(r => r.appointment_status === 'Follow Up').length,
  });

  /** Stage counts plus the conversion rates between them. The rates are what
   *  the funnel agent reads; computing them here keeps every agent's version
   *  of "qualification rate" the same number. */
  const withRates = (set) => {
    const c = stageCounts(set);
    return {
      ...c,
      qualification_rate_pct: pct(c.qualified, c.leads),
      contact_rate_pct: pct(c.reached, c.leads),
      booking_rate_pct: pct(c.booked, c.leads),
      // Booked out of qualified, which is the rate the clinic controls, as
      // distinct from booked out of everything, which the campaign controls.
      qualified_to_booked_pct: pct(c.booked, c.qualified),
    };
  };

  const byCampaign = {};
  for (const r of inFocus) (byCampaign[r.campaign_name || '(unnamed)'] ||= []).push(r);

  const byPlatform = {};
  for (const r of inFocus) (byPlatform[r.platform || '(unknown)'] ||= []).push(r);

  // Why leads are being thrown out, most common first. A single dominant
  // reason is usually a targeting fault rather than a lead-quality one.
  const rejections = {};
  for (const r of inFocus) {
    if (r.qualification_status !== 'Disqualified') continue;
    const reason = (r.rejection_reason || '(no reason recorded)').trim();
    rejections[reason] = (rejections[reason] || 0) + 1;
  }

  return {
    focus_month: focus,
    months_available: months,
    account: withRates(inFocus),
    by_platform: Object.entries(byPlatform)
      .map(([platform, set]) => ({ platform, ...withRates(set) }))
      .sort((a, b) => b.leads - a.leads),
    by_campaign: Object.entries(byCampaign)
      .map(([campaign, set]) => ({ campaign, ...withRates(set) }))
      .sort((a, b) => b.leads - a.leads),
    rejection_reasons: Object.entries(rejections)
      .map(([reason, count]) => ({ reason, count, share_pct: pct(count, inFocus.filter(r => r.qualification_status === 'Disqualified').length) }))
      .sort((a, b) => b.count - a.count),
    treatments_booked: Object.entries(
      inFocus.filter(r => r.appointment_status === 'Booked')
        .reduce((acc, r) => { const k = r.treatment_type || '(unspecified)'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
    ).map(([treatment, count]) => ({ treatment, count })).sort((a, b) => b.count - a.count),
    // Lead rows carry no cost, so cost-per-qualified-lead is joined in
    // factPack() once both sections are known — a section computes only what
    // its own tables can support.
  };
}

/** The client's own price list, which is what turns a booking into revenue. */
function pricesSection(clientId) {
  const rows = db.prepare(
    'SELECT treatment_type, price_inr FROM client_treatment_prices WHERE client_id = ? ORDER BY price_inr DESC'
  ).all(clientId);
  if (!rows.length) return null;
  return {
    treatments: rows.map(r => ({ treatment: r.treatment_type, price_inr: round(r.price_inr) })),
    // Stated explicitly so a report cannot describe a first-treatment value as
    // a lifetime one. Nothing in this database records repeat visits.
    basis: 'First booked treatment only. No repeat-visit or lifetime value is recorded anywhere in this system.',
  };
}

/** Organic content performance — the cheapest available read on which creative
 *  angles hold attention before any of them is paid for. */
function contentSection(clientId) {
  const rows = db.prepare(`
    SELECT platform, post_type, title, date, views, likes, comments, shares, saves,
           avg_watch_time_pct, engagement_rate_pct, save_rate_pct, content_score, boosted
    FROM marketing_content_tracker
    WHERE client_id = ? AND is_tracked = 1 AND status = 'Posted' AND views > 0
    ORDER BY date DESC
    LIMIT 120
  `).all(clientId);
  if (!rows.length) return null;

  const scored = rows.map(r => ({
    title: r.title,
    platform: r.platform,
    post_type: r.post_type,
    date: r.date,
    views: r.views || 0,
    engagement_rate_pct: r.engagement_rate_pct ?? pct((r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0), r.views),
    save_rate_pct: r.save_rate_pct ?? pct(r.saves, r.views),
    avg_watch_time_pct: r.avg_watch_time_pct,
    boosted: r.boosted === 'Yes',
  }));

  const byViews = [...scored].sort((a, b) => b.views - a.views);
  const median = byViews.length ? byViews[Math.floor(byViews.length / 2)].views : 0;

  return {
    posts_analysed: scored.length,
    median_views: median,
    // Top and bottom only. The whole tracker is a large prompt for a question
    // answered by its extremes, and the median above is what makes them
    // interpretable without the middle.
    top_performers: byViews.slice(0, 10),
    weakest: byViews.slice(-5).reverse(),
    // Organic winners that were never put behind spend: the creative agent's
    // actual output is drawn from here.
    unboosted_winners: byViews.filter(p => !p.boosted && p.views > median * 1.5).slice(0, 10),
  };
}

/** What paid traffic does after the click, as far as this system can see it. */
function landingSection(clientId) {
  const landing = db.prepare(`
    SELECT channel, campaign_name, page_url, COUNT(*) AS clicks,
           strftime('%Y-%m', created_at) AS month
    FROM landing_contact_clicks WHERE client_id = ?
    GROUP BY channel, campaign_name, page_url, month
    ORDER BY month DESC, clicks DESC
  `).all(clientId);

  const fromLeads = db.prepare(`
    SELECT channel, COUNT(*) AS clicks FROM lead_contact_clicks
    WHERE client_id = ? GROUP BY channel
  `).all(clientId);

  const seo = db.prepare(`
    SELECT audit_type, url, health_score, audit_score, summary, created_at
    FROM seo_audits
    WHERE client_id = ? AND is_competitor = 0
    ORDER BY created_at DESC LIMIT 3
  `).all(clientId);

  if (!landing.length && !fromLeads.length && !seo.length) return null;

  return {
    landing_contact_clicks: landing,
    lead_contact_clicks: fromLeads,
    // Borrowed from the SEO fleet rather than re-audited. A landing page's
    // technical health is the same fact whichever monitor asks, and running a
    // second crawl to learn it would be the expensive way to be consistent.
    recent_seo_audits: seo.map(a => ({
      type: a.audit_type, url: a.url,
      score: a.health_score ?? a.audit_score,
      summary: (a.summary || '').slice(0, 400),
      at: a.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------

/**
 * The pack, plus what could not be built and why.
 *
 * `available` is the set of section keys an agent's `requires` is checked
 * against. The three synthetic keys — spend_multi_platform, spend_multi_month,
 * spend_current_month — exist because some agents need a shape of data rather
 * than a table: a platform-split audit over one platform, or a pacing audit
 * with no spend in the current month, would both produce confident prose about
 * nothing.
 */
export function buildFactPack(clientId, { month = null } = {}) {
  const client = db.prepare(
    'SELECT id, name, client_type, website_url, contact_phone FROM crm_clients WHERE id = ?'
  ).get(clientId);
  if (!client) return null;

  const sections = {};
  const gaps = [];

  const add = (key, value, reason) => {
    if (value) sections[key] = value;
    else gaps.push({ section: key, reason });
  };

  add('spend', spendSection(clientId, month),
    'No campaigns recorded in marketing_ad_campaigns for this client.');
  add('leads', leadsSection(clientId, month),
    'No non-test leads recorded in campaign_leads for this client.');
  add('prices', pricesSection(clientId),
    'No treatment prices recorded, so booked appointments cannot be valued.');
  add('content', contentSection(clientId),
    'No posted, tracked content with views recorded for this client.');
  add('landing', landingSection(clientId),
    'No landing-page contact clicks and no SEO audits recorded for this client.');

  const available = new Set(Object.keys(sections));
  const spend = sections.spend;

  if (spend) {
    if (spend.platforms.length > 1) available.add('spend_multi_platform');
    else gaps.push({ section: 'spend_multi_platform', reason: `Only one platform (${spend.platforms[0]?.platform}) ran in ${spend.focus_month}; there is nothing to split.` });

    if (spend.months_available.length > 1) available.add('spend_multi_month');
    else gaps.push({ section: 'spend_multi_month', reason: 'Only one month of spend exists, so no month-on-month change can be measured.' });

    if (spend.months_available.includes(currentMonth())) available.add('spend_current_month');
    else gaps.push({ section: 'spend_current_month', reason: `No spend recorded for the current month (${currentMonth()}); the latest is ${spend.focus_month}.` });
  }

  // The join no single section could make: leads carry no cost, campaigns carry
  // no outcome. Cost per qualified lead is the number most of these agents are
  // really being asked about, so it is computed once, here, and every agent
  // reads the same value.
  if (sections.spend && sections.leads && sections.spend.focus_month === sections.leads.focus_month) {
    const spendByCampaign = new Map(sections.spend.campaigns.map(c => [c.campaign, c]));
    sections.cost_per_outcome = {
      basis_month: sections.spend.focus_month,
      account: {
        cost_per_qualified_lead_inr: ratio(sections.spend.account.spend_inr, sections.leads.account.qualified),
        cost_per_booked_appointment_inr: ratio(sections.spend.account.spend_inr, sections.leads.account.booked),
      },
      by_campaign: sections.leads.by_campaign.map(lc => {
        const sc = spendByCampaign.get(lc.campaign);
        return {
          campaign: lc.campaign,
          // Null rather than omitted: a campaign whose leads exist but whose
          // spend row is named differently is a data problem worth seeing, not
          // a campaign to leave out of the ranking.
          spend_inr: sc ? sc.spend_inr : null,
          matched_spend_row: !!sc,
          leads: lc.leads,
          qualified: lc.qualified,
          booked: lc.booked,
          cpl_inr: sc ? ratio(sc.spend_inr, lc.leads) : null,
          cost_per_qualified_lead_inr: sc ? ratio(sc.spend_inr, lc.qualified) : null,
          cost_per_booked_inr: sc ? ratio(sc.spend_inr, lc.booked) : null,
        };
      }).sort((a, b) => (a.cost_per_qualified_lead_inr ?? Infinity) - (b.cost_per_qualified_lead_inr ?? Infinity)),
    };
    available.add('cost_per_outcome');

    // Revenue, but only where every booked treatment has a price. A partial
    // price list produces a revenue figure that silently excludes treatments,
    // which reads as underperformance rather than as missing data.
    if (sections.prices) {
      const priceOf = new Map(sections.prices.treatments.map(t => [t.treatment, t.price_inr]));
      const priced = [];
      const unpriced = [];
      for (const t of sections.leads.treatments_booked) {
        const price = priceOf.get(t.treatment);
        if (price == null) unpriced.push(t);
        else priced.push({ ...t, price_inr: price, revenue_inr: round(price * t.count) });
      }
      const revenue = priced.reduce((sum, p) => sum + p.revenue_inr, 0);
      sections.revenue = {
        basis_month: sections.spend.focus_month,
        priced_bookings: priced,
        unpriced_bookings: unpriced,
        revenue_inr: round(revenue),
        spend_inr: sections.spend.account.spend_inr,
        roas: ratio(revenue, sections.spend.account.spend_inr),
        // The completeness of the revenue figure, stated as a number so a
        // report can qualify itself instead of implying the total is whole.
        coverage_pct: pct(
          priced.reduce((n, p) => n + p.count, 0),
          sections.leads.account.booked,
        ),
      };
      available.add('revenue');
    }
  } else if (sections.spend && sections.leads) {
    gaps.push({
      section: 'cost_per_outcome',
      reason: `Spend data is for ${sections.spend.focus_month} but lead data is for ${sections.leads.focus_month}; cost per qualified lead would mix two periods.`,
    });
  }

  // Pacing: the one thing that depends on today's date rather than on the data.
  if (sections.spend?.months_available.includes(currentMonth())) {
    const now = new Date();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const dayOfMonth = now.getUTCDate();
    const thisMonth = totalise(db.prepare(`
      SELECT total_ad_spend_inr, impressions, clicks, leads FROM marketing_ad_campaigns
      WHERE client_id = ? AND ${CAMPAIGN_MONTH} = ?
    `).all(clientId, currentMonth()));
    const priorMonths = sections.spend.monthly_series.filter(m => m.month !== currentMonth());
    const typicalSpend = priorMonths.length
      ? round(priorMonths.reduce((s, m) => s + m.spend_inr, 0) / priorMonths.length)
      : null;

    sections.pacing = {
      month: currentMonth(),
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
      month_elapsed_pct: pct(dayOfMonth, daysInMonth),
      spend_to_date_inr: thisMonth.spend_inr,
      projected_month_end_inr: round((thisMonth.spend_inr / dayOfMonth) * daysInMonth),
      // The comparison point is this account's own recent average, not a
      // budget — no budget is stored anywhere in this system, and inventing
      // one to compare against is exactly the kind of confident fiction the
      // fact pack exists to prevent.
      prior_month_average_inr: typicalSpend,
      projected_vs_prior_average_pct: typicalSpend
        ? delta(round((thisMonth.spend_inr / dayOfMonth) * daysInMonth), typicalSpend)
        : null,
      note: 'No monthly budget is stored in this system. Pacing is measured against this account\'s own prior-month average spend, not against a plan.',
    };
    available.add('pacing');
  }

  const pack = {
    client: { id: client.id, name: client.name, type: client.client_type, website: client.website_url },
    generated_at: new Date().toISOString(),
    focus_month: sections.spend?.focus_month || month || currentMonth(),
    sections,
    gaps,
  };

  // Hash the sections only. generated_at changes every call and would make
  // every pack unique, which is the opposite of what the hash is for.
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(sections))
    .digest('hex')
    .slice(0, 16);

  return { pack: { ...pack, facts_hash: hash }, available, gaps, hash };
}

/**
 * Whether this agent can run for this client, and what is missing if not.
 *
 * Called before a run is queued, so a blocked agent costs a disabled button
 * rather than a fabricated audit and the tokens that produced it.
 */
export function checkRequirements(agentConfig, available) {
  let required;
  try {
    required = JSON.parse(agentConfig.requires);
  } catch {
    // A malformed `requires` must not read as "needs nothing". Blocking is the
    // safe direction: the cost is a card that will not run until the row is
    // fixed, against an agent that runs on data it was never given.
    return { ok: false, missing: ['(unreadable requirements)'] };
  }
  const missing = required.filter(key => !available.has(key));
  return { ok: missing.length === 0, missing };
}

/** The fact pack trimmed to what one agent needs, for the claim response.
 *  Sending the whole pack to every agent would put a creative section in a
 *  pacing prompt — tokens spent on context that cannot change the answer. */
export function packForAgent(pack, agentConfig) {
  let required;
  try { required = JSON.parse(agentConfig.requires); } catch { required = []; }

  // The full audit reads everything by definition; every other card gets its
  // own sections plus the two joins that are meaningless to compute twice.
  // 'full' is kept alongside 'audit' so a pack built before migration 076
  // renamed the card still trims the same way.
  const keys = (agentConfig.agent_type === 'audit' || agentConfig.agent_type === 'full')
    ? Object.keys(pack.sections)
    : [...new Set([
        ...required.map(k => k.replace(/^spend_.*/, 'spend')),
        ...(pack.sections.cost_per_outcome ? ['cost_per_outcome'] : []),
        ...(required.includes('spend_current_month') && pack.sections.pacing ? ['pacing'] : []),
        ...(required.includes('prices') && pack.sections.revenue ? ['revenue'] : []),
      ])];

  const sections = {};
  for (const k of keys) if (pack.sections[k]) sections[k] = pack.sections[k];

  return { ...pack, sections, sections_included: Object.keys(sections) };
}
