/**
 * Every synced figure lands as the platform reports it, in its own column:
 * Instagram reel watch time in seconds and Instagram's reels_skip_rate;
 * carousel follows and profile visits; YouTube likes/comments apart from
 * Instagram's; YouTube Analytics watch time and view duration.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-metrics-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.COMPOSIO_API_KEY = 'test';

let skipRateMode = 'ok'; // 'ok' | 'throw' | 'error-object'
const calls = [];

// Values returned for F16's reel of 9 Nov 2026 and a client 3 carousel.
const IG = {
  views: 2422, reach: 2124, likes: 40, comments: 3, saved: 12, shares: 9, total_interactions: 64,
  ig_reels_avg_watch_time: 28643, ig_reels_video_view_total_time: 62184923, reels_skip_rate: 35,
  follows: 2, profile_visits: 4,
};

vi.mock('../services/composioService.js', () => ({
  executeClientAction: async (clientId, action, params) => {
    calls.push({ action, params });
    if (action === 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS') {
      if (params.metric.includes('reels_skip_rate') && skipRateMode === 'throw') throw new Error('(#100) metric not supported');
      if (params.metric.includes('reels_skip_rate') && skipRateMode === 'error-object') {
        return { successful: false, error: 'API Error: metric not supported', data: { message: 'API Error', status_code: 400 } };
      }
      return { successful: true, data: { data: params.metric.map(name => ({ name, values: [{ value: IG[name] ?? 0 }] })) } };
    }
    if (action === 'YOUTUBE_GET_VIDEO_DETAILS_BATCH') {
      return { data: { items: params.id.map(id => ({ id, snippet: { publishedAt: '2026-11-03T10:00:00Z', title: 'Video' },
        contentDetails: { duration: 'PT1M51S' }, statistics: { viewCount: '15', likeCount: '2', commentCount: '1' } })) } };
    }
    if (action === 'YOUTUBE_QUERY_ANALYTICS') {
      // As YouTube does: one invalid ID in the filter fails the whole query.
      if (/mock_post_/.test(params.filters)) {
        return { successful: false, error: 'Invalid value (mock_post_1) given in field parameters.filters.', data: {} };
      }
      return { successful: true, data: {
        columnHeaders: ['video', 'creatorContentType', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'shares', 'subscribersGained'].map(name => ({ name })),
        rows: [['R0LNz1tNCwE', 'shorts', 15, 8, 64, 57.85, 1, 0], ['LongVideo01', 'videoOnDemand', 40, 30, 200, 40, 0, 1]],
      } };
    }
    throw new Error(`unexpected ${action}`);
  },
  getClientConnectedAccounts: async () => [],
}));

let db, syncSingleContentMetrics;

beforeAll(async () => {
  db = (await import('../../database.js')).default;
  ({ syncSingleContentMetrics } = await import('../services/metricSyncWorker.js'));
  globalThis.__clientId = db.prepare("INSERT INTO crm_clients (name) VALUES ('F16 test')").run().lastInsertRowid;
});

function addPost(extra = {}) {
  const row = { client_id: globalThis.__clientId, platform: 'instagram', post_type: 'Reel', date: new Date().toISOString().slice(0, 10),
    status: 'Posted', instagram_media_id: '18386095960233664', ...extra };
  const cols = Object.keys(row);
  return db.prepare(`INSERT INTO marketing_content_tracker (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...Object.values(row)).lastInsertRowid;
}

const read = id => db.prepare('SELECT * FROM marketing_content_tracker WHERE id = ?').get(id);

describe('Instagram reels', () => {
  it("stores Instagram's seconds and skip rate, not a percentage or 100 minus it", async () => {
    const id = addPost();
    await syncSingleContentMetrics(id);
    const r = read(id);
    expect(r.avg_watch_time_sec).toBe(28.64);
    expect(r.skip_rate_pct).toBe(35);
    expect(r.avg_watch_time_pct).toBeNull();
    expect(r.ig_reach).toBe(2124);
    expect(r.ig_total_interactions).toBe(64);
  });

  it('keeps a typed-in watch % untouched', async () => {
    const id = addPost({ avg_watch_time_pct: 62 });
    await syncSingleContentMetrics(id);
    expect(read(id).avg_watch_time_pct).toBe(62);
  });

  for (const mode of ['throw', 'error-object']) {
    it(`still takes everything else when Instagram refuses reels_skip_rate (${mode})`, async () => {
      skipRateMode = mode;
      const id = addPost();
      await syncSingleContentMetrics(id);
      skipRateMode = 'ok';
      const r = read(id);
      expect(r.avg_watch_time_sec).toBe(28.64);
      expect(r.views).toBe(2422);
      expect(r.skip_rate_pct).toBeNull();
    });
  }

  it('does not ask for follows on a reel (Instagram refuses it)', async () => {
    calls.length = 0;
    await syncSingleContentMetrics(addPost());
    const asked = calls.find(c => c.action === 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS').params.metric;
    expect(asked).not.toContain('follows');
    expect(asked).not.toContain('impressions');
  });
});

describe('Instagram carousels', () => {
  it('refreshes likes and comments and stores follows and profile visits', async () => {
    calls.length = 0;
    const id = addPost({ post_type: 'Carousel', instagram_media_id: '17873730681649656', likes: 1, comments: 0 });
    await syncSingleContentMetrics(id);
    const asked = calls.find(c => c.action === 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS').params.metric;
    expect(asked).toEqual(expect.arrayContaining(['likes', 'comments', 'views', 'follows', 'profile_visits']));
    expect(asked).not.toContain('impressions');
    const r = read(id);
    expect(r.likes).toBe(40);
    expect(r.comments).toBe(3);
    expect(r.follows).toBe(2);
    expect(r.ig_profile_visits).toBe(4);
    expect(r.skip_rate_pct).toBeNull();
  });
});

describe('YouTube', () => {
  it("keeps YouTube's likes apart from Instagram's on a cross-posted reel", async () => {
    const id = addPost({ youtube_video_id: 'R0LNz1tNCwE', youtube_link: 'https://youtube.com/shorts/R0LNz1tNCwE' });
    await syncSingleContentMetrics(id);
    const r = read(id);
    expect(r.likes).toBe(40);
    expect(r.youtube_likes).toBe(2);
    expect(r.youtube_comments).toBe(1);
    expect(r.youtube_views).toBe(15);
  });

  it('fills watch time and view duration from YouTube Analytics', async () => {
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'R0LNz1tNCwE' });
    await syncSingleContentMetrics(id);
    const r = read(id);
    expect(r.youtube_watch_time).toBe(0.13);
    expect(r.youtube_avg_view_duration).toBe('1:04');
    expect(r.youtube_avg_view_pct).toBe(57.85);
    expect(r.youtube_shares).toBe(1);
    expect(r.youtube_subscribers_gained).toBe(0);
  });

  it('leaves Analytics columns alone for a video YouTube has no data for yet', async () => {
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'yVIOYucUNSU' });
    await syncSingleContentMetrics(id);
    const r = read(id);
    expect(r.youtube_avg_view_duration).toBeNull();
    expect(r.youtube_analytics_synced_at).toBeNull();
    expect(r.youtube_views).toBe(15);
  });
});

describe('YouTube Short / Long label', () => {
  it("uses YouTube's own content type, so a 1:51 Short is a Short", async () => {
    // The mocked video is 1:51 long; a 60-second cut-off called it Long.
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'R0LNz1tNCwE', youtube_format: 'Long' });
    await syncSingleContentMetrics(id);
    expect(read(id).youtube_duration_seconds).toBe(111);
    expect(read(id).youtube_format).toBe('Short');
  });

  it('labels a regular upload Long', async () => {
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'LongVideo01' });
    await syncSingleContentMetrics(id);
    expect(read(id).youtube_format).toBe('Long');
  });

  it('falls back to a /shorts/ link while Analytics has no data', async () => {
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'yVIOYucUNSU',
      youtube_link: 'https://youtube.com/shorts/yVIOYucUNSU?si=x', youtube_format: 'Long' });
    await syncSingleContentMetrics(id);
    expect(read(id).youtube_format).toBe('Short');
  });

  it('a test row with a fake video ID does not break the batch for real videos', async () => {
    const { runMetricSyncWorker } = await import('../services/metricSyncWorker.js');
    const clientId = db.prepare("INSERT INTO crm_clients (name) VALUES ('Batch test')").run().lastInsertRowid;
    const base = { client_id: clientId, platform: 'youtube', post_type: 'Youtube', status: 'Posted', date: new Date().toISOString().slice(0, 10) };
    const ins = row => db.prepare(`INSERT INTO marketing_content_tracker (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row)).lastInsertRowid;
    ins({ ...base, youtube_video_id: 'mock_post_1783231620498' });
    const real = ins({ ...base, youtube_video_id: 'R0LNz1tNCwE' });
    await runMetricSyncWorker({ clientId });
    expect(read(real).youtube_format).toBe('Short');
    expect(read(real).youtube_analytics_synced_at).not.toBeNull();
  });

  it('leaves it blank when neither YouTube nor the link says', async () => {
    const id = addPost({ platform: 'youtube', post_type: 'Youtube', instagram_media_id: null, youtube_video_id: 'yVIOYucUNSU',
      youtube_link: 'https://www.youtube.com/watch?v=yVIOYucUNSU', youtube_format: 'Long' });
    await syncSingleContentMetrics(id);
    expect(read(id).youtube_format).toBeNull();
  });
});
