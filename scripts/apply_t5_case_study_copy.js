/**
 * T5 case-study copy (recs 1970, 1971; client_id 10, Hyphening Media).
 *
 * Case studies live only in the case_studies table, so this copy can't ship
 * with a code push. Run this once on the server after 007 approves:
 *
 *   node scripts/apply_t5_case_study_copy.js           # dry run, prints the change
 *   node scripts/apply_t5_case_study_copy.js --apply   # writes it
 *
 * It updates by slug and leaves slugs alone. Editing the title in the admin
 * form would regenerate the slug (see PUT in src/routes/caseStudies.js) and
 * break both indexed URLs, which is why this isn't done through the portal.
 *
 * Each row is only touched if its title is still the 2026-11-02 live title
 * (or already the new one), so a later admin edit is never overwritten.
 *
 * Copy: Vesper's T5 draft, mapped onto the existing body text, which is kept.
 * DentAlchemy windows: ~100 online leads and CPL ₹2,281 in the first month of campaigns,
 * 2.5x revenue reached in the second month of campaigns, no baseline, walk-ins untracked.
 * TBC: structure only, no figures; Vesper's placeholder brief/approach wording
 * is not used, the existing text fills those sections.
 */

import db from '../database.js';
import { logAction } from '../src/services/auditLogger.js';

const APPLY = process.argv.includes('--apply');
const BANNED = [/3 months/i, /three months/i, /2,400/, /2400/];

const UPDATES = [
  {
    slug: 'how-we-competed-with-large-corporate-chains-on-google-ads-the-dentalchemy-case-study',
    oldTitle: 'How We Competed With large corporate chains on Google Ads: The DentAlchemy Case Study',
    title: 'How DentAlchemy got about 100 online leads in its first month of campaigns',
    summary: 'How Hyphening Media, a healthcare marketing agency in Bengaluru, brought a dental clinic about 100 online leads in its first month of campaigns at ₹2,281 per lead.',
    content: `Hyphening Media, a healthcare marketing agency in Bengaluru, brought DentAlchemy about 100 online leads in the first month of campaigns at a cost per lead of ₹2,281. Revenue reached 2.5x in the second month of campaigns.

## Results

- Online leads: about 100 in the first month of campaigns.
- Cost per lead: ₹2,281, first month of campaigns.
- Revenue: 2.5x, reached in the second month of campaigns.
- Walk-ins: the clinic also received many walk-in patients. These were not tracked, so we give no number for them.

## The challenge

DentAlchemy needed a steady flow of new patient enquiries. Dental clinic marketing in India depends on trust and local reach, so the clinic needed more than a handful of ads.

DentAlchemy is a specialist clinic competing with Large corporate chains with multi-city footprints and much bigger brand recall. The clinic had no organic traction to lean on, so almost all its patient traffic came from Google Ads.

When we started with an organic SEO audit, we found the ad account itself was the bigger problem:
GTM was misconfigured. Tags weren’t aligned with the pages, so tracking was unreliable.
The landing page was slow and not mobile-optimized. Most dental ad clicks come from phones, so visitors were leaving before they filled in a form.
Form submissions had no fixed destination. Leads were being collected without a consistent place to land, so they were easy to lose.
Ad sets were scattered and competing. Overlapping campaigns were bidding against each other and wasting budget.

## What we did

Hyphening Media ran lead generation for the clinic with healthcare content creation and paid online campaigns, and reported on the leads they produced.

Before changing anything, we spent a month in regular conversations with Dr. Annu. We covered her goals, the patients she wanted to attract, the clinic’s specialities, and what could set a single clinic apart from national chains. Every campaign decision that followed came from those conversations.

Rebuilt the GTM setup so every page, click and form fill is tracked properly.
Built mobile-first landing pages that load quickly, since around 90% of dental ad clicks happen on mobile. Gave form fills a defined destination, so that we do not miss any enquiries. We replaced the tangled setup with a clean structure. Each ad set targets one type of patient intent:

Emergency dentist, Generic dental queries, Call-focused campaigns, Braces, Implants,Other high-intent procedures

With 9+ ad sets, 12 possible appearance for each ads that’s over 100 ad combinations (108 in total), each with dedicated keywords. Regular search term audits, Locked-in negative keywords to cut irrelevant spend, Location targeting matched to where the clinic’s patients actually are
A clean, more reliable account with campaigns no longer competing against each other.

For a single branch multispeciality clinic up against national chains, the biggest win came from fixing tracking, mobile experience and campaign structure before spending more. Once that was in place, the same budget worked much harder.

## How the results are measured

Online leads and cost per lead cover the first month of campaigns. The 2.5x revenue figure was reached in the second month of campaigns and is reported separately. We do not state a baseline for it. Walk-ins are not counted in any figure above.

Looking for medical practice lead generation in India? Talk to Hyphening Media about your clinic.`,
  },
  {
    slug: 'how-to-build-a-community-for-artist-and-find-venues-for-curation',
    oldTitle: 'How to build a community for artist and find venues for curation',
    title: 'TBC: how we approached artist curation',
    // summary: unchanged, the existing one is real and Vesper gave none for TBC
    content: `TBC is a rooftop venue where Hyphening Media ran artist curation. Results from curation are hard to track, so this case study describes our approach and does not report figures.

## The brief

TBC is a rooftop location with a generous space, not ideally for a dance floor but for a karaoke night it was perfect. I met the CEO of this location and together we found multiple strategies to make this karaoke different from all other locations. While the world was replying on digital menus we took a different route. We printed a small sheet of paper with song requests, the important part of this was whom to dedicate the song to. This gave the song requests a more intimate feel as the audience feels part of the location.  An evening out with special someone or your one sided love would feel like you're putting in so much. Maybe you could get lucky, and I have a part in it? I'll take that win. The CEO was a visionary in that sense. He knew that we didn't need to have business on day one, but the growth should happen within a few months. While more general managers don't get this part, the CEO was a true delight to work with.

## Our approach

I personally built a foundation for the venue to trust in a third party like us as well as with the artist. Now for artists the money they get from the gigs is their bread and butter. A corporate delay in payment won't be a delight for them. So whenever needed I would pay from my pocket so they do not feel the delay in logistics of money transfer.

Now my goal is to centralise this. The moment I onboard a location I want the artists/my artists to already be prepared with the way we work and the location to feel like the process of bringing the artists in was easy. The next goal is to host bigger event. Have more 4 piece 10 piece band be performing and be able to pull in crowds in 100s. The market of building a community will blow up as AI will take of software completely. We find ways to always be more connected and music is the grand connector.

## Why we don't quote numbers

Curation outcomes don't map cleanly to trackable metrics, so we report none.

Need creative operations support? Speak to Hyphening Media, a creative operations agency in Bengaluru.`,
  },
];

