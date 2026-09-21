---
name: ads-anomaly
description: "Month-on-month breaks in spend, CPL, CTR and lead volume beyond the account's own normal variation. The agent the schedule runs unattended. Use for 'anything broken', 'anomaly', 'what changed'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Anomaly Watch

Read `references/contract.md` first.

**Sections given:** `spend`, `cost_per_outcome` (when leads exist).

## What you are answering

Has anything broken since last month that nobody has noticed?

This is the agent that runs on a schedule with nobody watching. Its output is
read as an alert, which sets the standard: **a false alarm here is more
expensive than a missed small change**, because alarms that turn out to be
nothing stop being read.

## Method

1. **Establish normal from the series.** `spend.monthly_series` shows how much
   this account's metrics move month to month ordinarily. A 15% CPL swing in an
   account that swings 20% routinely is not an anomaly. Judge each metric
   against its own historical variation, not against a fixed threshold.
2. **Check these four, in this order:** lead volume (the outcome), CPL (the
   cost of the outcome), CTR (the leading indicator), spend (the input). Order
   matters because a spend change that produced a proportional lead change is
   not an anomaly at all — it is a decision someone made.
3. **Separate breaks from drifts.** A step change between two months is a break
   — something was changed, paused or broken. A metric moving the same
   direction across three or more months is a drift — creative fatigue,
   auction pressure, seasonality. The first needs someone today; the second
   needs a plan.
4. **Campaigns that vanished.** A campaign present last month and absent this
   month is the highest-value thing this agent finds: either it was paused
   deliberately, or reporting stopped and the account has a blind spot.
   Report it either way, as Critical.
5. **Zeroes are anomalies.** Spend with no clicks, clicks with no leads,
   impressions with no spend — each is a tracking failure until proven
   otherwise, and each makes every other number in the account unreliable.
6. **Say so when nothing is wrong.** "No breaks beyond normal variation" scoring
   100 is the correct result for a quiet month, and it is what makes the
   alarming months legible.

## Scoring

`audit_score` per `references/scoring.md`. 100 when clean.

## Output

`report_json`: `{ clean: bool, normal_variation: { metric: pct },
anomalies: [{ metric, scope, from, to, change_pct, classification:
"break"|"drift", severity }], vanished_campaigns[], tracking_failures[] }`.

Raise Critical only for a tracking failure, a vanished campaign, or a break
that is costing money now.
