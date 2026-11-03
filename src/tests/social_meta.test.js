import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import db from '../../database.js';
import { injectSocialMeta } from '../services/prerender.js';

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

  it('leaves unknown slugs and other pages on the default card', () => {
    expect(injectSocialMeta(SHELL, '/case-studies/no-such-slug', 'x')).toBe(SHELL);
    expect(injectSocialMeta(SHELL, '/blog', 'x')).toBe(SHELL);
  });
});
