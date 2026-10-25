/**
 * Proposed 301 map for SEO rec 1961 (near-duplicate/cannibalizing blog posts).
 *
 * NOT wired into the app yet. Picking the canonical slug per cluster is
 * 007's call, not Boothroyd's — these are proposed defaults only. Once
 * confirmed (or edited), the next step is:
 *   1. Import this in server.js and 301 `/blog/:slug` when the slug is a key
 *      here, to `/blog/<canonical>`.
 *   2. Import it in sitemap.js and skip any post whose slug is a key here,
 *      so the superseded URLs drop out of the sitemap too.
 *   3. Only then set the superseded posts' status so they stop serving their
 *      own page directly (that DB write is explicitly out of scope for this
 *      ticket — no recommendation/content status changes here).
 *
 * Source: live sitemap.xml + /api/blog read on 2026-10-25, matched against
 * Tanner's cluster counts (3 nano/micro-influencer, 2 brand-authenticity,
 * 2 short-form-video).
 */

export const DUPLICATE_POST_REDIRECTS = {
  // --- nano/micro-influencer cluster (3 posts, all lastmod 2026-08-03) ---
  // Proposed default canonical: the first one published under this theme,
  // cleanest slug. 007 to confirm or pick a different one of the 3.
  'influencer-marketing-in-india-2026-why-nano-micro-creators-are-crushing-it-and-what-your-brand-should-do-about-it':
    'influencer-marketing-in-india-2026-why-nano-micro-creators-are-the-real-growth-engine',
  'micro-nano-influencer-marketing-in-india-2026-why-small-audiences-drive-bigger-roi':
    'influencer-marketing-in-india-2026-why-nano-micro-creators-are-the-real-growth-engine',

  // --- brand-authenticity cluster (2 posts) ---
  // Proposed default canonical: more recent lastmod (2026-07-20 vs 2026-07-18).
  'brand-authenticity-in-2026-why-purpose-driven-marketing-is-the-only-strategy-that-works-for-indian-brands':
    'brand-authenticity-in-the-age-of-ai-how-indian-brands-can-build-trust-that-lasts-in-2026',

  // --- short-form-video cluster (2 posts) ---
  // Proposed default canonical: more recent lastmod (2026-08-05 vs 2026-07-02).
  'short-form-video-marketing-in-2026-why-indian-brands-cant-afford-to-ignore-it':
    'short-form-video-marketing-in-india-2026-the-highest-roi-channel-your-brand-is-underusing',
};
