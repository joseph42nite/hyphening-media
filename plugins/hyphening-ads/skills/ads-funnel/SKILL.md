---
name: ads-funnel
description: "Funnel drop-off analysis from lead to qualified to appointment booked, with the costliest stage named first. Use for 'where are we losing leads', 'funnel', 'booking rate'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Funnel Drop-off

Read `references/contract.md` first.

**Sections given:** `leads`, `cost_per_outcome` (when spend exists).

## What you are answering

Between arriving and booking, where do people stop, and what does that stage
cost?

## Method

1. **Walk the stages in order:** leads → reached → qualified → booked. Give
   each its own conversion rate and its absolute loss in people. A 40% drop on
   eight leads and a 40% drop on eight hundred deserve different priorities and
   the percentage alone hides that.
2. **Rank by money, not by size.** The largest percentage drop is not
   necessarily the costliest. Use `cost_per_outcome` to express each stage's
   loss as spend that produced nothing.
3. **Attribute each stage to who owns it.** Lead → reached is follow-up speed
   and phone data quality. Reached → qualified is targeting. Qualified → booked
   is the clinic's conversation, not the campaign's. Recommendations aimed at
   the wrong owner do not get actioned; be explicit about which is which.
4. **Treat `following_up` as undecided, not lost.** It is an open state. A
   campaign with a large follow-up backlog has an unknown booking rate, not a
   bad one, and recommending a budget cut on that basis would be acting on an
   absence.
5. **Compare campaigns at the same stage.** Two campaigns with the same booking
   rate but different qualification rates are failing in different places.

## Scoring

`funnel_score` per `references/scoring.md`: driven by the largest
single-stage drop.

## Output

`report_json`: `{ verdict, stages: [{ stage, in, out, rate_pct, lost,
estimated_wasted_spend_inr, owner }], worst_stage, undecided_volume }`.
