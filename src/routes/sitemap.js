/**
 * Marketing Ops Center — Sitemap & SEO Routes
 * Dynamically generates sitemap.xml with static routes and published blog posts,
 * and serves robots.txt with search crawler directives.
 */

import { Router } from 'express';
import db from '../../database.js';

const router = Router();

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

    const staticRoutes = [
      { url: '/', changefreq: 'weekly', priority: '1.0', lastmod: today },
      { url: '/blog', changefreq: 'daily', priority: '0.8', lastmod: today },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    for (const route of staticRoutes) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${baseUrl}${route.url}`)}</loc>\n`;
      xml += `    <lastmod>${route.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
      xml += `    <priority>${route.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Dynamic blog posts
    for (const post of posts) {
      const rawDate = post.updated_at || post.published_at || today;
      const lastmod = new Date(rawDate).toISOString().split('T')[0];
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${baseUrl}/blog/${post.slug}`)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
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
      'Allow: /blog',
      'Allow: /blog/*',
      'Disallow: /dashboard',
      'Disallow: /portal/',
      'Disallow: /login',
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
