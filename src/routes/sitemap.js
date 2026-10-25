/**
 * Marketing Ops Center — Sitemap & SEO Routes
 * Dynamically generates sitemap.xml with static routes and published blog posts,
 * and serves robots.txt with search crawler directives.
 */

import { Router } from 'express';
import db from '../../database.js';

const router = Router();

// The 9 public capability/pillar pages (frontend/src/data/pillarsData.js) are
// real routes (/capabilities/:slug) but were missing from the sitemap entirely.
// Keep this list in sync with that file's slugs.
const CAPABILITY_SLUGS = [
  'content-strategy',
  'video-production',
  'social-media-ops',
  'web-development',
  'app-development',
  'performance-analytics',
  'campaign-management',
  'brand-development',
  'news-media-pr',
];

// lastmod for the static marketing pages. Using `new Date()` per-request made
// every static <url> show the current server date instead of when the page's
// content actually last changed, which read to crawlers as a build timestamp.
// Bump these only when the page's own copy changes.
const HOME_LASTMOD = '2026-10-24';
const CAPABILITIES_LASTMOD = '2026-10-08';

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getBaseUrl(req) {
  if (process.env.WEBSITE_URL && process.env.WEBSITE_URL !== 'http://localhost:3000') {
    return process.env.WEBSITE_URL.replace(/\/$/, '');
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

/**
 * GET /sitemap.xml
 * Dynamic XML Sitemap
 */
router.get('/sitemap.xml', (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const today = new Date().toISOString().split('T')[0];

    // Fetch published blog posts from DB
    let posts = [];
    try {
      posts = db.prepare(
        "SELECT slug, published_at, updated_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC"
      ).all();
    } catch (err) {
      console.warn('[SITEMAP] Could not fetch blog posts from DB:', err.message);
    }

    // Fetch published case studies from DB
    let caseStudies = [];
    try {
      caseStudies = db.prepare(
        "SELECT slug, published_at, updated_at FROM case_studies WHERE status = 'published' ORDER BY published_at DESC"
      ).all();
    } catch (err) {
      console.warn('[SITEMAP] Could not fetch case studies from DB:', err.message);
    }

    // Most recent post/case-study update stands in for the listing page's own
    // lastmod — that's the real reason the listing's content changed, not the
    // date the server happened to render the response.
    const latestPostDate = posts[0]?.updated_at || posts[0]?.published_at;
    const latestCaseStudyDate = caseStudies[0]?.updated_at || caseStudies[0]?.published_at;
    const blogLastmod = latestPostDate ? new Date(latestPostDate).toISOString().split('T')[0] : HOME_LASTMOD;
    const caseStudiesLastmod = latestCaseStudyDate ? new Date(latestCaseStudyDate).toISOString().split('T')[0] : HOME_LASTMOD;

    // changefreq/priority are hints Google has said for years it ignores; lastmod
    // is the one signal crawlers actually use, so that's all each <url> carries.
    const staticRoutes = [
      { url: '/', lastmod: HOME_LASTMOD },
      { url: '/blog', lastmod: blogLastmod },
      { url: '/case-studies', lastmod: caseStudiesLastmod },
      { url: '/capabilities', lastmod: CAPABILITIES_LASTMOD },
      ...CAPABILITY_SLUGS.map((slug) => ({ url: `/capabilities/${slug}`, lastmod: CAPABILITIES_LASTMOD })),
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    for (const route of staticRoutes) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${baseUrl}${route.url}`)}</loc>\n`;
      xml += `    <lastmod>${route.lastmod}</lastmod>\n`;
      xml += `  </url>\n`;
    }

    // Dynamic blog posts
    for (const post of posts) {
      const rawDate = post.updated_at || post.published_at || today;
      const lastmod = new Date(rawDate).toISOString().split('T')[0];
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${baseUrl}/blog/${post.slug}`)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `  </url>\n`;
    }

    // Dynamic case studies
    for (const study of caseStudies) {
      const rawDate = study.updated_at || study.published_at || today;
      const lastmod = new Date(rawDate).toISOString().split('T')[0];
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${baseUrl}/case-studies/${study.slug}`)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP] Generation error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * GET /robots.txt
 * Robots Exclusion Protocol
 */
router.get('/robots.txt', (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const robots = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /portal/',
      'Disallow: /api/',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');

    res.header('Content-Type', 'text/plain');
    res.send(robots);
  } catch (err) {
    console.error('[ROBOTS] Generation error:', err);
    res.status(500).send('Error generating robots.txt');
  }
});

export default router;
