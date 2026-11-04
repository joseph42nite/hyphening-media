/**
 * Comment inbox: what a sync adds and drops. Runs inside a rolled-back
 * transaction so the local database is left as it was.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { syncPostComments } from '../services/commentSync.js';

let post;
beforeAll(() => {
  db.exec('BEGIN');
  const clientId = db.prepare("INSERT INTO crm_clients (name) VALUES ('Comment test client')").run().lastInsertRowid;
  const id = db.prepare("INSERT INTO marketing_content_tracker (client_id, status) VALUES (?, 'Posted')").run(clientId).lastInsertRowid;
  post = { id, client_id: clientId };
});
afterAll(() => db.exec('ROLLBACK'));

const c = (id, platform = 'instagram') => ({ id, platform, author: 'someone', text: `comment ${id}`, publishedAt: null });
const fetched = (comments, complete) => async () => ({ comments, complete: new Set(complete) });
const stored = () => db.prepare('SELECT comment_id FROM social_comments WHERE content_id = ? ORDER BY comment_id').all(post.id).map(r => r.comment_id);

describe('syncPostComments', () => {
  it('adds new comments once', async () => {
    const fetchFn = fetched([c('t1'), c('t2'), c('y1', 'youtube')], ['instagram', 'youtube']);
    expect(await syncPostComments(post.client_id, post, { fetchFn })).toEqual({ added: 3, removed: 0 });
    expect(await syncPostComments(post.client_id, post, { fetchFn })).toEqual({ added: 0, removed: 0 });
  });

  it("keeps comments when the platform's list may be cut off", async () => {
    await syncPostComments(post.client_id, post, { fetchFn: fetched([c('t1')], []) });
    expect(stored()).toEqual(['t1', 't2', 'y1']);
  });

  it('drops comments deleted on the platform, only for that platform', async () => {
    const r = await syncPostComments(post.client_id, post, { fetchFn: fetched([c('t1')], ['instagram']) });
    expect(r).toEqual({ added: 0, removed: 1 });
    expect(stored()).toEqual(['t1', 'y1']);
  });
});

describe('comments already answered', () => {
  it('leave the inbox with the reply kept, and replies are never inbox items', async () => {
    const fetchFn = async () => ({
      comments: [c('a1'), c('a2')],
      complete: new Set(),
      answered: new Map([['a1', { text: 'Thanks! :D', at: '2026-11-04T07:25:29+0000' }]]),
    });
    await syncPostComments(post.client_id, post, { fetchFn });
    const rows = db.prepare("SELECT comment_id, replied_at, reply_text FROM social_comments WHERE comment_id IN ('a1', 'a2') ORDER BY comment_id").all();
    expect(rows).toEqual([
      { comment_id: 'a1', replied_at: '2026-11-04 07:25:29', reply_text: 'Thanks! :D' },
      { comment_id: 'a2', replied_at: null, reply_text: null },
    ]);
  });
});
