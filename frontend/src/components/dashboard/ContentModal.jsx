import React from 'react';

export default function ContentModal({
  showContentModal,
  setShowContentModal,
  editingContent,
  contentFormData,
  setContentFormData,
  handleContentSubmit,
  clients,
  staffUsers,
  marketingScripts
}) {
  if (!showContentModal) return null;

  const [scriptFilterDate, setScriptFilterDate] = React.useState((contentFormData.date || '').slice(0, 7));

  React.useEffect(() => {
    if (contentFormData.date) {
      setScriptFilterDate(contentFormData.date.slice(0, 7));
    }
  }, [contentFormData.date]);

  return (
    <div className="modal-overlay" onClick={() => setShowContentModal(false)}>
      <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{editingContent ? 'Edit Content Row' : 'Add Content Row'}</h2>
        {editingContent?.client_comments && (
          <div style={{
            background: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#991b1b',
            fontSize: '0.85rem',
            fontWeight: '600',
            marginBottom: '16px'
          }}>
            <strong>⚠️ CLIENT REVISION COMMENT:</strong>
            <p style={{ margin: '4px 0 0', fontStyle: 'italic', color: '#7f1d1d' }}>
              "{editingContent.client_comments}"
            </p>
          </div>
        )}
        <form onSubmit={handleContentSubmit} style={{ marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Platform</label>
              <select
                className="form-control"
                value={contentFormData.platform}
                onChange={e => setContentFormData({ ...contentFormData, platform: e.target.value })}
                required
              >
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-control"
                value={contentFormData.date}
                onChange={e => setContentFormData({ ...contentFormData, date: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Post Type</label>
              <select
                className="form-control"
                value={contentFormData.post_type}
                onChange={e => {
                  const newType = e.target.value;
                  let updatedAssignedTo = contentFormData.assigned_to;
                  if (['Reel', 'Youtube', 'Short'].includes(newType)) {
                    const videoEditor = staffUsers.find(u => u.role === 'ops_video_editor');
                    if (videoEditor) {
                      updatedAssignedTo = String(videoEditor.id);
                    }
                  }
                  setContentFormData({ ...contentFormData, post_type: newType, assigned_to: updatedAssignedTo });
                }}
              >
                <option value="Reel">Reel</option>
                <option value="Story">Story</option>
                <option value="Static">Static</option>
                <option value="Carousel">Carousel</option>
                <option value="Youtube">YouTube Video</option>
                <option value="Short">YouTube Short</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={contentFormData.status}
                onChange={e => setContentFormData({ ...contentFormData, status: e.target.value })}
              >
                <option value="Draft">Draft</option>
                <option value="Pending">Pending</option>
                <option value="Posted">Posted</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Title (Optional)</label>
            <input
              type="text"
              className="form-control"
              value={contentFormData.title}
              onChange={e => setContentFormData({ ...contentFormData, title: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Instagram Link (Cross-Post)</label>
              <input
                type="url"
                className="form-control"
                value={contentFormData.instagram_link || ''}
                onChange={e => setContentFormData({ ...contentFormData, instagram_link: e.target.value })}
                placeholder="https://instagram.com/p/..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">YouTube Link (Cross-Post)</label>
              <input
                type="url"
                className="form-control"
                value={contentFormData.youtube_link || ''}
                onChange={e => setContentFormData({ ...contentFormData, youtube_link: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Facebook Link (Cross-Post)</label>
              <input
                type="url"
                className="form-control"
                value={contentFormData.facebook_link || ''}
                onChange={e => setContentFormData({ ...contentFormData, facebook_link: e.target.value })}
                placeholder="https://facebook.com/..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">LinkedIn Link (Cross-Post)</label>
              <input
                type="url"
                className="form-control"
                value={contentFormData.linkedin_link || ''}
                onChange={e => setContentFormData({ ...contentFormData, linkedin_link: e.target.value })}
                placeholder="https://linkedin.com/..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Script/Blog Month (Filter)</label>
              <input
                type="month"
                className="form-control"
                value={scriptFilterDate}
                onChange={e => setScriptFilterDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Linked Script</label>
              <select
                className="form-control"
                value={contentFormData.script_id || ''}
                onChange={e => setContentFormData({ ...contentFormData, script_id: e.target.value })}
              >
                <option value="">-- None --</option>
                {(() => {
                  const selectedMonth = scriptFilterDate ? scriptFilterDate.slice(0, 7) : '';
                  const filteredScripts = selectedMonth
                    ? marketingScripts.filter(s => s.month === selectedMonth)
                    : marketingScripts;

                  return filteredScripts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.month})
                    </option>
                  ));
                })()}
              </select>
              {marketingScripts.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  No scripts found. Create one in the Script Tracker tab.
                </span>
              ) : (
                (() => {
                  const selectedMonth = scriptFilterDate ? scriptFilterDate.slice(0, 7) : '';
                  const filtered = selectedMonth ? marketingScripts.filter(s => s.month === selectedMonth) : marketingScripts;
                  if (filtered.length === 0 && selectedMonth) {
                    return (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-warning)' }}>
                        No scripts found for {selectedMonth}. Create one in the Script Tracker tab.
                      </span>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Caption</label>
            <textarea
              className="form-control"
              rows={2}
              value={contentFormData.caption}
              onChange={e => setContentFormData({ ...contentFormData, caption: e.target.value })}
            />
          </div>


          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Time</label>
              <input
                type="text"
                className="form-control"
                value={contentFormData.time}
                onChange={e => setContentFormData({ ...contentFormData, time: e.target.value })}
                placeholder="e.g. 18:00"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Assignee (Staff)</label>
              <select
                className="form-control"
                value={contentFormData.assigned_to || ''}
                onChange={e => setContentFormData({ ...contentFormData, assigned_to: e.target.value })}
              >
                <option value="">Select Staff</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.replace('ops_', '').replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Facebook Post ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="fb_..."
                value={contentFormData.facebook_post_id}
                onChange={e => setContentFormData({ ...contentFormData, facebook_post_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Instagram Media ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="ig_..."
                value={contentFormData.instagram_media_id}
                onChange={e => setContentFormData({ ...contentFormData, instagram_media_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">YouTube Video ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="yt_..."
                value={contentFormData.youtube_video_id}
                onChange={e => setContentFormData({ ...contentFormData, youtube_video_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">LinkedIn Post ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="urn:li:share:..."
                value={contentFormData.linkedin_post_id || ''}
                onChange={e => setContentFormData({ ...contentFormData, linkedin_post_id: e.target.value })}
              />
            </div>
          </div>

          {contentFormData.platform === 'instagram' ? (
            <div>
              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Instagram Metrics</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Views</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.views}
                    onChange={e => setContentFormData({ ...contentFormData, views: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Likes</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.likes}
                    onChange={e => setContentFormData({ ...contentFormData, likes: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Comments</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.comments}
                    onChange={e => setContentFormData({ ...contentFormData, comments: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Shares</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.shares}
                    onChange={e => setContentFormData({ ...contentFormData, shares: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Saves</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.saves}
                    onChange={e => setContentFormData({ ...contentFormData, saves: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Follows (from post)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.follows}
                    onChange={e => setContentFormData({ ...contentFormData, follows: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Avg Watch Time %</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={contentFormData.avg_watch_time_pct}
                    onChange={e => setContentFormData({ ...contentFormData, avg_watch_time_pct: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Boosted? (Yes/No + spend)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Yes - ₹500"
                    value={contentFormData.boosted}
                    onChange={e => setContentFormData({ ...contentFormData, boosted: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>YouTube Metrics</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">YouTube Views</label>
                  <input
                    type="number"
                    className="form-control"
                    value={contentFormData.youtube_views}
                    onChange={e => setContentFormData({ ...contentFormData, youtube_views: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Watch Time (hrs)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control"
                    value={contentFormData.youtube_watch_time}
                    onChange={e => setContentFormData({ ...contentFormData, youtube_watch_time: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Avg View Duration</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 02:15"
                    value={contentFormData.youtube_avg_view_duration}
                    onChange={e => setContentFormData({ ...contentFormData, youtube_avg_view_duration: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">CTR%</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={contentFormData.youtube_ctr}
                    onChange={e => setContentFormData({ ...contentFormData, youtube_ctr: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowContentModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Row
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
