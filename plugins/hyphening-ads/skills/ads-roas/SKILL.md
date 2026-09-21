---
name: ads-roas
description: "True ROAS from booked appointments priced off the client's own treatment list, against spend. Use for 'is this profitable', 'ROAS', 'return on ad spend'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# True ROAS

Read `references/contract.md` first.

**Sections given:** `spend`, `leads`, `prices`, `revenue`, `cost_per_outcome`.

## What you are answering

What did this month's spend actually return, in money that can be traced to a
booking and a price?

## Method

1. **Lead with coverage.** State `revenue.coverage_pct` before the ROAS figure,
   every time. Below 100% the number is a floor. Below 60% do not publish a
   score at all — say what would have to be priced to make one possible, and
   name the treatments from `unpriced_bookings`.
2. **Say what this is not.** First booked treatment only. Not lifetime value,
   not repeat visits, not referrals — none of which this system records. The
   self-reported `revenue_generated` column on the campaign rows is *not* your
   source; it is unaudited, and replacing it with something traceable is the
   whole point of this agent.
3. **Bookings are not revenue yet.** A booked appointment is an intention. If
   attendance is not recorded anywhere — it is not — then say the figure assumes
   every booking is kept, and that this is an assumption rather than a
   measurement.
4. **Break it down where the volume supports it.** Per platform and per
   campaign, but only where enough bookings exist to mean something. Two
   bookings do not make a platform comparison; say so rather than ranking on
   them.
5. **Mix matters more than volume.** A campaign driving fewer but
   higher-priced treatments can outperform one driving many cheap ones. Compare
   revenue per booked appointment across campaigns, not just booking counts.

## Scoring

`roas_score` per `references/scoring.md`, capped by coverage. Omit below 60%.

## Output

`report_json`: `{ coverage_pct, revenue_inr, spend_inr, roas, basis,
assumptions[], by_treatment[], by_campaign[], unpriced[] }`.
