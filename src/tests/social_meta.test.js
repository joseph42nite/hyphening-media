import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import db from '../../database.js';
import { injectSocialMeta, prerenderPath } from '../services/prerender.js';

const SLUG = `og-test-${Date.now()}`;
const SHELL = fs.readFileSync(path.resolve('frontend/index.html'), 'utf8');
const meta = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

describe('injectSocialMeta', () => {
  beforeAll(() => {
    db.prepare(
      `INSERT INTO case_studies (title, slug, summary, content, cover_image_url, status, published_at)
       VALUES (?, ?, ?, ?, ?, 'published', datetime('now'))`
    ).run('Clinic Growth $5 & More', SLUG, 'How we grew a clinic.', 'Body', '/uploads/clinic-cover.jpg');
  });
  afterAll(() => {
    db.prepare('DELETE FROM case_studies WHERE slug = ?').run(SLUG);
  });

  it('uses the case study title, summary and cover image', () => {
    const url = `https://hypheningmedia.com/case-studies/${SLUG}`;
    const html = injectSocialMeta(SHELL, `/case-studies/${SLUG}`, url);
    expect(meta(html, 'og:image')).toBe('https://hypheningmedia.com/uploads/clinic-cover.jpg');
    expect(meta(html, 'twitter:image')).toBe('https://hypheningmedia.com/uploads/clinic-cover.jpg');
    expect(meta(html, 'og:title')).toBe('Clinic Growth $5 &amp; More — Hyphening Media Case Study');
    expect(meta(html, 'og:description')).toBe('How we grew a clinic.');
    expect(meta(html, 'og:url')).toBe(url);
    expect(meta(html, 'og:type')).toBe('article');
    expect(meta(html, 'og:image:width')).toBeUndefined();
  });

  it('uses the capability image for capability pages', () => {
    const html = injectSocialMeta(SHELL, '/capabilities/content-strategy', 'https://hypheningmedia.com/capabilities/content-strategy');
    expect(meta(html, 'og:image')).toBe('https://hypheningmedia.com/capabilities/content-strategy.webp');
  });

  it('leaves unknown slugs and other paths on the homepage shell', () => {
    expect(injectSocialMeta(SHELL, '/case-studies/no-such-slug', 'x')).toBe(SHELL);
    expect(injectSocialMeta(SHELL, '/', 'x')).toBe(SHELL);
  });
});

// Mirrors what server.js serves for these paths on the public host.
const serve = (pathname) => {
  let html = injectSocialMeta(SHELL, pathname, `https://hypheningmedia.com${pathname}`);
  const body = prerenderPath(pathname);
  if (body) html = html.replace(/<div id="root">[\s\S]*?<\/main>/, () => `<div id="root">\n      ${body}`);
  return html;
};
const HOME_TITLE = SHELL.match(/<title>([^<]*)<\/title>/)[1];
const HOME_DESC = meta(SHELL, 'description');

describe('served HTML for blog, case study and capability pages', () => {
  const SLUG2 = `served-test-${Date.now()}`;
  beforeAll(() => {
    db.prepare(
      `INSERT INTO case_studies (title, slug, summary, content, status, published_at)
       VALUES (?, ?, ?, ?, 'published', datetime('now'))`
    ).run('Dental Ads Case', SLUG2, 'Beating chains on Google Ads.', '# Heading in body\n\nText');
    db.prepare(
      `INSERT INTO blog_posts (title, slug, excerpt, content, meta_title, meta_description, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', datetime('now'))`
    ).run('Post Title', SLUG2, 'Excerpt.', 'Body', 'Meta Title', 'Meta description.');
  });
  afterAll(() => {
    db.prepare('DELETE FROM case_studies WHERE slug = ?').run(SLUG2);
    db.prepare('DELETE FROM blog_posts WHERE slug = ?').run(SLUG2);
  });

  const cases = () => [
    ['/case-studies', 'Case Studies — Hyphening Media | Client Results'],
    [`/case-studies/${SLUG2}`, 'Dental Ads Case — Hyphening Media Case Study', 'Beating chains on Google Ads.'],
    ['/blog', 'Journal &amp; Insights — Hyphening Media | Marketing &amp; Creative Operations'],
    [`/blog/${SLUG2}`, 'Meta Title — Hyphening Media', 'Meta description.'],
    ['/capabilities', 'Nine Pillars of Growth — Hyphening Media Capabilities'],
    ['/capabilities/content-strategy', 'Content Strategy — Hyphening Media Capabilities'],
  ];

  it('each page has its own title and description, not the homepage\'s', () => {
    for (const [pathname, title, description] of cases()) {
      const html = serve(pathname);
      expect(html.match(/<title>([^<]*)<\/title>/)[1], pathname).toBe(title);
      expect(meta(html, 'description'), pathname).not.toBe(HOME_DESC);
      if (description) expect(meta(html, 'description'), pathname).toBe(description);
      expect(html, pathname).not.toContain(`<title>${HOME_TITLE}</title>`);
    }
  });

  it('each page has exactly one <h1>, its own, and no <noscript> copy', () => {
    for (const [pathname] of cases()) {
      const html = serve(pathname);
      expect(html.match(/<h1[\s>]/g)?.length, pathname).toBe(1);
      expect(html, pathname).not.toContain('Creative Ops &amp; Performance Marketing Agency');
      expect(html, pathname).not.toContain('<noscript>\n<main>');
    }
    expect(serve(`/case-studies/${SLUG2}`)).toContain('<h1>Dental Ads Case</h1>');
  });

  it('listing pages stay og:type website', () => {
    expect(meta(serve('/blog'), 'og:type')).toBe('website');
    expect(meta(serve('/capabilities/content-strategy'), 'og:type')).toBe('article');
  });
});
