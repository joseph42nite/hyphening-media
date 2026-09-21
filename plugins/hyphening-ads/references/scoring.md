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

## Per card

The Ops Center stores one score column per card. Fill the one your card owns.

- **audit**, **monitor** → `health_score`: the account overall. Not an average
  of the other cards — a single critical failure outweighs four healthy areas,
  because that is how it will be experienced.
- **math**, **budget**, **optimize**, **google**, **meta**, **youtube** →
  `efficiency_score`: cost per qualified lead and its direction. Weight the
  direction: a bad number moving the right way outscores a good number moving
  the wrong way.
- **attribution**, **server_side_tracking** → `lead_quality_score`: how much of
  the outcome data can actually be trusted and tied back to a campaign.
- **landing** → `landing_score`. Remember there is no conversion rate available
  here; score on contact-click volume against paid clicks and on unresolved
  findings from the page's SEO audits.
- **creative** → `creative_score`: spread between best and median performance,
  and how much of the winning material has been used in ads.
- **plan** → `pacing_score`: how well the current split and spend match the
  stated strategy.
- **report** → `roas_score` where revenue coverage supports one, otherwise omit.
- Everything else (**create**, **dna**, **competitor**, **test**, **setup**,
  **validate**, **research**) → `audit_score`, or omit it. These produce
  artefacts rather than verdicts, and a number on them is decoration.

## Omitting a score

Omit it when the pack cannot support one — too few days, too little coverage,
too much still pending. An omitted score renders as "--" and prompts a re-run.
A guessed score renders as a number and gets believed.
