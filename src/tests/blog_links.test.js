import { describe, it, expect } from 'vitest';
import { linkedSlugs } from '../routes/blog.js';

describe('linkedSlugs', () => {
  it('reads plain slugs from the admin editor', () => {
    expect(linkedSlugs(['social-media-guide', ' content-strategy-101 '])).toEqual(['social-media-guide', 'content-strategy-101']);
  });

  it("reads the night pipeline's {url, anchor} links and keeps only blog posts", () => {
    expect(linkedSlugs([
      { url: '/blog/creator-briefs', anchor: 'creator briefs' },
      { url: 'https://hypheningmedia.com/blog/d2c-attribution?x=1', anchor: 'attribution' },
      { url: '/services/seo', anchor: 'our SEO service' },
      { url: '/blog/creator-briefs', anchor: 'again' },
      {},
      null,
    ])).toEqual(['creator-briefs', 'd2c-attribution']);
  });

  it('ignores anything that is not a list', () => {
    expect(linkedSlugs({ url: '/blog/x' })).toEqual([]);
  });
});
