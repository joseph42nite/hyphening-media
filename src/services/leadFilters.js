/**
 * Lead Counting Rules
 *
 * A lead flagged is_test does not count anywhere: not in lead totals, not in
 * qualified or booking counts, and not in the revenue those bookings are priced
 * into.
 *
 * The rule lives here because leads are counted in fourteen places across the
 * portal, the marketing routes and booking valuation, and those totals are
 * expected to agree — the ads route's own comment calls out client-portal parity
 * as the reason its figures come straight from campaign_leads. A rule applied in
 * some of them and not others would silently break that.
 *
 * This excludes them from counts only. The rows stay visible and editable, since
 * the flag is set by hand and a row that vanished when marked could never be put
 * back.
 */

/**
 * SQL predicate keeping only leads that count.
 * @param {string} [alias] table alias used by the surrounding query, e.g. 'l'
 */
export function countableLeadSql(alias = '') {
  const column = alias ? `${alias}.is_test` : 'is_test';
  return `COALESCE(${column}, 0) = 0`;
}

/** Same rule for JS-side filtering, so both sides cannot drift. */
export function isCountableLead(lead) {
  return !lead?.is_test;
}

export default { countableLeadSql, isCountableLead };
