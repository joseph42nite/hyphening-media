# The night pipeline

What runs overnight, what starts each step, how to tell when it didn't run, and
the plan to stop it depending on OpenMausBot being open. Setting up the Mac is
in [MAC_SETUP.md](MAC_SETUP.md).

## The night, step by step (IST)

| Time | Step | Started by | What happens |
|---|---|---|---|
| 00:30 | Night deploys | Server cron (`src/services/scheduler.js`) | Signals the Mac; `deploy_worker` pushes and deploys every batch 007 pressed **Deploy** on. The server hands out deploys only between 00:30 and 03:00. |
| 00:45 | Health check | Q | `scripts/health-check.sh --write` |
| 00:55 | Mac connector on | Q | `scripts/mac_connector.mjs` dials the portal; on connect it runs every worker once (catch-up), then sweeps every 10 minutes |
| 01:00 | Night blog drafts | Server cron | `queueBlogRuns` (Blog fleet on Auto), then wakes the blog worker. Leiter reports at 01:05 (`blog-runs.mjs list queued,running`). |
| 01:15 | Night SEO audits | Server cron | `queueNightAudits`: every SEO-on client's cards past their cadence (`dueSkills` in `src/services/seoNight.js`), then wakes the SEO worker. Tanner reports at 01:20 (`seo-runs.mjs status`). |
| 03:30 | Night SEO fixes | Server cron | `queueSeoFixes`: one fix batch per client with a site repo, then wakes the fix worker. Boothroyd reports at 03:35 (`seo-runs.mjs status`). |
| 05:30 | Mac connector off | Q | `pkill -f scripts/mac_connector.mjs`; a worker already running finishes its pass |
| 06:30 | Review night drafts | Vesper | |
| 07:30 | Start-of-day brief | Moneypenny | |

Day: health check 10:55, connector 11:00–18:00 (Q), plugin review Mondays 09:00
(Q), outreach prospects Sundays 02:00 (Boothroyd). Every routine's exact prompt
is in `~/agent-setup/openmausbot/routines/`.

**The connector runs only while Q has it on** (00:55–05:30, 11:00–18:00).
The 00:30 deploy signal goes to nobody; the deploy starts at about 00:55 from
the connector's catch-up pass, still inside the 00:30–03:00 deploy window. The
connector also refuses to start workers outside those hours itself
(`WINDOWS_IST` in `scripts/mac_connector.mjs`), so one started by hand at
night doesn't run work early.

## When it doesn't run

The server queues the night's work itself (00:30 deploys, 01:00 blog, 01:15
audits, 03:30 fixes; `NIGHT_JOBS` in `src/services/scheduler.js`). The work
only *runs* while the Mac connector is on, and Q starts that at 00:55. If
OpenMausBot isn't running, the work is queued but waits: nothing runs that
night and the bots post no reports. It all runs when the connector next comes
on (deploys only inside 00:30–03:00).

How to tell:

- SEO Monitor: a red "Nothing ran last night" banner (from 24 Nov 2026).
- SEO Monitor: "no SEO skills ran last night", a deploy still "queued for
  tonight" the next morning, and the plugins line saying the Mac last reported
  hours ago.
- `pgrep -x OpenMausBot` prints nothing.
- `~/Library/Logs/openmausbot/server.log` ends in `exited`, with no
  `[Scheduled routine ...]` lines since.

Fix: open OpenMausBot. At 11:00 Q starts the connector and the queued audits,
fixes and drafts run then. A deploy can't be pushed during the day; it goes out
the next night.


## Plan: the night runs without OpenMausBot

**In progress.** OpenMausBot is ~1.2 GB of RAM and a
single point of failure. None of the night steps need a bot: each is one shell
command or one webhook call. The bots can keep their reporting (posting
results to rooms) without being the thing that starts the work.

1. **Done: the server starts its own night queues.** `NIGHT_JOBS` in
   `src/services/scheduler.js` runs the bots' own webhook handlers
   (`handleQueueBlogRuns`, `handleQueueSeoNight`, `handleQueueSeoFixes`) at
   01:00, 01:15 and 03:30 IST on the first PM2 process, marked `by: 'server'`
   (SEO runs show `night:server`). Fleet switches, budget caps and in-flight
   checks are unchanged, and a second start the same night adds nothing, so a
   bot still on `start` is harmless. The webhooks stay for manual starts.
   Deployed 23 Nov 2026. The same day the three routines became report-only
   ("Report night blog drafts" 01:05, "Report night SEO audits" 01:20,
   "Report night SEO fixes" 03:35): Leiter runs `blog-runs.mjs list
   queued,running 1`, Tanner and Boothroyd run `seo-runs.mjs status`. They
   were edited in `~/.openmausbot/routines.json` with OpenMausBot quit (the
   running app rewrites that file); backup `routines.json.bak-20261123-night-report`.
2. **Tried and rolled back (23 Nov 2026): launchd keeps the connector
   running.** `scripts/launchd/install-mac-connector.sh` installed
   `com.hyphening.mac-connector` (KeepAlive, connected all day, workers only
   inside the windows; `ProcessType Standard`, since `Background` throttles
   every worker). It ran for about an hour, then was removed: **anything
   launchd starts gets EPERM on the external Mac Valhalla drive** (macOS
   privacy protection; tested with a one-off launchd job reading and writing
   the vault). The workers need the vault: the health check (it exits 1, which
   the workers don't treat as BLOCKED, so they'd run ungated), blog narration's
   audio queue, the healthcare compliance note and the night report. Processes
   OpenMausBot starts have access, so Q's four connector routines are back on
   (backup `routines.json.bak-20261123-q-back`). To retry: give the pinned
   `node` Full Disk Access (System Settings > Privacy & Security, redo after
   each Node upgrade; it covers every Node script), rerun the vault test, then
   install and disable Q's routines.
3. **Dropped: launchd health checks.** The check that gates the night is the
   one the blog and fix workers run themselves before each run; Q's 00:45 and
   10:55 routines only post the result to rooms, which needs Q anyway. Same
   vault-drive problem as step 2.
4. **Done (dashboard only, no Telegram).** Every connector connection is
   recorded in `mac_connector_sessions` (migration 124), and its
   `last_seen_at` moves on each 20 s heartbeat. The table works across the PM2
   cluster, where the socket lives in only one process. `lastNightConnection()`
   in `src/services/macConnector.js` checks whether the Mac was connected at any
   point in the last finished 00:30–03:00 IST window. If it wasn't, the SEO
   Monitor shows a red "Nothing ran last night" banner above the totals. The
   banner stays off until the table has a session from before that night, so
   it doesn't fire on the first night after the deploy.
5. **Not reached: OpenMausBot is still needed at night**, to start the
   connector. What changed: the server queues the night work itself, the bots
   only report, and the dashboard says when nothing ran.

Where it ended: 1 and 4 are done, 2 was rolled back, 3 was dropped.

Known limit: the server's 00:30 deploy signal (`pushRunSignal`) only reaches
the connector if its socket is in the same PM2 process as the scheduler. That
doesn't matter: the 00:55 catch-up pass and the 10-minute sweeps start the
deploy worker anyway.
Update this doc and `~/agent-setup/openmausbot/routines` as each step lands.
