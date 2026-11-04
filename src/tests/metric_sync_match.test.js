import { describe, it, expect } from 'vitest';
import { findMatchingMedia } from '../services/metricSyncWorker.js';

const media = [
  { id: '1', shortcode: 'AAA111', permalink: 'https://www.instagram.com/p/AAA111/', media_type: 'IMAGE', timestamp: '2026-10-03T10:00:00+0000' },
  { id: '2', shortcode: 'DeL0snRmqg2', permalink: 'https://www.instagram.com/p/DeL0snRmqg2/', media_type: 'CAROUSEL_ALBUM', timestamp: '2026-10-06T10:00:00+0000' },
];

describe('findMatchingMedia', () => {
  it('finds the post from the IG field when the main link is empty', () => {
    const row = {
      date: '2026-10-03', post_type: 'Carousel', link: null,
      instagram_link: 'https://www.instagram.com/p/DeL0snRmqg2/?stkn=MWhwOWo0Z2dweXJyNA==',
    };
    expect(findMatchingMedia(row, media)?.id).toBe('2');
  });

  it('still uses the main link first', () => {
    const row = { date: '2026-10-03', link: 'https://www.instagram.com/p/AAA111/', instagram_link: 'https://www.instagram.com/p/DeL0snRmqg2/' };
    expect(findMatchingMedia(row, media)?.id).toBe('1');
  });
});
