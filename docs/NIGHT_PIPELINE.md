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
| 01:00 | Night blog drafts | Leiter | `scripts/blog-runs.mjs start` → `queue_blog_runs` |
| 01:15 | Night SEO audits | Tanner | `scripts/seo-runs.mjs start` → `queue_seo_night`: every SEO-on client's cards past their cadence (`dueSkills` in `src/services/seoNight.js`) |
| 03:30 | Night SEO fixes | Boothroyd | `scripts/seo-runs.mjs fix` → `queue_seo_fixes`: one fix batch per client with a site repo |
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

Every step except the 00:30 signal is started by an OpenMausBot routine. If
OpenMausBot isn't running, **nothing runs and nothing says so**: the connector
stays off, deploys stay queued, no audits are queued, and no fixes are made.

How to tell:

- SEO Monitor: "no SEO skills ran last night", a deploy still "queued for
  tonight" the next morning, and the plugins line saying the Mac last reported
  hours ago.
- `pgrep -x OpenMausBot` prints nothing.
- `~/Library/Logs/openmausbot/server.log` ends in `exited`, with no
  `[Scheduled routine ...]` lines since.

Fix: open OpenMausBot. Anything missed runs the next night. A deploy can't be
pushed during the day; for audits, press **Run** on the stale cards.

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

**Not started; waiting for approval.** OpenMausBot is ~1.2 GB of RAM and a
single point of failure. None of the night steps need a bot: each is one shell
command or one webhook call. The bots can keep their reporting (posting
results to rooms) without being the thing that starts the work.

1. **Server starts its own night queues.** Add crons to `scheduler.js` that
   call `queueBlogRuns` at 01:00, `queueNightAudits` at 01:15 and
   `queueSeoFixes` at 03:30, the same way the 00:30 deploy signal works. They
   are safe to run alongside the bots during the switch: a skill already in
   flight isn't queued twice, and a client with an open fix batch is skipped.
   Then point Tanner, Boothroyd and Leiter's routines at the summary commands
   (`seo-runs.mjs status`) instead of `start`/`fix`.
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
4. **An alert when the Mac is missing.** If the connector isn't connected by
   01:00 IST, the server sends a Telegram message to the admin chat
   (`TELEGRAM_ADMIN_CHAT_ID` already exists). Last night would have been
   caught at 01:00, not discovered the next morning.
5. **Then OpenMausBot is optional.** The bots' day work (Vesper's reviews,
   Moneypenny's brief, Q's Monday plugin review) still needs it open, but a
   closed app no longer stops deploys, audits or fixes.

Order: 4 first, since it's small and catches the failure whatever else
changes. Then 1, then 2 (after the window question is answered), then 3.
Update this doc and `~/agent-setup/openmausbot/routines` as each step lands.
