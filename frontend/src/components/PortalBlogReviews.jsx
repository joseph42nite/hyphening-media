import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, MessageSquare } from 'lucide-react';
import { API_BASE } from '../api.js';

/**
 * "Posts to review" in the client portal, for clients whose blog pipeline
 * needs their (or their clinician's) OK before Hyphening publishes. Approving
 * sends the post on to Hyphening's final approval; it never publishes by
 * itself. Renders nothing when there's nothing to review.
 */
export default function PortalBlogReviews({ token, showToast }) {
  const [posts, setPosts] = useState([]);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    fetch(`${API_BASE}/api/portal/${token}/blog-reviews`, { credentials: 'include', cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { posts: [] }))
      .then(d => setPosts(d.posts || []))
      .catch(() => setPosts([]));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const send = async (post, action) => {
    const note = action === 'changes'
      ? window.prompt('What should we change?')
      : window.prompt('Any note for us? (optional)') ?? undefined;
    if (action === 'changes' && !note) return;
    if (note === undefined && action === 'approve') return;
    setBusy(post.id);
    try {
      const res = await fetch(`${API_BASE}/api/portal/${token}/blog-reviews/${post.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      showToast(action === 'approve' ? 'Approved, thank you' : 'Sent back with your note', 'success');
      setOpen(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (posts.length === 0) return null;

  return (
    <div className="portal-bento-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h2 style={{ fontSize: '1.05rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', color: '#dfe7e0' }}>
          Blog posts to review ({posts.length})
        </h2>
        <p style={{ color: '#8b9b90', fontSize: '0.85rem', margin: '4px 0 0' }}>
          Read each post and approve it, or tell us what to change. Nothing goes live until it's approved.
        </p>
      </div>
      {posts.map(post => (
        <div key={post.id} style={{ borderTop: '1px solid rgba(223, 231, 224, 0.1)', paddingTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setOpen(open === post.id ? null : post.id)} style={{ background: 'none', border: 'none', color: '#dfe7e0', fontWeight: 600, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
              {post.title}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="portal-btn" disabled={busy === post.id} onClick={() => send(post, 'changes')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                <MessageSquare size={14} /> Request changes
              </button>
              <button className="portal-btn portal-btn-primary" disabled={busy === post.id} onClick={() => send(post, 'approve')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                <CheckCircle size={14} /> Approve
              </button>
            </div>
          </div>
          {post.excerpt && <p style={{ color: '#8b9b90', fontSize: '0.85rem', margin: '6px 0 0' }}>{post.excerpt}</p>}
          {open === post.id && (
            <div style={{ marginTop: '12px', color: '#dfe7e0', fontSize: '0.92rem', lineHeight: 1.6 }}>
              {post.cover_image_url && /^https:\/\//.test(post.cover_image_url) && (
                <img src={post.cover_image_url} alt={post.cover_alt || ''} style={{ width: '100%', borderRadius: '8px', marginBottom: '12px' }} />
              )}
              <div dangerouslySetInnerHTML={{ __html: post.html }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
