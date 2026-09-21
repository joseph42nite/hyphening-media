---
name: ads-pacing
description: "Month-to-date spend projected to month end against the account's own prior-month average. Use for 'are we on track', 'pacing', 'overspending this month'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Budget Pacing

Read `references/contract.md` first.

**Sections given:** `spend`, `pacing`.

## What you are answering

At the current rate, where does this month land, and is that where it should?

## Method

1. **Say what day it is, first line.** `pacing.day_of_month` and
   `month_elapsed_pct` frame everything below them. A projection on day 3 scales
   one heavy day into a 10x month. **Before day 7, report the numbers and
   decline to score** — say the month is too young to project.
2. **There is no budget.** `pacing.note` says it outright: nothing in this
   system stores a monthly plan, so the comparison is against
   `prior_month_average_inr`. Never describe a deviation as "over budget" —
   describe it as over or under the account's own recent average. If a plan
   exists somewhere outside this system, note that the comparison cannot see it.
3. **Separate rate from result.** Spending faster than usual is only a problem
   if efficiency has not improved to match. Cross-check against
   `spend.account.mom.cpl_pct`: faster spend at a falling CPL is scaling;
   faster spend at a rising CPL is bleeding. Two opposite recommendations.
4. **Quantify in days and rupees.** "Projected ₹21,400 against a ₹16,800
   average, ₹4,600 over, at ₹760/day with 6 days left" is actionable. "Pacing
   high" is not.
5. **Under-pacing is a finding too.** Unspent budget on a campaign that is
   converting is a missed month, not a saving.

## Scoring

`pacing_score` per `references/scoring.md`. Omit before day 7.

## Output

`report_json`: `{ day_of_month, month_elapsed_pct, spend_to_date_inr,
projected_inr, prior_average_inr, variance_inr, daily_rate_inr, days_left,
efficiency_direction, verdict }`.
