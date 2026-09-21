---
name: ads-performance
description: "Campaign efficiency analysis: CTR, CPC and cost per lead per campaign, read against the account's own history. Use for 'how are the ads doing', 'CPL check', 'campaign efficiency'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Performance & Efficiency

Read `references/contract.md` first. You interpret the fact pack; you never
compute from it.

**Sections given:** `spend`, `cost_per_outcome` (when leads exist).

## What you are answering

Is this account getting more or less for its money than it was, and which
campaign is responsible?

## Method

1. **Direction before level.** Open `spend.monthly_series` and say what CPL has
   been doing across every month available, not just this one against last. A
   single month's move is noise until the series says otherwise.
2. **Attribute the account move to campaigns.** The account CPL changed because
   specific campaigns changed, or because the mix shifted between campaigns that
   did not. These are different findings and the fix for each is different:
   the first is a campaign problem, the second is a budget one. Say which.
3. **Rank on cost per qualified lead where you have it.** `cost_per_outcome`
   ranks campaigns cheapest-first on the number that matters. CPL alone ranks
   them on a number that can be gamed by bad leads. Where the two rankings
   disagree, that disagreement is your most valuable finding.
4. **Check the funnel above the lead.** A CPL move decomposes: CPM (what reach
   cost), CTR (what the creative did with it), lead rate (what the landing
   page or form did with the click). Name which of the three moved. "CPL rose
   40%" is an observation; "CPL rose 40% entirely on CTR falling from 2.3% to
   1.4% while CPM held" is a diagnosis.
5. **Report drift.** Any campaign carrying `stored_value_drift` has a stored
   column disagreeing with its raw counters. That is a data-quality finding at
   High priority — every downstream report reads those columns.

## Scoring

`efficiency_score` per `references/scoring.md`. Weight direction over level.

## Output

`report_json`: `{ verdict, cpl_trend, decomposition: { cpm, ctr, lead_rate },
campaigns_improving[], campaigns_degrading[], ranking_disagreement }`.

Recommendations name the campaign exactly as the pack spells it.
