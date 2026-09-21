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
import { getAccountInfo, getCampaignMonths, getAdGroupMonths } from './googleAdsClient.js';
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
    SELECT id, name, google_ads_customer_id, google_ads_login_customer_id
    FROM crm_clients WHERE id = ?
  `).get(clientId);

  if (!client) return { ok: false, error: 'not_found', message: 'Client not found.' };
  if (!client.google_ads_customer_id) {
    return {
      ok: false,
      error: 'not_configured',
      message: 'No Google Ads customer ID is set on this client. Add it on the client record.',
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

    console.log(`[ADS SYNC] ${client.name}: ${plan.insert.length} inserted, ${plan.update.length} updated, ${plan.skippedManual.length} skipped (manual), ${groupsInScope.length} ad groups.`);

    import('../../server.js')
      .then(({ broadcastEvent }) => broadcastEvent('ads_sync_completed', { clientId, ...summary }))
      .catch(() => {});

    return { ok: true, dryRun: false, ...summary, plan };
  } catch (err) {
    return fail(err.message);
  }
}

/** Every client with a customer ID. Used by the scheduled run. */
export async function syncAllClients({ monthsBack = 3 } = {}) {
  const clients = db.prepare(`
    SELECT id, name FROM crm_clients
    WHERE client_type = 'marketing' AND google_ads_customer_id IS NOT NULL
      AND TRIM(google_ads_customer_id) != ''
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
