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
| 05:30 | Mac connector off | Q | `pkill -f scripts/mac_connector.mjs` |
| 06:30 | Review night drafts | Vesper | |
| 07:30 | Start-of-day brief | Moneypenny | |

Day: health check 10:55, connector 11:00–18:00, plugin review Mondays 09:00
(Q), outreach prospects Sundays 02:00 (Boothroyd). Every routine's exact prompt
is in `~/agent-setup/openmausbot/routines/`.

**The 00:30 deploy depends on the 00:55 connector.** The 00:30 signal goes to
nobody, because the connector isn't on yet. The deploy actually starts at
about 00:55, from the connector's catch-up pass, which is still inside the
deploy window.

## When it doesn't run

The server queues the night's work itself (00:30 deploys, 01:00 blog, 01:15
audits, 03:30 fixes; `NIGHT_JOBS` in `src/services/scheduler.js`). The work
only *runs* while the Mac connector is on, and Q starts that at 00:55. So if
OpenMausBot isn't running, the work is queued but waits: nothing runs that
night, and the bots post no reports. It all starts as soon as the connector
next connects (deploys only inside 00:30–03:00).

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

### Incident, 22–23 Nov 2026

OpenMausBot quit normally at 09:40 IST on 22 Nov (`exited code=0`, probably
closed by hand). The Mac stayed awake, but that night no routine ran.
Hyphening Media's deploy (queued 22 Nov) didn't go out, no SEO skills ran, and
Dr. Divya's five 7-day cards stayed STALE. Reopened 23 Nov 08:37.

Those cards were also one night late for a second, unrelated reason. A night
run finishes a minute or two after 01:15, so a week later the card was a few
minutes short of 7 days at 01:15 and got skipped. That slipped the cadence to
8 days, with a full day of STALE in between. Fixed on branch
`fix/night-cadence-plugin-card`: a card due within `NIGHT_GRACE_HOURS` (6) of
the night run counts as due.

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
   After deploy, Tanner (01:20) and Boothroyd (03:35) run `seo-runs.mjs status`
   and Leiter (01:05) runs `blog-runs.mjs list queued,running`, and only
   report. Change the routines only after the deploy, or nothing is queued
   that night.
2. **launchd keeps the connector running.** A `com.hyphening.mac-connector`
   LaunchAgent (plist kept in `scripts/launchd/`) with `KeepAlive`, at about
   50 MB instead of the bots. **Open question:** why the connector runs only
   in the 11:00–18:00 and 00:55–05:30 windows. The commit that added it
   (`c561ca0`) calls it "the scheduled window" without saying why; it was
   possibly to keep the Mac free for other work, or to limit Claude-usage
   contention. If the windows matter, the connector should keep
   them itself (connected all day, starting workers only inside the windows)
   so the timing no longer depends on Q.
3. **launchd runs the health checks** at 00:45 and 10:55, writing the vault
   notes as now.
4. **Done (dashboard only, no Telegram).** Every connector connection is
   recorded in `mac_connector_sessions` (migration 124), and its
   `last_seen_at` moves on each 20 s heartbeat. The table works across the PM2
   cluster, where the socket lives in only one process. `lastNightConnection()`
   in `src/services/macConnector.js` checks whether the Mac was connected at any
   point in the last finished 00:30–03:00 IST window. If it wasn't, the SEO
   Monitor shows a red "Nothing ran last night" banner above the totals. The
   banner stays off until the table has a session from before that night, so
   it doesn't fire on the first night after the deploy.
5. **Then OpenMausBot is optional.** The bots' day work (Vesper's reviews,
   Moneypenny's brief, Q's Monday plugin review) still needs it open, but a
   closed app no longer stops deploys, audits or fixes.

Order: 4 and 1 are done. Then 2 (after the window question is answered),
then 3.

Known limit: the server's 00:30 deploy signal (`pushRunSignal`) only reaches
the connector if its socket is in the same PM2 process as the scheduler. That
doesn't matter today: the connector starts at 00:55 and its catch-up pass and
10-minute sweeps start the deploy worker anyway.
Update this doc and `~/agent-setup/openmausbot/routines` as each step lands.
