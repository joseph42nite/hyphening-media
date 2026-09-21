# Fact pack sections

What each section contains, and the trap in reading it.

All money is INR. All rates are already percentages (`ctr_pct: 2.33` means
2.33%, not 233%). `null` means "cannot be computed from the data", never zero —
a null CPL is a campaign with no leads, and reporting it as ₹0 inverts the
finding.

## `spend`

Campaign performance for the focus month, with the prior month for comparison.

- `account` — one line for the whole account: spend, impressions, clicks,
  leads, and CTR/CPC/CPL/CPM derived from those totals. `account.mom` carries
  the percentage change against the prior month for each.
- `platforms[]` — the same, per platform, plus `share_of_spend_pct` and its own
  `mom` block.
- `campaigns[]` — per campaign, with `stored_value_drift` present only where
  the stored column disagreed with the recomputed one.
- `monthly_series[]` — the account's full history, oldest first. **This is what
  you compare against.** Two points make a line; a series shows whether a change
  is a trend or a wobble.

**Trap:** account CTR is total clicks over total impressions, not the average of
per-campaign CTRs. If you average the campaign column you will get a different
number and it will be wrong.

### Two lead counts, and the gap between them

- `leads_reported` — what the ad platform counted. Total volume.
- `leads_captured` — rows that reached the CRM and can be called, qualified and
  booked.
- `leads` — the volume figure CPL is computed from.
- `lead_capture_pct` — captured as a share of reported.

Captured is a **subset** of reported: a form submission whose webhook never
fired, a phone call nobody logged, a lead the platform counted and the landing
page never posted. Each widens the gap.

**This is a headline finding, not a footnote.** A capture rate of 4% means 96%
of the leads that spend bought never reached anyone who could call them — which
is almost always the most expensive thing wrong with an account, and nothing
else in this system reports it. Lead it with, at Critical, whenever it is low.

**Trap:** every rate in the `leads` section is measured against the *captured*
leads. Quoting a qualification rate without `lead_capture_pct` beside it
describes a sample and calls it the account.

## `leads`

Outcomes for the leads those campaigns bought. Test leads are already excluded.

- `account`, `by_platform[]`, `by_campaign[]` — counts per stage (leads,
  qualified, disqualified, reached, booked, following_up) and the rates between
  them.
- `rejection_reasons[]` — why leads were disqualified, most common first.
- `treatments_booked[]` — what the booked appointments were for.

**Trap:** `qualification_rate_pct` and `qualified_to_booked_pct` measure
different people's work. The first is mostly the campaign's targeting; the
second is mostly the clinic's calling. Attributing one to the other is the most
common wrong conclusion available from this section.

**Trap:** `pending_qualification` is real. A campaign whose leads are mostly
still pending has no qualification rate worth quoting yet — say so rather than
treating pending as disqualified.

## `cost_per_outcome`

The join `spend` and `leads` cannot make alone: cost per qualified lead and per
booked appointment, account-wide and per campaign, sorted cheapest first.

`matched_spend_row: false` means the campaign's leads exist but no spend row
carries that name. That is a naming mismatch worth reporting — not a campaign
to leave out of the ranking.

**This section is the answer to most budget questions.** Cheap leads that never
qualify are not cheap, and the CPL column will not tell you that.

## `revenue` and `prices`

Revenue from booked appointments priced off the client's own list.

`coverage_pct` is how much of the booked volume could actually be priced. Below
100%, revenue and ROAS are floors, not totals — qualify them explicitly.
`unpriced_bookings[]` names the treatments missing a price.

**Trap:** this is first-treatment value only. Nothing in this system records
repeat visits, so it is not lifetime value and must never be called that.

## `pacing`

Month-to-date spend, projected to month end, against this account's own
prior-month average. Read its `note`: there is no stored budget to pace against.

**Trap:** a projection made on day 3 is nearly meaningless — one heavy day
scales into a 10x month. Say what day of the month it is.

## `content`

Organic post performance: `top_performers`, `weakest`, and `unboosted_winners`
(posts well above the median that were never put behind spend).

**Trap:** organic reach and paid reach are different audiences. A post that did
well organically is a creative hypothesis worth testing, not a prediction.

## `landing`

`landing_url` — the page the ads point at, which is the client's website —
plus `landing_contact_clicks` and `lead_contact_clicks` by channel and the most
recent SEO audits for the site.

**Trap:** contact clicks are not conversions. They are intent signals with no
denominator here — there is no sessions figure in this system — so a click
count cannot become a conversion rate no matter how it is phrased.
