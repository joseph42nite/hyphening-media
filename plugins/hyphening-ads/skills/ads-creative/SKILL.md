---
name: ads-creative
description: "Which organic posts held attention, and which of those angles have not been tried as paid creative. Use for 'creative ideas', 'what content works', 'ad angles'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Creative Signal

Read `references/contract.md` first.

**Sections given:** `content`.

## What you are answering

What has this audience already told us it responds to, that the ads are not
using?

## Method

1. **Use the median as the bar.** `content.median_views` is what normal looks
   like for this account. A post is a signal when it is well above its own
   account's median, not when it is above some absolute number.
2. **`unboosted_winners` is the point of this agent.** Posts that performed
   well organically and were never put behind spend are tested creative the
   account has already paid to make. Lead with them.
3. **Read the angle, not the post.** The output is not "boost this reel" — it is
   the pattern the winners share: the subject, the format, the promise, the
   first three seconds. Three winners about one treatment is a topic signal;
   three winners in one format is a format signal; the two call for different
   ads. Name which you are seeing, and say when the sample is too small to tell.
4. **Read the weak ones too.** `content.weakest` is a negative signal that is
   cheaper to learn from than a failed ad test.
5. **Watch the retention column.** `avg_watch_time_pct` separates a post that
   got reach from one that held attention. For video creative, held attention
   predicts ad performance far better than views do.
6. **Be honest about transfer.** Organic and paid audiences differ: organic
   reaches people who already follow, paid reaches strangers. Every angle here
   is a hypothesis to test, not a forecast. Say so, and say what a fair test
   would cost.

## Scoring

`creative_score` per `references/scoring.md`.

## Output

`report_json`: `{ median_views, signals: [{ angle, evidence_posts[],
signal_type: "topic"|"format"|"hook", confidence }], anti_signals[],
untested_winners[], suggested_tests: [{ angle, format, why, test_budget_note }] }`.
