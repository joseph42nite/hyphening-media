/** Parsing Instagram and YouTube comment lists, with Composio faked. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/composioService.js', () => ({
  executeClientAction: async (clientId, action) => {
    if (action === 'INSTAGRAM_GET_IG_MEDIA_COMMENTS') return { data: { data: [
      // Shape returned for DentAlchemy's post on 4 Nov 2026: the account's own
      // reply is listed with the comments, carrying parent_id.
      { id: 'r1', parent_id: 'c1', text: 'Thanks! :D', timestamp: '2026-11-04T07:25:29+0000', username: 'dentalchemy',
        from: { id: '1', self_ig_scoped_id: '2', username: 'dentalchemy' } },
      { id: 'r2', parent_id: 'c2', text: 'Same!', timestamp: '2026-11-04T08:00:00+0000', from: { id: '9', username: 'a.friend' } },
      { id: 'c1', text: 'Looks iconic🙌', timestamp: '2026-10-18T19:24:56+0000', from: { id: '3', username: 'vidhya_bhushan26' } },
      { id: 'c2', text: 'Super 👌 team', timestamp: '2026-10-15T14:54:08+0000', from: { id: '4', username: 'sujan.shetty.77' } },
    ] } };
    if (action === 'YOUTUBE_LIST_COMMENT_THREADS') return { data: { items: [
      { id: 't1', snippet: { channelId: 'CH', topLevelComment: { id: 'y1', snippet: { textOriginal: 'Nice', authorDisplayName: 'viewer' } } },
        replies: { comments: [{ snippet: { authorChannelId: { value: 'CH' }, textOriginal: 'Thank you!', publishedAt: '2026-11-01T10:00:00Z' } }] } },
      { id: 't2', snippet: { channelId: 'CH', topLevelComment: { id: 'y2', snippet: { textOriginal: 'Where?', authorDisplayName: 'viewer2' } } },
        replies: { comments: [{ snippet: { authorChannelId: { value: 'OTHER' }, textOriginal: 'Bangalore', publishedAt: '2026-11-01T11:00:00Z' } }] } },
    ] } };
    throw new Error(`unexpected ${action}`);
  },
}));

const { fetchPostCommentsWithStatus } = await import('../services/commentSync.js');

describe('fetchPostCommentsWithStatus', () => {
  it("keeps replies out of the inbox and marks only the account's own as answered", async () => {
    const r = await fetchPostCommentsWithStatus(3, { platform: 'instagram', instagram_media_id: '17908108194568324' });
    expect(r.comments.map(c => c.id)).toEqual(['c1', 'c2']);
    expect([...r.answered]).toEqual([['c1', { text: 'Thanks! :D', at: '2026-11-04T07:25:29+0000' }]]);
    expect(r.complete.has('instagram')).toBe(true);
  });

  it("counts a YouTube thread answered only when the channel replied", async () => {
    const r = await fetchPostCommentsWithStatus(1, { platform: 'youtube', youtube_video_id: 'abcdefghijk' });
    expect(r.comments.map(c => c.id)).toEqual(['y1', 'y2']);
    expect([...r.answered.keys()]).toEqual(['y1']);
  });
});
