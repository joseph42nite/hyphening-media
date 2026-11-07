/**
 * Pulls campaign and ad group performance from Google Ads into this database.
 *
 * The rule the whole module is built around: **the sync only ever touches rows
 * it created.** A campaign row whose source is 'manual' was typed by a person,
 * and the obvious implementation — clear the month, re-insert from the API —
 * destroys that silently. Where a manual row already holds a campaign-month,
 * the incoming row is skipped and counted, so the collision is visible and a
 * person decides which is right.
 *
 * Every write is an upsert keyed on the platform's own campaign id, so renaming
 * a campaign in Google updates the existing row instead of leaving the old one
 * behind as a duplicate carrying half the month's spend.
 */

import db from '../../database.js';
import {
  getAccountInfo, getCampaignMonths, getAdGroupMonths,
  getConversionActions, getConversionMonths, getSearchShareMonths,
  getSearchTermMonths, getKeywordMonths, getNegativeKeywords, LEAD_CATEGORIES,
} from './googleAdsClient.js';
import { getSessionMonths } from './ga4Client.js';
import { computeAdMetrics } from './metrics.js';

/** Months, newest first, as 'YYYY-MM'. */
function recentMonths(count) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  return out;
}

/** First day of the earliest month, and today, as the API's date range. */
function rangeFor(months) {
  const earliest = [...months].sort()[0];
  return { since: `${earliest}-01`, until: new Date().toISOString().slice(0, 10) };
}

/**
 * Syncs one client.
 *
 * `dryRun` performs every read and every decision but writes nothing, returning
 * the same plan the real run would execute. The first sync against a live
 * account should always be a dry run — the currency check and the manual-row
 * collisions are both things better seen than discovered.
 */