let failed = false;

for (const u of UPDATES) {
  const row = db.prepare('SELECT id, title, summary, content FROM case_studies WHERE slug = ?').get(u.slug);
  if (!row) {
    console.error(`[SKIP] ${u.slug}: not found`);
    failed = true;
    continue;
  }
  if (row.title !== u.oldTitle && row.title !== u.title) {
    console.error(`[SKIP] ${u.slug}: title is now "${row.title}", edited since 2026-11-02, not overwriting`);
    failed = true;
    continue;
  }

  const next = { title: u.title, content: u.content };
  if (u.summary) next.summary = u.summary;

  const hit = BANNED.find((re) => Object.values(next).some((v) => re.test(v)));
  if (hit) {
    console.error(`[ABORT] ${u.slug}: new copy matches ${hit}`);
    process.exit(1);
  }

  const changed = Object.keys(next).filter((k) => row[k] !== next[k]);
  if (changed.length === 0) {
    console.log(`[OK] ${u.slug}: already applied`);
    continue;
  }

  console.log(`[${APPLY ? 'APPLY' : 'DRY RUN'}] id ${row.id} ${u.slug}: ${changed.join(', ')}`);
  console.log(`  title: "${row.title}" -> "${next.title}"`);
  if (next.summary) console.log(`  summary: "${row.summary}" -> "${next.summary}"`);

  if (APPLY) {
    const diff = Object.fromEntries(changed.map((k) => [k, next[k]]));
    diff.updated_at = new Date().toISOString();
    const set = Object.keys(diff).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE case_studies SET ${set} WHERE id = ?`).run(...Object.values(diff), row.id);
    logAction({
      action: 'update',
      entityType: 'case_study',
      entityId: row.id,
      diff: { ...diff, note: 'T5 case-study copy, recs 1970/1971 (scripts/apply_t5_case_study_copy.js)' },
    });
  }
}

if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.');
process.exit(failed ? 1 : 0);
