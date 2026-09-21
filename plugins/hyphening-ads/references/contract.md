# Ads agent contract

Read this before running any `ads-*` skill. It is the same for all twelve, so
none of them repeats it.

## The one rule

**You interpret numbers. You do not produce them.**

Every figure you need has already been computed by the Ops Center and is in the
`facts` object you were handed. Do not recompute a CTR, a CPL, a percentage
change or a ratio — not to check the pack, not to fill a gap, not in your head.
If a number you want is not in the pack, that is a finding to report, not an
arithmetic problem to solve.

Two reasons this is absolute:

1. The pack is the same source the dashboard renders from. A report that
   derives its own figures will eventually disagree with the screen next to it,
   and then neither can be trusted.
2. Arithmetic over dozens of campaign rows is the single most error-prone thing
   a model does, and an error here reaches a client as a budget instruction.

## What you are given

```jsonc
{
  "client":      { "id": 2, "name": "...", "type": "marketing", "website": "..." },
  "focus_month": "2026-08",
  "facts_hash":  "1a0b9a88aef68aee",   // echo this back, unchanged
  "sections":    { /* only the sections your agent needs */ },
  "gaps":        [ { "section": "prices", "reason": "..." } ]
}
```

Section shapes are documented in `references/fact-pack.md`.

## What you must never do

- **Never invent a benchmark.** There is no industry CPL in the pack, and
  quoting one from memory ("healthcare CPL averages ₹400") states a fact about
  a market you have not measured. Compare against this account's own prior
  months, which are in `monthly_series`, and say so.
- **Never invent a budget.** No monthly budget is stored anywhere in this
  system. Pacing compares against this account's own prior-month average, and
  the pacing section says so in its `note`.
- **Never fill a gap with knowledge.** A section listed in `gaps` is missing
  data. Say what is missing and what it would take to have it. A confident
  paragraph about a section you were not given is the failure this whole
  pipeline is built to prevent.
- **Never treat a stored value as truth over a recomputed one.** Where a
  campaign carries `stored_value_drift`, the Ops Center found the stored
  column disagreeing with the raw counters. Report the drift as a data-quality
  finding; use the recomputed value.
- **Never count test leads.** They are already excluded from the pack. If you
  see a lead count that disagrees with a client's own, this is usually why.

## What you return

POST to the Ops Center webhook as `create_ads_audit`:

```jsonc
{
  "event_type": "create_ads_audit",
  "payload": {
    "run_id":       123,             // exactly as given; this closes the run
    "client_id":    2,
    "agent_type":   "performance",   // your own agent type, never another's
    "period_month": "2026-08",       // the pack's focus_month
    "facts_hash":   "1a0b9a88aef68aee",
    "<your>_score": 72,              // 0-100, your agent's own column
    "summary":      "Two or three sentences. The verdict, not a recap.",
    "report_json":  { /* your structured findings */ },
    "recommendations": [ /* see below */ ],
    "data_gaps":    [ { "section": "prices", "reason": "..." } ],
    "token_usage":  { "model": "...", "input_tokens": 0, "output_tokens": 0, "cost_usd": 0 }
  }
}
```

Progress lines go to `ads_run_log` with your `run_id`; they appear live in the
dashboard console.

### Scores

0-100, and it must mean something specific to your agent — the rubric is in
`references/scoring.md`. A score outside 0-100 is discarded on receipt, and a
score you cannot justify from the pack should be omitted rather than guessed.

### Recommendations

```jsonc
{
  "priority":        "Critical | High | Medium | Low",
  "platform":        "Google | Meta | YouTube",   // omit for account-wide
  "campaign_name":   "exact name from the pack",  // omit for account-wide
  "metric":          "CPL",
  "issue":           "What is wrong, in one sentence.",
  "action_required": "What to change. Specific enough to do without asking you.",
  "observation":     "The numbers this was read off, quoted from the pack.",
  "expected_impact": "₹ or % at current rates, or omit.",
  "failure_check":   "The condition that would make this advice wrong."
}
```

`metric`, `issue` and `action_required` are required — a row missing any of
them is dropped on receipt, because an action nobody can act on sits in the
open-actions count for ever and inflates the number the operator is watching.

`failure_check` is not optional in spirit. Every recommendation rests on
something that can stop being true, and this is the field that lets the person
picking the task up in three weeks notice.

### Priority

- **Critical** — money is being lost now, and the fix is this week.
- **High** — a clear, quantified gain worth acting on this month.
- **Medium** — real, but it can wait for the next cycle.
- **Low** — worth knowing, not worth scheduling.

Be sparing. Twelve agents run against one account; if each returns three
Criticals the list stops being a priority order and becomes a backlog.
