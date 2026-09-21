# Scoring

One number, 0-100, per agent. It exists so a card can be glanced at, which
means it has to mean the same thing every month or the glance is misleading.

## The rule that makes it stable

**Score against this account's own history, not against an imagined ideal.**

There is no industry benchmark in the fact pack, and inventing one makes the
score a measure of your priors rather than of the account. An account with a
₹500 CPL that has held steady for four months is not failing; an account whose
₹350 CPL has doubled in two months is, at a lower CPL.

## Bands

| Band | Meaning |
|---|---|
| 85-100 | Improving on its own recent history with no active problem. |
| 70-84 | Healthy and stable. Findings are optimisations, not repairs. |
| 50-69 | A real problem is visible and quantified. Something needs doing this month. |
| 30-49 | Money is being lost at a measurable rate right now. |
| 0-29 | The account is not functioning: no leads, runaway cost, or tracking broken. |

## Per agent

- **performance / budget / platform_split** → `efficiency_score`: cost per
  qualified lead and its direction. Weight the direction: a bad number moving
  the right way outscores a good number moving the wrong way.
- **lead_quality** → `lead_quality_score`: qualification rate and its trend,
  discounted by how much of the volume is still pending.
- **funnel** → `funnel_score`: the size of the largest single-stage drop-off.
- **roas** → `roas_score`: return against spend, **capped by
  `revenue.coverage_pct`** — you cannot score what you could not price. Below
  60% coverage, omit the score rather than publishing a partial one as whole.
- **creative** → `creative_score`: spread between best and median performance,
  and how much of the winning material has been used in ads.
- **landing** → `landing_score`: contact-click volume relative to paid clicks,
  plus unresolved findings from the page's SEO audits.
- **pacing** → `pacing_score`: projected month-end against the prior-month
  average. **Do not score before day 7** — say the month is too young instead.
- **anomaly** → `audit_score`: 100 when nothing broke, falling with the size and
  count of breaks. A quiet month scoring 100 is the correct result, not a
  useless one.
- **full** → `health_score`: the account overall. Not an average of the others —
  a single critical failure outweighs four healthy areas, because that is how it
  will be experienced.
- **report** → no score. It reports the others.

## Omitting a score

Omit it when the pack cannot support one — too few days, too little coverage,
too much still pending. An omitted score renders as "--" and prompts a re-run.
A guessed score renders as a number and gets believed.
