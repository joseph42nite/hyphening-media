---
name: ads-audit
description: "Full ads audit: every agent in one pass, reconciled into one account verdict and one ranked action list. Use for 'full ads audit', 'audit the account', 'complete ads analysis'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Full Ads Audit

Read `references/contract.md` first. Submit as `agent_type: "full"`.

**Sections given:** every section the client has.

## What you are answering

Is this account healthy, and if not, what is the one thing to fix first?

## Method

Work the areas in this order — each one's conclusion constrains the next:

1. **Anomalies** (`ads-anomaly` method). Something broken outranks everything
   optimisable. If tracking has failed, stop and say so: every number below is
   unreliable and the audit's job is to say that rather than to analyse it.
2. **Efficiency** (`ads-performance`): what the money bought, and the direction.
3. **Lead quality** (`ads-lead-quality`): whether what it bought was real.
   This can invert step 2 entirely — cheap leads that never qualify are not
   cheap, and the efficiency verdict must be restated when it does.
4. **Funnel** (`ads-funnel`): where the survivors are lost, and whose stage it is.
5. **ROAS** (`ads-roas`), if `revenue` exists. Coverage first, always.
6. **Split and pacing** (`ads-platform-split`, `ads-pacing`): where the money is
   and how fast it is going.
7. **Creative and landing** (`ads-creative`, `ads-landing`): the supply of new
   tests, and what happens after the click.

## Reconciling

The parts will disagree. That is the value of running them together, and
resolving the disagreement is the work:

- Falling CPL with falling qualification is not improvement. Say so plainly.
- A platform winning on CPL and losing on cost per qualified lead is a
  reallocation argument in one direction and against it in the other. Decide,
  and say what would change your mind.
- Good pacing with poor efficiency means spending correctly on the wrong thing.

## The verdict

One `health_score` for the account. **Not an average.** A single critical
failure outweighs four healthy areas, because that is how the client will
experience it.

Then **one** first action. Twelve findings ranked is a backlog; naming the one
thing to do this week is an audit. Everything else follows it in priority order.

## Output

`report_json`: `{ verdict, health_score_rationale, first_action,
areas: { anomaly, efficiency, lead_quality, funnel, roas, split, pacing,
creative, landing }, contradictions_resolved[], data_gaps[] }`.

At most three Criticals. If you have more, you have not prioritised.
