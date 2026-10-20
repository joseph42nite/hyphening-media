import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const emptyForm = {
  title: '', client_name: '', summary: '', content: '', cover_image_url: '',
  gallery_image_urls: '', video_embed_urls: '', status: 'draft'
};

export default function CaseStudiesTab({ showToast }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchPosts(); }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/case-studies/admin/all`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setPosts(data.case_studies || []);
    } catch (err) {
      console.error('Failed to fetch case studies:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (post) => {
    setEditing(post);
    const toLines = (json) => {
      try {
        const parsed = JSON.parse(json || '[]');
        return Array.isArray(parsed) ? parsed.join('\n') : '';
      } catch (e) { return ''; }
    };
    setFormData({
      title: post.title || '',
      client_name: post.client_name || '',
      summary: post.summary || '',
      content: post.content || '',
      cover_image_url: post.cover_image_url || '',
      gallery_image_urls: toLines(post.gallery_image_urls),
      video_embed_urls: toLines(post.video_embed_urls),
      status: post.status || 'draft'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      showToast('Title and story/content are required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const toArray = (s) => s ? s.split('\n').map(x => x.trim()).filter(Boolean) : [];
      const body = {
        ...formData,
        gallery_image_urls: toArray(formData.gallery_image_urls),
        video_embed_urls: toArray(formData.video_embed_urls)
      };
      const url = editing
        ? `${API_BASE}/api/case-studies/${editing.id}`
        : `${API_BASE}/api/case-studies`;
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      showToast(editing ? 'Case study updated!' : 'Case study created!', 'success');
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
      const res = await fetch(`${API_BASE}/api/case-studies/${post.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Case study deleted', 'success');
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
        <h2 style={{ fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: 900 }}>Case Studies</h2>
        <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New Case Study
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading case studies...</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '2px solid var(--border-color)', borderRadius: '12px' }}>
          <p style={{ fontWeight: 700, fontSize: '1rem' }}>No case studies yet</p>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Create your first client case study.</p>
        </div>
      ) : (
        <>
          <div className="table-container table-scrollable-y blog-desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Client</th>
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>/case-studies/{post.slug}</div>
                      )}
                    </td>
                    <td>{post.client_name || '—'}</td>
                    <td>
                      <span className={`badge ${post.status === 'published' ? 'badge-success' : 'badge-warning'}`}>
                        {post.status === 'published' ? <><Eye size={10} /> Published</> : <><EyeOff size={10} /> Draft</>}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{formatDate(post.published_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {post.status === 'published' && (
                          <a href={`/case-studies/${post.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="View live">
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

          <div className="blog-mobile-list">
            {posts.map(post => (
              <div key={post.id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 800, wordBreak: 'break-word' }}>{post.title}</h4>
                    {post.slug && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>/case-studies/{post.slug}</div>
                    )}
                  </div>
                  <span className={`badge ${post.status === 'published' ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {post.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{post.client_name || '—'}</span>
                  <span>{formatDate(post.published_at)}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {post.status === 'published' && (
                    <a href={`/case-studies/${post.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="View live" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                      <ExternalLink size={12} style={{ marginRight: '4px' }} /> View
                    </a>
                  )}
                  <button className="btn btn-sm" onClick={() => openEdit(post)} title="Edit" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                    <Edit2 size={12} style={{ marginRight: '4px' }} /> Edit
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(post)} title="Delete" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                    <Trash2 size={12} style={{ marginRight: '4px' }} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>{editing ? 'Edit Case Study' : 'New Case Study'}</h2>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-grid-2 blog-form-header-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Title *</label>
                  <input className="form-control" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required placeholder="e.g. How Brand X 3x'd Revenue in 90 Days" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Status</label>
                  <select className="form-control" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Client Name</label>
                <input className="form-control" value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} placeholder="e.g. Acme Skincare" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Summary (one-line result, shown on the card)</label>
                <input className="form-control" value={formData.summary} onChange={e => setFormData({ ...formData, summary: e.target.value })} placeholder="e.g. 0 to 250K followers, 3x revenue in 6 months" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Story / Body *</label>
                <textarea className="form-control" rows={12} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} required placeholder="Write the case study — what was improved, how, and the results. Markdown supported." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cover Image URL</label>
                <input className="form-control" value={formData.cover_image_url} onChange={e => setFormData({ ...formData, cover_image_url: e.target.value })} placeholder="https://images.unsplash.com/..." />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Additional Image URLs (one per line)</label>
                <textarea className="form-control" rows={3} value={formData.gallery_image_urls} onChange={e => setFormData({ ...formData, gallery_image_urls: e.target.value })} placeholder={"https://images.unsplash.com/photo-1\nhttps://images.unsplash.com/photo-2"} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Video Embed URLs (YouTube / Vimeo / Loom, one per line)</label>
                <textarea className="form-control" rows={3} value={formData.video_embed_urls} onChange={e => setFormData({ ...formData, video_embed_urls: e.target.value })} placeholder={"https://www.youtube.com/watch?v=...\nhttps://vimeo.com/..."} />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : (editing ? 'Update Case Study' : 'Create Case Study')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
