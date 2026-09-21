---
name: ads-lead-quality
description: "Lead quality analysis: qualification and rejection rates per campaign, and cost per qualified lead. Use for 'are the leads any good', 'junk leads', 'qualification rate'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Lead Quality

Read `references/contract.md` first.

**Sections given:** `spend`, `leads`, `cost_per_outcome`.

## What you are answering

Of the leads this spend bought, how many were real, and what did a real one
actually cost?

## Method

1. **Discount for pending.** `leads.account.pending_qualification` is volume
   nobody has judged yet. A campaign that is 70% pending has no qualification
   rate worth quoting — say that instead of quoting one. If pending is high
   account-wide, that is itself the finding: the qualification process is
   behind, and every efficiency number downstream is provisional.
2. **Cheap leads vs cheap qualified leads.** Compare each campaign's `cpl_inr`
   against its `cost_per_qualified_lead_inr`. A large gap means the campaign is
   buying volume that does not survive contact. This is the single most common
   way a paid-media account looks healthy and is not, and naming it is the
   main reason this agent exists.
3. **Read the rejection reasons as a targeting signal.** One reason dominating
   `rejection_reasons` is almost never a lead-quality problem — it is a
   targeting or a promise problem. Out-of-area rejections mean geography;
   price-objection rejections mean the ad set an expectation the clinic does
   not meet; wrong-service rejections mean the creative is selling the wrong
   thing. Each has a different fix. Say which one the data supports.
4. **Separate reachability from quality.** `contact_rate_pct` is whether anyone
   picked up; `qualification_rate_pct` is whether they were right. A campaign
   with good qualification among those reached, and terrible reach, is a
   follow-up problem, not an ads problem — and cutting its budget would be the
   wrong call.
5. **Name the unnamed.** Rejections recorded as `(no reason recorded)` above a
   small share make this analysis guesswork. Report the gap.

## Scoring

`lead_quality_score` per `references/scoring.md`, discounted by pending share.

## Output

`report_json`: `{ verdict, pending_share_pct, campaigns: [{ name, cpl,
cost_per_qualified, gap_multiple }], dominant_rejection_reason,
reachability_vs_quality }`.
