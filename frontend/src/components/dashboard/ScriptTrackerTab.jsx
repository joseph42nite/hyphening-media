import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function ScriptTrackerTab({
  auth,
  clients,
  marketingScripts,
  fetchMarketingData,
  showToast,
  selectedScriptClient,
  setSelectedScriptClient,
  scriptMonth,
  setScriptMonth,
  fetchTabCounts
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSMM = auth?.role === 'ops_social_media_manager';

  // Modal local states
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [scriptFormData, setScriptFormData] = useState({
    title: '', script_text: '', month: new Date().toISOString().substring(0, 7), reference_video_link: '', reaction_video_link: '', format: 'reel', status: 'Pending Client Approval', client_comments: ''
  });

  const handleSaveScript = async (e) => {
    e.preventDefault();
    if (!selectedScriptClient) return;

    const url = editingScript
      ? `/api/clients/${selectedScriptClient.id}/marketing/scripts/${editingScript.id}`
      : `/api/clients/${selectedScriptClient.id}/marketing/scripts`;
    const method = editingScript ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptFormData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save script');

      showToast(editingScript ? 'Script updated successfully' : 'Script created successfully', 'success');
      setShowScriptModal(false);
      setEditingScript(null);
      setScriptFormData({ 
        title: '', 
        script_text: '', 
        month: scriptMonth, 
        reference_video_link: '', 
        reaction_video_link: '', 
        format: 'reel',
        status: 'Pending Client Approval',
        client_comments: ''
      });
      fetchMarketingData(selectedScriptClient.id);
      if (fetchTabCounts) fetchTabCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteScript = async (scriptId) => {
    if (!selectedScriptClient) return;
    if (!window.confirm('Are you sure you want to delete this script?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete script');

      showToast('Script deleted successfully', 'success');
      fetchMarketingData(selectedScriptClient.id);
      if (fetchTabCounts) fetchTabCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleStatusChange = async (scriptId, newStatus) => {
    if (!selectedScriptClient) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');

      showToast('Script status updated successfully', 'success');
      fetchMarketingData(selectedScriptClient.id);
      if (fetchTabCounts) fetchTabCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleMarkScriptSeen = async (scriptId = null) => {
    if (!selectedScriptClient) return;
    try {
      await fetch(`${API_BASE}/api/clients/${selectedScriptClient.id}/marketing/scripts/mark-seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId }),
        credentials: 'include'
      });
      fetchMarketingData(selectedScriptClient.id);
      if (fetchTabCounts) fetchTabCounts();
    } catch (err) {
      console.error('Failed to mark script seen:', err);
    }
  };

  React.useEffect(() => {
    if (selectedScriptClient && (marketingScripts || []).some(s => s.has_unseen_changes === 1)) {
      const timer = setTimeout(() => {
        handleMarkScriptSeen(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [selectedScriptClient?.id, marketingScripts]);

  if (!isAdmin && !isSMM) return null;

  const formatMonthLabel = (m) => {
    if (!m) return '-';
    const parts = m.split('-');
    if (parts.length !== 2) return m;
    const [year, month] = parts;
    const monthName = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ][parseInt(month) - 1];
    return `${monthName} ${year}`;
  };

  const availableMonths = Array.from(new Set((marketingScripts || []).map(s => s.month)))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  if (!availableMonths.includes(scriptMonth) && scriptMonth) {
    availableMonths.unshift(scriptMonth);
    availableMonths.sort((a, b) => b.localeCompare(a));
  }

  const monthlyScripts = (marketingScripts || []).filter(item => item.month === scriptMonth);
  const unseenCount = monthlyScripts.filter(item => item.has_unseen_changes === 1).length;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h3 style={{ margin: 0 }}>Script Tracker</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {unseenCount > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => handleMarkScriptSeen(null)}
              style={{ padding: '8px 14px', fontSize: '0.85rem', borderColor: '#eab308', color: '#ca8a04' }}
            >
              ✓ Mark All Seen ({unseenCount})
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingScript(null);
              setScriptFormData({
                title: '',
                script_text: '',
                month: scriptMonth,
                reference_video_link: '',
                reaction_video_link: '',
                format: 'reel',
                status: 'Pending Client Approval',
                client_comments: ''
              });
              setShowScriptModal(true);
            }}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Add Script
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
        Review and update marketing scripts and statuses for the selected client and month.
      </p>

      <div className="dashboard-toolbar" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0 }}>Client:</label>
            <select
              className="form-control"
              value={selectedScriptClient?.id || ''}
              onChange={(e) => {
                const client = clients.find(c => c.id === parseInt(e.target.value));
                setSelectedScriptClient(client);
                if (client) fetchMarketingData(client.id);
              }}
              style={{ maxWidth: '200px', padding: '8px' }}
            >
              {clients.filter(c => c.client_type !== 'artist_curation').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0 }}>Month:</label>
            <input
              type="month"
              className="form-control"
              value={scriptMonth}
              onChange={(e) => setScriptMonth(e.target.value)}
              style={{ maxWidth: '160px', padding: '8px' }}
            />
          </div>
        </div>
      </div>

      {/* Quick Month Chips Selector */}
      {availableMonths.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Months:</span>
          {availableMonths.map(m => {
            const scriptsInMonth = (marketingScripts || []).filter(s => s.month === m);
            const unseenInMonth = scriptsInMonth.filter(s => s.has_unseen_changes === 1).length;
            const isSelected = scriptMonth === m;

            return (
              <button
                key={m}
                type="button"
                onClick={() => setScriptMonth(m)}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  borderRadius: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: isSelected ? '800' : '600',
                  cursor: 'pointer',
                  borderColor: isSelected ? '#000' : (unseenInMonth > 0 ? '#eab308' : undefined),
                  boxShadow: isSelected ? '2px 2px 0px #000' : undefined
                }}
              >
                <span>{formatMonthLabel(m)}</span>
                <span style={{
                  background: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  fontWeight: 800
                }}>
                  {scriptsInMonth.length}
                </span>
                {unseenInMonth > 0 && (
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#eab308',
                    display: 'inline-block'
                  }} title={`${unseenInMonth} unseen change(s)`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {monthlyScripts.length === 0 ? (
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No scripts found for this client and month. Click "Add Script" to create one.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
            marginBottom: '24px'
          }}
        >
          {monthlyScripts.map(item => {
            const isUnseen = item.has_unseen_changes === 1;
            return (
              <div 
                key={item.id} 
                className="glass" 
                style={{ 
                  padding: '24px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '14px',
                  backgroundColor: isUnseen ? 'rgba(254, 240, 138, 0.18)' : undefined,
                  border: isUnseen ? '2px solid #eab308' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: isUnseen ? '0 0 16px rgba(234, 179, 8, 0.35)' : undefined,
                  transition: 'all 0.3s ease'
                }}
              >
                {isUnseen && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-2px' }}>
                    <span
                      style={{
                        background: '#fef08a',
                        color: '#854d0e',
                        border: '1px solid #eab308',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {item.last_changed_by === 'client' ? '💬 Updated by Client' : '⚡ Modified by Staff'}
                    </span>
                    <button
                      onClick={() => handleMarkScriptSeen(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ca8a04',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Mark Seen
                    </button>
                  </div>
                )}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.2rem', margin: 0, flexGrow: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {item.title}
                  <span
                    className={`badge badge-${item.format === 'long_format' ? 'info' : 'success'}`}
                    style={{
                      fontSize: '0.6rem',
                      padding: '2px 8px',
                      borderWidth: '1.5px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      lineHeight: '1',
                      boxShadow: 'none'
                    }}
                  >
                    {item.format === 'long_format' ? 'Long Format' : 'Reel'}
                  </span>
                </h4>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setEditingScript(item);
                      setScriptFormData({
                        title: item.title,
                        script_text: item.script_text,
                        month: item.month,
                        reference_video_link: item.reference_video_link || '',
                        reaction_video_link: item.reaction_video_link || '',
                        format: item.format || 'reel',
                        status: item.content_status || 'Pending Client Approval',
                        client_comments: item.client_comments || ''
                      });
                      setShowScriptModal(true);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteScript(item.id)}
                    className="btn btn-danger"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#dc3545', color: '#fff', border: 'none' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: '350px',
                overflowY: 'auto',
                padding: '14px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0,0,0,0.1)',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
                textAlign: 'left'
              }}>
                {item.script_text}
              </div>

              {(item.reference_video_link || item.reaction_video_link) && (
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', marginTop: '4px', flexWrap: 'wrap' }}>
                  {item.reference_video_link && (
                    <a href={item.reference_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ textDecoration: 'none' }}>
                      🎥 Reference Video
                    </a>
                  )}
                  {item.reaction_video_link && (
                    <a href={item.reaction_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-warning" style={{ textDecoration: 'none' }}>
                      🎬 Reaction Video
                    </a>
                  )}
                </div>
              )}

              {/* Script Status */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexWrap: 'wrap', 
                gap: '12px', 
                borderTop: '1px solid rgba(255,255,255,0.15)', 
                paddingTop: '12px', 
                marginTop: '6px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Status:</span>
                  <span
                    className={`badge badge-${
                      ['Client Approved', 'Posted'].includes(item.content_status) ? 'success' :
                      item.content_status === 'Client Rejected' ? 'danger' : 'warning'
                    }`}
                    style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}
                  >
                    {item.content_status || 'Pending Client Approval'}
                  </span>
                </div>
              </div>

              {item.client_comments && (
                <div style={{ 
                  background: '#fee2e2', 
                  border: '2px solid #ef4444', 
                  borderRadius: '8px', 
                  padding: '10px 14px', 
                  fontSize: '0.85rem', 
                  color: '#991b1b', 
                  fontWeight: '800', 
                  textAlign: 'left',
                  marginTop: '8px',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  💬 <strong>Client Revision Note:</strong> "{item.client_comments}"
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* Script Modal */}
      {showScriptModal && (
        <div className="modal-overlay" onClick={() => {
          setShowScriptModal(false);
          setEditingScript(null);
        }}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingScript ? 'Edit Script' : 'Add Script'}</h2>
            <form onSubmit={handleSaveScript} style={{ marginTop: '20px' }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={scriptFormData.title}
                  onChange={e => setScriptFormData({ ...scriptFormData, title: e.target.value })}
                  placeholder="e.g. Intro to Espresso Brewing"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Month</label>
                  <input
                    type="month"
                    className="form-control"
                    value={scriptFormData.month}
                    onChange={e => setScriptFormData({ ...scriptFormData, month: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Format Type</label>
                  <select
                    className="form-control"
                    value={scriptFormData.format || 'reel'}
                    onChange={e => setScriptFormData({ ...scriptFormData, format: e.target.value })}
                    required
                  >
                    <option value="reel">Reel Format</option>
                    <option value="long_format">Long Format</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Approval Status</label>
                  <select
                    className="form-control"
                    value={scriptFormData.status || 'Pending Client Approval'}
                    onChange={e => setScriptFormData({ ...scriptFormData, status: e.target.value })}
                    required
                  >
                    <option value="Pending Client Approval">Pending Client Approval</option>
                    <option value="Client Approved">Client Approved</option>
                    <option value="Client Rejected">Client Rejected</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {scriptFormData.status === 'Client Rejected' ? (
                    <>
                      <label className="form-label">Client Revision Comments</label>
                      <input
                        type="text"
                        className="form-control"
                        value={scriptFormData.client_comments || ''}
                        onChange={e => setScriptFormData({ ...scriptFormData, client_comments: e.target.value })}
                      />
                    </>
                  ) : (
                    <div style={{ minHeight: '1px' }}></div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Reference Video Link (Optional)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={scriptFormData.reference_video_link}
                    onChange={e => setScriptFormData({ ...scriptFormData, reference_video_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reaction Video Link (Optional)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={scriptFormData.reaction_video_link}
                    onChange={e => setScriptFormData({ ...scriptFormData, reaction_video_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Script Text</label>
                <textarea
                  className="form-control"
                  rows={16}
                  value={scriptFormData.script_text}
                  onChange={e => setScriptFormData({ ...scriptFormData, script_text: e.target.value })}
                  placeholder="Paste or write script contents here..."
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', minHeight: '350px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowScriptModal(false);
                    setEditingScript(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Script
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
