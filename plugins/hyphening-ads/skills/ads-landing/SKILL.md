---
name: ads-landing
description: "What paid traffic does after the click: contact-click volume, the page's own SEO findings, and the leaks between them. Use for 'landing page', 'after the click', 'conversion rate'."
user-invocable: true
license: MIT
metadata: { category: ads, version: "1.0.0" }
---

# Landing Page Conversion

Read `references/contract.md` first.

**Sections given:** `landing`, `spend` (when campaigns exist).

## What you are answering

The click was paid for. What happened next, as far as this system can see?

## Method

1. **State the measurement limit in the first paragraph.** There is no sessions
   or pageviews figure anywhere in this system. Contact clicks have no
   denominator, so **there is no conversion rate to report** — only click
   counts, and a ratio against *paid clicks* if `spend` is present, which is an
   upper bound because organic visitors click those buttons too. Any percentage
   presented as a landing page conversion rate here is fabricated. Do not
   produce one.
2. **Channel mix is a real finding.** Call versus WhatsApp tells you how this
   audience prefers to start, and whether the page leads with the right one.
3. **Compare pages against each other.** Where `landing_contact_clicks` covers
   several `page_url`s, relative volume across pages carrying similar traffic
   is the most reliable signal available, because the missing denominator is
   missing equally for all of them.
4. **Fold in the SEO audits.** `recent_seo_audits` covers the same pages paid
   traffic lands on. Performance and mobile findings there are conversion
   findings here — a slow page loses paid clicks before it loses rankings, and
   it loses them at a cost per click.
5. **Campaign-to-page matching.** Where clicks carry a `campaign_name`, check
   the page matches the promise. A campaign pointing at a generic homepage is a
   leak that costs full price per click.

## Scoring

`landing_score` per `references/scoring.md`. Omit it when neither contact
clicks nor SEO audits exist for the pages in question.

## Output

`report_json`: `{ measurement_limits[], channels[], pages: [{ url, clicks,
campaigns[], seo_findings[] }], leaks[], verdict }`.
