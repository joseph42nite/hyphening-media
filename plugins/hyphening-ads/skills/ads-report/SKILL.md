---
name: ads-report
description: "The month written up for the client: spend, return, what changed, what happens next. Use for 'client report', 'monthly ads report', 'write it up'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Client Ads Report

Read `references/contract.md` first.

**Sections given:** whatever the client has. Check `gaps` before writing.

## What you are answering

What would this client want to know about their money this month, in language
they use?

This is the only agent whose output leaves the building. Everything in it must
be defensible if the client puts a figure in front of someone else.

## Method

1. **Every number from the pack, no exceptions.** No benchmark, no industry
   average, no "typically". A single invented comparison is the difference
   between a report and a liability.
2. **Structure:** what was spent → what it returned → what changed since last
   month → what we are doing about it → what we need from you. Five sections.
   The last one is where unpriced treatments, unqualified leads and unrecorded
   outcomes get raised — as requests, not as complaints.
3. **Qualify revenue every time it appears.** If `revenue.coverage_pct` is
   below 100, the figure is a floor and must be written as one. If there is no
   `revenue` section at all, do not estimate revenue — say bookings and say
   what pricing them would take.
4. **Lead with the outcome the client cares about**, which is appointments
   booked and what they cost, not impressions. Impressions and CTR are
   supporting evidence, not headlines.
5. **Explain a bad month without excusing it.** If CPL rose, say by how much,
   say why as far as the data supports, and say what changes next month. A
   report that only contains good news trains the client to distrust the good
   news.
6. **No score.** This agent reports the others.
7. **Plain language.** Cost per lead, not CPL, on first use. No "leverage", no
   "optimise", no "synergy". Rupees in full: ₹16,800, not 16.8k.

## Output

`summary`: the two sentences the client would read if they read nothing else.

`report_json`: `{ period, spend, outcomes, changes, actions_taken,
actions_next, asks[], caveats[] }`.

Recommendations from this agent are for the internal team — things to do before
the report is sent — not for the client.
