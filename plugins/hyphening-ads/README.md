# Ads Monitor

The paid-media counterpart to the SEO Monitor. Twelve agents analyse a client's
campaign, lead and revenue data on a schedule; you read the actions they
produce.

## Why this is not `claude-ads`

[AgriciDaniel/claude-ads](https://github.com/AgriciDaniel/claude-ads) (9.4k
stars, MIT, actively maintained) is the best paid-media plugin on GitHub and
this is modelled on it. It is not installed here for one reason: it audits
twelve ad platforms **through their APIs**, and this installation has
credentials for none of them.

That is not a small gap. The SEO fleet already learned what happens when a
skill runs without its data source — it does not fail, it writes a plausible
audit from training knowledge, and a fabricated Critical recommendation is
indistinguishable from a real one until someone acts on it. Running a
platform-API plugin with no platform APIs would do that twelve times over.

What this installation does have is the data those APIs cannot see: which leads
qualified, which booked an appointment, what a booked treatment is worth. So
the fleet is scoped to questions first-party data can actually answer, and each
agent declares the data it needs.

If Google Ads or Meta API access is added later, `claude-ads` becomes worth
installing alongside this — they answer different questions.

## How a run works

```
Dashboard / scheduler
  └─ POST /api/clients/:id/ads/trigger/:agentType
       └─ row in ads_agent_runs (status: queued)   ← the dedupe slot
            └─ worker: claim_ads_runs  ────────────→ fact pack delivered
                 └─ claude CLI runs the ads-* skill
                      └─ create_ads_audit  ────────→ ads_audits + ads_recommendations
                           └─ SSE → the dashboard card flips
```

The worker pulls; the Ops Center never reaches into it. A worker that was off
all morning collects its backlog when it wakes.

## The fact pack

`src/services/adsFacts.js` computes every figure — CTR, CPC, CPL, cost per
qualified lead, ROAS, pacing — in SQL and JS, and hands it to the agent already
calculated. The agent interprets; it never derives. Three things follow:

- **One database pass per run.** No tool round-trips, so a run is a single
  model call.
- **Numbers that match the dashboard**, because both render the same pack.
- **No fabrication surface.** A section that cannot be built is absent and named
  in `gaps`; an agent whose required section is missing is refused before it is
  queued, not handed an empty pack.

`GET /api/clients/:id/ads/facts` returns the pack for a human. Every figure in
every ads report traces back to it.

## Install

On the machine that will run the analyses:

```bash
claude plugin marketplace add /path/to/hyphening/plugins/hyphening-ads
claude plugin install hyphening-ads@hyphening-ads
```

Then the worker:

```bash
export HYPHENING_API_URL=https://hypheningmedia.com
export HYPHENING_HMAC_SECRET=...        # same secret the Ops Center verifies
export ADS_WORKER_ID=mac-mini

node plugins/hyphening-ads/scripts/ads_worker.mjs          # poll continuously
node plugins/hyphening-ads/scripts/ads_worker.mjs --once    # one pass, for cron
```

Under pm2, alongside the SEO worker:

```bash
pm2 start plugins/hyphening-ads/scripts/ads_worker.mjs --name ads-worker
```

## The schedule

| When | What |
|---|---|
| Daily 06:30 | Anomaly watch, for clients with more than one month of spend |
| Monday 07:00 | Sweep of stale agents, capped at `ADS_WEEKLY_CAP` (default 3) per client |

Everything else is manual. The cap is deliberate: a client ignored for a month
catches up over the next month rather than queueing forty runs in one night.

## The agents

| Agent | Answers | Needs |
|---|---|---|
| `full` | Is the account healthy, and what is the one thing to fix first? | campaigns |
| `performance` | Is it getting more or less for its money, and which campaign changed? | campaigns |
| `lead_quality` | Were the leads real, and what did a real one cost? | campaigns + leads |
| `funnel` | Where do people stop between arriving and booking? | leads |
| `roas` | What did the spend actually return? | campaigns + leads + prices |
| `budget` | Where should the next rupee go, and how many? | campaigns |
| `platform_split` | Is each platform doing its job? | 2+ platforms |
| `pacing` | Where does this month land at the current rate? | current-month spend |
| `anomaly` | Did anything break since last month? | 2+ months |
| `creative` | What angles work that the ads have not tried? | posted content |
| `landing` | What happens after the click? | contact clicks or SEO audits |
| `report` | The month, written for the client. | campaigns |

## What it will not do

- **Change anything in an ad account.** There is no write path to any platform,
  by design. Every output is a recommendation a person actions.
- **Quote an industry benchmark.** Nothing in the pack contains one. Agents
  compare against the account's own history and say so.
- **Pace against a budget.** No monthly budget is stored anywhere in this
  system. Pacing compares to the account's own prior-month average.
- **Report lifetime value.** Revenue is the first booked treatment, priced off
  the client's own list, and every report says so.
- **Report a landing page conversion rate.** There is no sessions figure in
  this system, so contact clicks have no denominator. Any such percentage would
  be invented.
