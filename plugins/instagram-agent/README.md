# Instagram agent skills (vendored)

A fixed copy of [Jakeschincariol/instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill),
MIT (see `LICENSE`), taken at commit `d03c56bb598be770c60b201f94237e5d1a4268a6`
(13 September 2026). Copied rather than installed so an upstream change can't
alter what the Reel Lab writes without someone reading the diff first.

`ig-dm` is left out on purpose: automated DMs break Instagram's terms and the
clinics don't run creator-style DM funnels.

## What uses it

| Skill | Used by |
| --- | --- |
| `ig-reel` (+ `hooks.json`, `hookscore.py`, `beats.py`) | Reel Lab: Script Tracker, "From viral reel" and "Improve hooks" |
| `ig-caption` (`caption.py`) | Reel Lab caption and its checks |
| `ig-human` (`humanize.py`, `detect.py`, `slop.json`) | Reel Lab: every hook, script line and caption is cleaned and scored |
| `ig-plan`, `ig-story`, `ig-carousel` | planned: "Plan shoot & calendar" |
| `ig-profile` | planned: profile score in onboarding |
| `ig-comment` | planned: comment queue (staff post by hand) |
| `ig-audit`, `ig-viral` (`swipe.py`) | planned: learning loop from the content tracker |
| `ig-repurpose`, `ig-reply` | later |

The worker is `scripts/ig_worker.mjs`; the server side is `src/services/reelLab.js`.

## Our additions

- `healthcare.json`: hook formulas the Reel Lab never uses for a client on the
  healthcare compliance profile, and the rules every healthcare script follows.
  Edit it here; the upstream files are left as they came.

The Python tools need only Python 3 (standard library, no network). The
worker uses `IG_PYTHON` or `python3`.

## Updating

Re-copy from upstream at a new commit, read the diff (these files are prompts
the worker follows, so a change is a behaviour change), update the commit above,
and run `npx vitest run src/tests/reel_lab*.test.js`.
