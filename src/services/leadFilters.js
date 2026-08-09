/**
 * Lead Counting Rules
 *
 * A lead whose call outcome is "Other" is treated as not a real lead. In
 * practice that value is used to park test entries, and counting them inflates
 * lead totals, drags CPL down and lets a test booking earn revenue.
 *
 * The rule lives here because leads are counted in fourteen places across the
 * portal, the marketing routes and booking valuation, and those totals are
 * expected to agree — the ads route's own comment calls out client-portal parity
 * as the reason its figures come straight from campaign_leads. A rule applied in
 * some of them and not others would silently break that.
 *
 * This excludes them from counts only. The rows stay visible and editable, since
 * "Other" is set by hand from the portal's call-outcome dropdown and a row that
 * vanished when marked could never be put back.
 */

/**
 * SQL predicate keeping only leads that count.
 * @param {string} [alias] table alias used by the surrounding query, e.g. 'l'
 */
export function countableLeadSql(alias = '') {
  const column = alias ? `${alias}.call_outcome` : 'call_outcome';
  return `LOWER(TRIM(COALESCE(${column}, ''))) != 'other'`;
}

/** Same rule for JS-side filtering, so both sides cannot drift. */
export function isCountableLead(lead) {
  return String(lead?.call_outcome ?? '').trim().toLowerCase() !== 'other';
}

export default { countableLeadSql, isCountableLead };
