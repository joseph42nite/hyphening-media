# Ads Monitor

The paid-media counterpart to the SEO Monitor. Thirty-three cards, each backed
by a skill from [AgriciDaniel/claude-ads](https://github.com/AgriciDaniel/claude-ads)
— the same author as the `claude-seo` plugin already serving the SEO Monitor, so
both fleets now work the same way end to end.

This directory is **not** a plugin. It is the bridge between claude-ads and the
Ops Center: the fact pack that feeds it, the reply contract that gets results
back, and the worker that runs it.

## Install

```bash
claude plugin marketplace add agricidaniel/claude-ads
claude plugin install claude-ads@ai-marketing-hub-claude-ads
```

Then the worker, on the machine that will run the analyses:

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

## How a run works

```
Dashboard / scheduler
  └─ POST /api/clients/:id/ads/trigger/:agentType
       └─ row in ads_agent_runs (status: queued)   ← the dedupe slot
            └─ worker: claim_ads_runs  ────────────→ skill name + fact pack
                 └─ claude CLI runs the claude-ads skill
                      └─ create_ads_audit  ────────→ ads_audits + ads_recommendations
                           └─ SSE → the dashboard card flips
```

The worker pulls; the Ops Center never reaches into it. A worker that was off
all morning collects its backlog when it wakes.

## The fact pack

claude-ads is source-grounded: it audits exports and authorised account reads,
and refuses to invent account context. This installation has no ad-platform API
credentials, so `src/services/adsFacts.js` supplies the source instead — and it
supplies something the platform APIs cannot see anyway: which leads qualified,
which booked an appointment, and what a booked treatment is worth.

Every figure is computed in SQL and JS before the skill sees it — CTR, CPC, CPL,
cost per qualified lead, ROAS, pacing. Three things follow:

- **One database pass per run.** No tool round-trips, so a run is a single model
  call. A claim payload measures around 3 KB.
- **Numbers that match the dashboard**, because both render the same pack.
- **No fabrication surface.** A section that cannot be built is absent and named
  in `gaps`; a card whose required section is missing is refused before it is
  queued rather than handed an empty pack.

`GET /api/clients/:id/ads/facts` returns the pack for a human. Every figure in
every ads report traces back to it.

## Blocked cards

All thirty-three are listed. Fourteen are blocked for one of three reasons, and
the card says which:

| Kind | Cards | What would unblock it |
|---|---|---|
| **Missing data** | `youtube`, `landing` | Record spend on that platform, or landing-page contact clicks |
| **Not configured** | `generate`, `photoshoot` | Set `ADS_IMAGE_PROVIDER` and its API key |
| **Deliberately off** | `launch`, and the applying half of `optimize` | A platform API adapter and a mutation gate — a decision, not a default |
| **Platform not run** | `linkedin`, `tiktok`, `microsoft`, `apple`, `amazon`, `pinterest`, `reddit`, `snapchat`, `x` | `marketing_ad_campaigns.platform` accepts Google, Meta and YouTube only; this needs a schema change first |

## The schedule

| When | What |
|---|---|
| Daily 06:30 | `ads-monitor` — pacing, delivery, creative fatigue, tracking, policy |
| Monday 07:00 | Sweep of stale cards, capped at `ADS_WEEKLY_CAP` (default 3) per client |

Statically blocked cards are skipped by the sweep: waiting cannot unblock them.

## What it will not do

- **Change anything in an ad account.** `ads-launch` and applying optimisations
  are blocked at the Ops Center, and no platform adapter is configured. Every
  output is a recommendation a person actions.
- **Quote an industry benchmark.** Nothing in the pack contains one. Cards
  compare against the account's own history and say so.
- **Pace against a budget.** No monthly budget is stored anywhere in this
  system. Pacing compares to the account's own prior-month average.
- **Report lifetime value.** Revenue is the first booked treatment, priced off
  the client's own list, and every report says so.
- **Report a landing page conversion rate.** There is no sessions figure in this
  system, so contact clicks have no denominator.

## Security

Both plugins were audited before use (2026-09-21):

- **claude-ads** ships no hooks — nothing runs on your machine automatically. No
  telemetry, no author callback, no dynamic code execution, no access to `.ssh`,
  `.aws`, `.netrc` or the keychain. Its skills explicitly treat supplied exports
  and pages as untrusted data and refuse instructions embedded in them.
- **claude-seo** ships one `PostToolUse` hook that validates JSON-LD locally
  with no network access. It reads only the API credentials you provide, and
  every outbound host is a named API: Moz, Bing Webmaster, DataForSEO, Common
  Crawl, Google (PageSpeed, CrUX, GSC, GA4, NLP), IndexNow.

Both ship SSRF and DNS-rebinding defences that block cloud metadata endpoints
and encoded loopback addresses.

Re-audit on plugin update: a marketplace refresh pulls new code.
