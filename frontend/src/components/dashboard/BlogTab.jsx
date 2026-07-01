import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CATEGORIES = ['General', 'Social Media', 'Branding', 'Growth', 'Tech', 'Content Strategy', 'SEO', 'Case Study'];

const emptyForm = {
  title: '', excerpt: '', content: '', cover_image_url: '', author: 'Hyphening Media',
  category: 'General', tags: '', meta_title: '', meta_description: '', meta_keywords: '',
  internal_links: '', status: 'draft'
};

export default function BlogTab({ showToast }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => { fetchPosts(); }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/blog/admin/all`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } catch (err) {
      console.error('Failed to fetch blog posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...emptyForm });
    setShowModal(true);
    setPreviewMode(false);
  };

  const openEdit = (post) => {
    setEditing(post);
    let internalLinksStr = '';
    try {
      const parsed = JSON.parse(post.internal_links || '[]');
      internalLinksStr = Array.isArray(parsed) ? parsed.join(', ') : '';
    } catch (e) { internalLinksStr = ''; }

    setFormData({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      cover_image_url: post.cover_image_url || '',
      author: post.author || 'Hyphening Media',
      category: post.category || 'General',
      tags: post.tags || '',
      meta_title: post.meta_title || '',
      meta_description: post.meta_description || '',
      meta_keywords: post.meta_keywords || '',
      internal_links: internalLinksStr,
      status: post.status || 'draft'
    });
    setShowModal(true);
    setPreviewMode(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      showToast('Title and content are required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const internalLinksArray = formData.internal_links
        ? formData.internal_links.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const body = { ...formData, internal_links: internalLinksArray };
      const url = editing
        ? `${API_BASE}/api/blog/${editing.id}`
        : `${API_BASE}/api/blog`;
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      showToast(editing ? 'Blog post updated!' : 'Blog post created!', 'success');
      setShowModal(false);
      fetchPosts();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/blog/${post.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Post deleted', 'success');
      fetchPosts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 900 }}>Blog Posts</h2>
        <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New Post
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading posts...</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '2px solid var(--border-color)', borderRadius: '12px' }}>
          <p style={{ fontWeight: 700, fontSize: '1rem' }}>No blog posts yet</p>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Create your first post or let OpenClaw generate one automatically.</p>
        </div>
      ) : (
        <div className="table-container table-scrollable-y">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td style={{ fontWeight: 700, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {post.title}
                    {post.slug && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>/blog/{post.slug}</div>
                    )}
                  </td>
                  <td><span className="badge badge-info">{post.category}</span></td>
                  <td>
                    <span className={`badge ${post.status === 'published' ? 'badge-success' : 'badge-warning'}`}>
                      {post.status === 'published' ? <><Eye size={10} /> Published</> : <><EyeOff size={10} /> Draft</>}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{formatDate(post.published_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {post.status === 'published' && (
                        <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="View live">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button className="btn btn-sm" onClick={() => openEdit(post)} title="Edit">
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(post)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>{editing ? 'Edit Post' : 'New Blog Post'}</h2>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1: Title + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Title *</label>
                  <input className="form-control" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required placeholder="e.g. 10 Proven Instagram Reel Strategies" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Status</label>
                  <select className="form-control" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Category + Author */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Category</label>
                  <select className="form-control" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Author</label>
                  <input className="form-control" value={formData.author} onChange={e => setFormData({ ...formData, author: e.target.value })} />
                </div>
              </div>

              {/* Excerpt */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Excerpt / Summary</label>
                <textarea className="form-control" rows={2} value={formData.excerpt} onChange={e => setFormData({ ...formData, excerpt: e.target.value })} placeholder="Short summary for listing cards and meta descriptions" />
              </div>

              {/* Content */}
              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Content (Markdown) *</label>
                  <button type="button" className="btn btn-sm" onClick={() => setPreviewMode(!previewMode)} style={{ fontSize: '0.7rem' }}>
                    {previewMode ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {previewMode ? (
                  <div
                    className="blog-article-body"
                    style={{ border: '2px solid var(--border-color)', borderRadius: '8px', padding: '16px', minHeight: '200px', background: '#fafafa' }}
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(formData.content) }}
                  />
                ) : (
                  <textarea className="form-control" rows={12} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} required placeholder="Write your article in Markdown..." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                )}
              </div>

              {/* Cover Image + Tags */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Cover Image URL</label>
                  <input className="form-control" value={formData.cover_image_url} onChange={e => setFormData({ ...formData, cover_image_url: e.target.value })} placeholder="https://images.unsplash.com/..." />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-control" value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="instagram, reels, growth" />
                </div>
              </div>

              {/* SEO Fields */}
              <details style={{ border: '2px solid var(--border-color)', borderRadius: '8px', padding: '12px 16px' }}>
                <summary style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', cursor: 'pointer' }}>SEO Settings</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Meta Title</label>
                    <input className="form-control" value={formData.meta_title} onChange={e => setFormData({ ...formData, meta_title: e.target.value })} placeholder="Custom SEO title (defaults to post title)" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Meta Description</label>
                    <textarea className="form-control" rows={2} value={formData.meta_description} onChange={e => setFormData({ ...formData, meta_description: e.target.value })} placeholder="Custom meta description (defaults to excerpt)" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Meta Keywords</label>
                    <input className="form-control" value={formData.meta_keywords} onChange={e => setFormData({ ...formData, meta_keywords: e.target.value })} placeholder="instagram reels, d2c brands, social media" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Internal Links (slugs, comma-separated)</label>
                    <input className="form-control" value={formData.internal_links} onChange={e => setFormData({ ...formData, internal_links: e.target.value })} placeholder="social-media-guide, content-strategy-101" />
                  </div>
                </div>
              </details>

              {/* Submit */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : (editing ? 'Update Post' : 'Create Post')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simple markdown preview for the admin editor.
 */
function simpleMarkdown(md) {
  if (!md) return '<p style="color:#999">Nothing to preview yet.</p>';
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');
}