export async function syncClient(clientId, { dryRun = false, monthsBack = 3, triggerSource = 'manual' } = {}) {
  const client = db.prepare(`
    SELECT id, name, google_ads_customer_id, google_ads_login_customer_id, ads_enabled, ga4_property_id
    FROM crm_clients WHERE id = ?
  `).get(clientId);

  if (!client) return { ok: false, error: 'not_found', message: 'Client not found.' };
  // Kill switch checked before any spend/API call, manual or scheduled alike —
  // see decision 2026-10-17 (vault: Companies/Hyphening/Decisions/Per-client
  // publishing flags.md). A draft or a schedule tick is never enough on its own.
  if (!client.ads_enabled) {
    return { ok: false, error: 'ads_disabled', message: 'Ads execution is turned off for this client. Enable it in the client portal first.' };
  }
  if (!client.google_ads_customer_id) {
    return {
      ok: false,
      error: 'not_configured',
      message: 'No Google Ads customer ID is set on this client. Add it on the client record.',
    };
  }

  // Two clients pointed at one ad account is almost always a typo, and the
  // consequence is the worst kind: one client's spend imported into another's
  // records, then into their report, with every number plausible. Found in
  // production — Janya carried DentAlchemy's customer ID, and an unguarded
  // sync would have filed five dental campaigns and ₹143,000 under a
  // fertility clinic.
  //
  // Compared on digits so 928-944-9109 and 9289449109 are recognised as the
  // same account rather than slipping past as different strings.
  const sameAccount = db.prepare(`
    SELECT id, name FROM crm_clients
    WHERE id != ?
      AND REPLACE(REPLACE(COALESCE(google_ads_customer_id, ''), '-', ''), ' ', '') =
          REPLACE(REPLACE(?, '-', ''), ' ', '')
      AND TRIM(COALESCE(google_ads_customer_id, '')) != ''
  `).all(clientId, client.google_ads_customer_id);

  if (sameAccount.length) {
    const others = sameAccount.map(c => c.name).join(', ');
    return {
      ok: false,
      error: 'duplicate_customer_id',
      message:
        `Customer ID ${client.google_ads_customer_id} is also set on ${others}. ` +
        'Two clients cannot share one Google Ads account without one of them receiving the ' +
        "other's campaigns and spend. Correct the customer ID on whichever client is wrong " +
        'before syncing.',
      conflictsWith: sameAccount,
    };
  }

  const months = recentMonths(monthsBack);
  const { since, until } = rangeFor(months);
  const customerId = client.google_ads_customer_id;
  const opts = { loginCustomerId: client.google_ads_login_customer_id || null };

  // A run row is claimed first, so two concurrent syncs of one account cannot
  // race each other's upserts. The partial unique index decides, not this code.
  let runId = null;
  if (!dryRun) {
    try {
      runId = db.prepare(`
        INSERT INTO ads_sync_runs (client_id, platform, status, trigger_source, months_requested)
        VALUES (?, 'Google', 'running', ?, ?)
      `).run(clientId, triggerSource, JSON.stringify(months)).lastInsertRowid;
    } catch (err) {
      if (/UNIQUE constraint failed/i.test(err.message)) {
        return { ok: false, error: 'already_running', message: 'A Google Ads sync is already running for this client.' };
      }
      throw err;
    }
  }

  const fail = (message, extra = {}) => {
    if (runId) {
      db.prepare(`UPDATE ads_sync_runs SET status='failed', error=?, finished_at=datetime('now') WHERE id=?`)
        .run(message.slice(0, 1000), runId);
    }
    db.prepare('UPDATE crm_clients SET ads_last_sync_error = ? WHERE id = ?').run(message.slice(0, 1000), clientId);
    return { ok: false, error: 'sync_failed', message, ...extra };
  };

  try {
    const account = await getAccountInfo(customerId, opts);

    // Refused rather than converted. cost_micros is in the account's own
    // currency and the column is named total_ad_spend_inr; writing a USD
    // account's spend there understates it by the exchange rate, and nothing
    // downstream could detect it — the number is simply small. A conversion
    // would need a rate per day per currency that this system does not hold.
    if (account.currency && account.currency !== 'INR') {
      return fail(
        `Account ${customerId} (${account.name}) bills in ${account.currency}, not INR. ` +
        'Spend is stored in a rupee column, so this sync refuses rather than writing a converted guess.',
        { currency: account.currency },
      );
    }

    const campaigns = await getCampaignMonths(customerId, { since, until, ...opts });
    const adGroups = await getAdGroupMonths(customerId, { since, until, ...opts });

    const inScope = campaigns.filter(c => months.includes(c.month));
    const groupsInScope = adGroups.filter(g => months.includes(g.month));

    const plan = { insert: [], update: [], skippedManual: [] };

    const existingStmt = db.prepare(`
      SELECT id, source, ad_campaign_name, total_ad_spend_inr, external_campaign_id
      FROM marketing_ad_campaigns
      WHERE client_id = ? AND COALESCE(month, strftime('%Y-%m', created_at)) = ? AND platform = ?
        AND (external_campaign_id = ? OR ad_campaign_name = ?)
    `);

    for (const c of inScope) {
      const existing = existingStmt.get(clientId, c.month, c.platform, c.campaignId, c.name);
      if (!existing) { plan.insert.push(c); continue; }
      if (existing.source === 'manual') {
        // Never overwritten. The fix is a person deciding which is right.
        plan.skippedManual.push({ ...c, existingId: existing.id, existingSpend: existing.total_ad_spend_inr });
        continue;
      }
      plan.update.push({ ...c, existingId: existing.id });
    }

    const summary = {
      account: { id: account.id, name: account.name, currency: account.currency, timeZone: account.timeZone },
      months,
      campaignsSeen: inScope.length,
      adGroupsSeen: groupsInScope.length,
      toInsert: plan.insert.length,
      toUpdate: plan.update.length,
      skippedManual: plan.skippedManual.length,
      totalSpend: Math.round(inScope.reduce((n, c) => n + c.spend, 0)),
    };

    if (dryRun) {
      if (runId) db.prepare(`UPDATE ads_sync_runs SET status='skipped', finished_at=datetime('now') WHERE id=?`).run(runId);
      return { ok: true, dryRun: true, ...summary, plan };
    }

    const write = db.transaction(() => {
      const insert = db.prepare(`
        INSERT INTO marketing_ad_campaigns (
          client_id, month, platform, ad_campaign_name, leads, total_ad_spend_inr,
          impressions, clicks, ctr_pct, cpc_inr, cpl_inr, revenue_generated, roas,
          source, external_campaign_id, synced_at, source_currency, platform_conversions
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, NULL, 'google_ads', ?, datetime('now'), ?, ?)
      `);
      const update = db.prepare(`
        UPDATE marketing_ad_campaigns
        SET ad_campaign_name = ?, total_ad_spend_inr = ?, impressions = ?, clicks = ?,
            ctr_pct = ?, cpc_inr = ?, external_campaign_id = ?,
            synced_at = datetime('now'), source_currency = ?, platform_conversions = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `);

      for (const c of plan.insert) {
        // leads stays 0: Google's conversions are not CRM leads, and the fact
        // pack derives the lead count from campaign_leads. Writing conversions
        // here would destroy the capture-rate signal.
        const m = computeAdMetrics({ impressions: c.impressions, clicks: c.clicks, total_ad_spend_inr: c.spend, leads: 0, revenue_generated: 0 });
        insert.run(clientId, c.month, c.platform, c.name, c.spend, c.impressions, c.clicks,
          m.ctr_pct, m.cpc_inr, m.cpl_inr, c.campaignId, account.currency, c.conversions);
      }
      for (const c of plan.update) {
        const m = computeAdMetrics({ impressions: c.impressions, clicks: c.clicks, total_ad_spend_inr: c.spend, leads: 0, revenue_generated: 0 });
        update.run(c.name, c.spend, c.impressions, c.clicks, m.ctr_pct, m.cpc_inr,
          c.campaignId, account.currency, c.conversions, c.existingId);
      }

      // Ad groups, keyed on the platform's id so a rename updates in place.
      const campaignRowFor = db.prepare(`
        SELECT id FROM marketing_ad_campaigns
        WHERE client_id = ? AND external_campaign_id = ?
          AND COALESCE(month, strftime('%Y-%m', created_at)) = ?
      `);
      const upsertGroup = db.prepare(`
        INSERT INTO marketing_ad_groups (
          client_id, campaign_id, external_campaign_id, external_adgroup_id, name, status,
          platform, month, spend, impressions, clicks, platform_conversions, source_currency, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(client_id, month, external_adgroup_id) DO UPDATE SET
          campaign_id = excluded.campaign_id, name = excluded.name, status = excluded.status,
          spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
          platform_conversions = excluded.platform_conversions, synced_at = datetime('now')
      `);

      const platformOf = new Map(inScope.map(c => [c.campaignId, c.platform]));
      for (const g of groupsInScope) {
        const row = campaignRowFor.get(clientId, g.campaignId, g.month);
        upsertGroup.run(clientId, row?.id || null, g.campaignId, g.adGroupId, g.name, g.status,
          platformOf.get(g.campaignId) || 'Google', g.month, g.spend, g.impressions, g.clicks,
          g.conversions, account.currency);
      }

      db.prepare(`
        UPDATE ads_sync_runs
        SET status='completed', finished_at=datetime('now'),
            campaigns_seen=?, rows_inserted=?, rows_updated=?, rows_skipped_manual=?, currency=?
        WHERE id = ?
      `).run(inScope.length, plan.insert.length, plan.update.length, plan.skippedManual.length, account.currency, runId);

      db.prepare(`
        UPDATE crm_clients
        SET ads_last_synced_at = datetime('now'), ads_last_sync_error = NULL, ads_sync_enabled = 1
        WHERE id = ?
      `).run(clientId);
    });

    write();

    // After the spend rows exist, so the per-campaign columns have rows to land
    // on. Supplementary: a failure here is recorded, never fails the spend sync.
    summary.evidence = await syncEvidence(client, { customerId, opts, months, since, until });

    console.log(`[ADS SYNC] ${client.name}: ${plan.insert.length} inserted, ${plan.update.length} updated, ${plan.skippedManual.length} skipped (manual), ${groupsInScope.length} ad groups.${summary.evidence.errors.length ? ' Evidence errors: ' + summary.evidence.errors.join(' | ') : ''}`);

    import('../../server.js')
      .then(({ broadcastEvent }) => broadcastEvent('ads_sync_completed', { clientId, ...summary }))
      .catch(() => {});

    return { ok: true, dryRun: false, ...summary, plan };
  } catch (err) {
    return fail(err.message);
  }
}

