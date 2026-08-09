/**
 * Booking Value & Ad Efficiency
 *
 * Two metrics sit either side of a line worth keeping visible.
 *
 * Cost per booking is measured: spend divided by bookings that campaign_leads
 * already records. It needs no pricing and carries no assumptions, which is why
 * it is the number to act on.
 *
 * Estimated revenue is modelled. It prices each booking by its treatment_type
 * and is only ever as good as that price list, so everything it feeds is
 * labelled estimated and reports how many bookings had no price to apply.
 */

import db from '../../database.js';
import { countableLeadSql } from './leadFilters.js';

/** Matches the booking definition used by the ads and overview queries. */
const BOOKED_SQL = `(
  LOWER(TRIM(COALESCE(appointment_status, ''))) IN ('booked', 'confirmed')
  OR LOWER(TRIM(COALESCE(lead_status, ''))) = 'appointment booked'
)`;

/**
 * A client's price list, keyed by lowercased treatment_type so free-text casing
 * from the CRM ("IVF Treatment" vs "ivf treatment") still matches.
 */
export function getPriceMap(clientId) {
  const rows = db.prepare(
    'SELECT treatment_type, price_inr FROM client_treatment_prices WHERE client_id = ?'
  ).all(clientId);

  const map = new Map();
  for (const r of rows) {
    map.set(String(r.treatment_type).trim().toLowerCase(), r.price_inr || 0);
  }
  return map;
}

export function getDefaultBookingValue(clientId) {
  const row = db.prepare('SELECT default_booking_value_inr FROM crm_clients WHERE id = ?').get(clientId);
  return row?.default_booking_value_inr ?? null;
}

/**
 * Value the bookings matching `where`, one treatment at a time.
 *
 * @param {object} opts
 * @param {number} opts.clientId
 * @param {string} [opts.month]         YYYY-MM; omit to span every month
 * @param {string} [opts.campaignName]  restrict to one campaign
 * @param {string} [opts.platform]      used when leads carry no campaign name
 * @returns {{bookings: number, estimated_revenue: number, unpriced_bookings: number}}
 */
export function estimateBookingRevenue({ clientId, month = null, campaignName = null, platform = null }) {
  // A test lead must not earn revenue, so the same exclusion applies here.
  const clauses = ['client_id = ?', countableLeadSql(), BOOKED_SQL];
  const params = [clientId];

  if (month) {
    clauses.push("SUBSTR(created_at, 1, 7) = ?");
    params.push(month);
  }
  if (campaignName) {
    // Leads logged without a campaign fall back to platform, mirroring how the
    // ads route attributes them.
    clauses.push(`(
      (campaign_name IS NOT NULL AND TRIM(campaign_name) != '' AND LOWER(TRIM(campaign_name)) = LOWER(TRIM(?)))
      OR ((campaign_name IS NULL OR TRIM(campaign_name) = '' OR LOWER(TRIM(campaign_name)) = 'manual entry')
          AND LOWER(TRIM(COALESCE(platform, ''))) = LOWER(TRIM(COALESCE(?, ''))))
    )`);
    params.push(campaignName, platform);
  }

  const rows = db.prepare(
    `SELECT treatment_type FROM campaign_leads WHERE ${clauses.join(' AND ')}`
  ).all(...params);

  const prices = getPriceMap(clientId);
  const fallback = getDefaultBookingValue(clientId);

  let revenue = 0;
  let unpriced = 0;

  for (const { treatment_type } of rows) {
    const key = String(treatment_type || '').trim().toLowerCase();
    const priced = key ? prices.get(key) : undefined;

    if (priced !== undefined) {
      revenue += priced;
    } else if (fallback !== null) {
      revenue += fallback;
      unpriced++;
    } else {
      // No price and no fallback contributes nothing, but is counted so the
      // shortfall is reportable rather than an unexplained dip in ROAS.
      unpriced++;
    }
  }

  return {
    bookings: rows.length,
    estimated_revenue: Math.round(revenue),
    unpriced_bookings: unpriced
  };
}

/**
 * Attach efficiency figures to a spend/bookings pair.
 *
 * `revenue_generated` wins when someone has entered a real number — measured
 * beats modelled — and the estimate fills in only where it is absent.
 */
export function withEfficiency({ spend, bookings, revenueGenerated, estimate }) {
  const spendVal = spend || 0;
  const actualRevenue = revenueGenerated || 0;
  const usingEstimate = actualRevenue <= 0 && estimate.estimated_revenue > 0;
  const revenue = usingEstimate ? estimate.estimated_revenue : actualRevenue;

  const roas = spendVal > 0 && revenue > 0 ? Math.round((revenue / spendVal) * 100) / 100 : null;

  return {
    cost_per_booking_inr: bookings > 0 && spendVal > 0 ? Math.round(spendVal / bookings) : null,
    estimated_revenue_inr: estimate.estimated_revenue,
    unpriced_bookings: estimate.unpriced_bookings,
    roas,
    // Only meaningful as a label on a figure that exists.
    roas_is_estimated: roas !== null && usingEstimate
  };
}

export default { getPriceMap, getDefaultBookingValue, estimateBookingRevenue, withEfficiency };
