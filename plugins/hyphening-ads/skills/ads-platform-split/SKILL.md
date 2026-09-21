---
name: ads-platform-split
description: "Google vs Meta vs YouTube compared on the same efficiency measures. Use for 'which platform is working', 'platform comparison', 'Google vs Meta'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Platform Split

Read `references/contract.md` first.

**Sections given:** `spend`, `cost_per_outcome` (when leads exist).

## What you are answering

Is each platform doing the job it is there to do?

## Method

1. **Compare intent, not just cost.** Search and social are not the same
   purchase. Search captures existing demand — it should show higher CTR,
   higher CPC and better qualification. Social creates demand — cheaper reach,
   lower CTR, more leads that need filtering. A social CPL above a search CPL
   is a finding; a social *qualification rate* below a search one is often just
   the channel working as intended. Do not recommend cutting a channel for
   behaving like itself.
2. **Use `share_of_spend_pct` against outcome share.** A platform taking 60% of
   spend and returning 30% of qualified leads is the headline. Both numbers are
   in the pack.
3. **Read each platform's own `mom` block.** A platform whose CPL is rising
   while another's falls is a different situation from both rising — the first
   is a reallocation question, the second is an account-wide one, likely
   seasonal or competitive.
4. **Do not rank on one month.** Check `monthly_series` for whether the ordering
   is stable. A platform that wins this month and lost the last two has not
   won. Say which case you are in.
5. **Single-platform months.** If only one platform ran in the focus month,
   there is nothing to split — report that and stop. Do not compare a live
   platform against a dormant one's historical numbers as though both ran.

## Scoring

`efficiency_score` per `references/scoring.md`: how well spend share tracks
outcome share.

## Output

`report_json`: `{ platforms: [{ platform, spend_share_pct, lead_share_pct,
qualified_share_pct, cost_per_qualified, mom, role }], verdict,
ordering_stable }`.