/** Sums rows sharing a key; the API returns one row per ad group or segment. */
function sumBy(rows, keyOf, fields) {
  const out = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const acc = out.get(k);
    if (!acc) { out.set(k, { ...r }); continue; }
    for (const f of fields) acc[f] = (acc[f] || 0) + (r[f] || 0);
    // Keep the last non-null descriptive value (status, quality score).
    for (const [f, v] of Object.entries(r)) if (!fields.includes(f) && v != null) acc[f] = v;
  }
  return [...out.values()];
}

/**
 * The account evidence claude-ads' Google audit reads: conversion setup and
 * counts, impression share, search terms, keywords, negatives — plus GA4
 * sessions when the client has a property. Replaced for the synced months.
 *
 * Returns row counts and any errors; never throws.
 */
async function syncEvidence(client, { customerId, opts, months, since, until }) {
  const clientId = client.id;
  const errors = [];
  const counts = {};
  const monthsJson = JSON.stringify(months);
  const inScope = (r) => months.includes(r.month);

  try {
    const [actions, conv, share, terms, keywords, negatives] = await Promise.all([
      getConversionActions(customerId, opts),
      getConversionMonths(customerId, { since, until, ...opts }),
      getSearchShareMonths(customerId, { since, until, ...opts }),
      getSearchTermMonths(customerId, { since, until, ...opts }),
      getKeywordMonths(customerId, { since, until, ...opts }),
      getNegativeKeywords(customerId, opts),
    ]);

    const convRows = sumBy(conv.filter(inScope), r => `${r.campaignId}|${r.month}|${r.actionName}`, ['conversions', 'allConversions']);
    const termRows = sumBy(terms.filter(inScope), r => `${r.campaignId}|${r.month}|${r.term}`, ['impressions', 'clicks', 'spend', 'conversions']);
    const keywordRows = sumBy(keywords.filter(inScope), r => `${r.campaignId}|${r.month}|${r.text}|${r.matchType}`, ['impressions', 'clicks', 'spend', 'conversions']);

    // Google's lead count per campaign-month: counted conversions in a lead
    // category. Directions and page views are conversions to Google, not leads.
    const leadConv = new Map();
    for (const r of convRows) {
      if (!LEAD_CATEGORIES.has(r.category)) continue;
      const k = `${r.campaignId}|${r.month}`;
      leadConv.set(k, (leadConv.get(k) || 0) + r.conversions);
    }

    db.transaction(() => {
      db.prepare(`DELETE FROM ads_conversion_actions WHERE client_id = ? AND platform = 'Google'`).run(clientId);
      const insAction = db.prepare(`
        INSERT INTO ads_conversion_actions
          (client_id, platform, action_id, name, status, type, category, primary_for_goal, counting_type, in_conversions)
        VALUES (?, 'Google', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of actions) insAction.run(clientId, a.actionId, a.name, a.status, a.type, a.category, a.primaryForGoal ? 1 : 0, a.countingType, a.inConversions ? 1 : 0);

      db.prepare(`DELETE FROM ads_conversion_months WHERE client_id = ? AND month IN (SELECT value FROM json_each(?))`).run(clientId, monthsJson);
      const insConv = db.prepare(`
        INSERT INTO ads_conversion_months (client_id, external_campaign_id, month, action_name, category, conversions, all_conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of convRows) insConv.run(clientId, r.campaignId, r.month, r.actionName, r.category, r.conversions, r.allConversions);

      // Synced rows only; a hand-entered campaign keeps whatever it has.
      db.prepare(`
        UPDATE marketing_ad_campaigns SET platform_lead_conversions = 0
        WHERE client_id = ? AND source = 'google_ads' AND month IN (SELECT value FROM json_each(?))
      `).run(clientId, monthsJson);
      const setLeadConv = db.prepare(`
        UPDATE marketing_ad_campaigns SET platform_lead_conversions = ?
        WHERE client_id = ? AND source = 'google_ads' AND external_campaign_id = ? AND month = ?
      `);
      for (const [k, v] of leadConv) {
        const [cid, month] = k.split('|');
        setLeadConv.run(Math.round(v * 100) / 100, clientId, cid, month);
      }

      const setShare = db.prepare(`
        UPDATE marketing_ad_campaigns
        SET search_impression_share_pct = ?, search_lost_to_budget_pct = ?, search_lost_to_rank_pct = ?,
            bidding_strategy = ?, daily_budget = ?
        WHERE client_id = ? AND source = 'google_ads' AND external_campaign_id = ? AND month = ?
      `);
      for (const r of share.filter(inScope)) {
        setShare.run(r.impressionSharePct, r.lostToBudgetPct, r.lostToRankPct, r.biddingStrategy, r.dailyBudget, clientId, r.campaignId, r.month);
      }

      db.prepare(`DELETE FROM ads_search_terms WHERE client_id = ? AND month IN (SELECT value FROM json_each(?))`).run(clientId, monthsJson);
      const insTerm = db.prepare(`
        INSERT INTO ads_search_terms (client_id, external_campaign_id, month, term, status, impressions, clicks, spend, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of termRows) insTerm.run(clientId, r.campaignId, r.month, r.term, r.status, r.impressions, r.clicks, r.spend, r.conversions);

      db.prepare(`DELETE FROM ads_keywords WHERE client_id = ? AND month IN (SELECT value FROM json_each(?))`).run(clientId, monthsJson);
      const insKw = db.prepare(`
        INSERT INTO ads_keywords (client_id, external_campaign_id, month, text, match_type, status, quality_score, impressions, clicks, spend, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of keywordRows) {
        if (!r.text || !r.matchType) continue;
        insKw.run(clientId, r.campaignId, r.month, r.text, r.matchType, r.status, r.qualityScore, r.impressions, r.clicks, r.spend, r.conversions);
      }

      db.prepare(`DELETE FROM ads_negative_keywords WHERE client_id = ?`).run(clientId);
      const insNeg = db.prepare(`
        INSERT OR IGNORE INTO ads_negative_keywords (client_id, level, external_campaign_id, text, match_type)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const n of negatives) if (n.text && n.matchType) insNeg.run(clientId, n.level, n.campaignId, n.text, n.matchType);
    })();

    Object.assign(counts, {
      conversionActions: actions.length, conversionRows: convRows.length,
      searchTerms: termRows.length, keywords: keywordRows.length, negatives: negatives.length,
    });
  } catch (err) {
    errors.push(`Google Ads evidence: ${err.message}`);
  }

  if (client.ga4_property_id) {
    try {
      const rows = sumBy((await getSessionMonths(client.ga4_property_id, { since, until })).filter(inScope),
        r => `${r.month}|${r.host}|${r.channel}`, ['sessions', 'engagedSessions', 'keyEvents']);
      db.transaction(() => {
        db.prepare(`DELETE FROM ga4_session_months WHERE client_id = ? AND month IN (SELECT value FROM json_each(?))`).run(clientId, monthsJson);
        const ins = db.prepare(`
          INSERT INTO ga4_session_months (client_id, month, host, channel, sessions, engaged_sessions, key_events)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of rows) ins.run(clientId, r.month, r.host, r.channel, r.sessions, r.engagedSessions, r.keyEvents);
      })();
      counts.ga4Rows = rows.length;
    } catch (err) {
      errors.push(`GA4: ${err.message}`);
    }
  }

  db.prepare('UPDATE crm_clients SET ads_last_evidence_error = ? WHERE id = ?')
    .run(errors.length ? errors.join(' | ').slice(0, 1000) : null, clientId);
  return { counts, errors };
}

/** Every client with a customer ID. Used by the scheduled run. */
export async function syncAllClients({ monthsBack = 3 } = {}) {
  const clients = db.prepare(`
    SELECT id, name FROM crm_clients
    WHERE client_type = 'marketing' AND google_ads_customer_id IS NOT NULL
      AND TRIM(google_ads_customer_id) != '' AND ads_enabled = 1
  `).all();

  const results = [];
  for (const c of clients) {
    // Sequential: one shared API quota, and a failure on one client must not
    // prevent the next from syncing.
    const r = await syncClient(c.id, { monthsBack, triggerSource: 'scheduled' });
    results.push({ client: c.name, ...r });
    if (!r.ok) console.error(`[ADS SYNC] ${c.name} failed: ${r.message}`);
  }
  console.log(`[ADS SYNC] Scheduled run: ${results.filter(r => r.ok).length}/${results.length} clients synced.`);
  return results;
}
