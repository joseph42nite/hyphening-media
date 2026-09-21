---
name: ads-budget
description: "Budget reallocation ranked by cost per qualified lead, stated in rupees. Use for 'where should the budget go', 'reallocate', 'budget split'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Budget Reallocation

Read `references/contract.md` first.

**Sections given:** `spend`, `cost_per_outcome` (when leads exist).

## What you are answering

Where should the next rupee go, and how many rupees should move?

## Method

1. **Rank on cost per qualified lead.** `cost_per_outcome.by_campaign` is
   already sorted cheapest-first. Ranking on raw CPL instead rewards campaigns
   that buy volume nobody can use.
2. **State moves as amounts.** "Shift ₹6,000/month from Meta Lead Gen to Google
   Search" is actionable. "Increase Google investment" is not. Use the pack's
   own spend figures to size the move.
3. **Assume the cost curve bends.** Doubling a campaign's budget does not
   double its leads at the same cost — auction pressure raises the price as
   volume grows. Never project a saving by multiplying the cheap campaign's
   current CPL across the moved budget. Recommend moves in increments (20-30%
   of a campaign's spend) and say that the next increment must be re-measured
   before the one after it.
4. **Check the cheap campaign can absorb it.** A campaign that is cheap because
   it is small may be cheap *because* it is small. Where the pack cannot tell
   you whether headroom exists — it holds no impression share data — say that
   this is the assumption the recommendation rests on, and put it in
   `failure_check`.
5. **Never recommend cutting to zero on one month.** One month is one sample.
   Reductions, then re-measure.
6. **Flag unmatched rows.** A campaign with `matched_spend_row: false` cannot
   be ranked honestly; the naming mismatch is a finding.

## Scoring

`efficiency_score` per `references/scoring.md`: how well the current split
matches the outcome ranking.

## Output

`report_json`: `{ current_split[], recommended_moves: [{ from, to, amount_inr,
rationale, assumption }], expected_effect, caveats[] }`.
