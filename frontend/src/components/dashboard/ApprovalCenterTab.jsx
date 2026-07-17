import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, XCircle, Clock, Database } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function ApprovalCenterTab({ showToast }) {
  const [pendingActions, setPendingActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/approval/pending`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setPendingActions(data.pending || []);
      }
    } catch (err) {
      console.error('[APPROVAL CENTER] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleResolve = async (actionId, resolution) => {
    try {
      const res = await fetch(`${API_BASE}/api/approval/${actionId}/${resolution}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Action successfully ${resolution === 'approve' ? 'approved & started' : 'rejected'}.`, 'success');
      fetchPending();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="card glass-premium" style={{ marginBottom: '20px', padding: '16px', border: '2px solid #000' }}>
        <h3 style={{ margin: 0, fontWeight: 'bold' }}>Admin Task Approval Center</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Review pending crawler agent triggers and scheduler runs before they consume API keys or budget limits.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading pending action items...</div>
      ) : pendingActions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f4f4f5', borderRadius: '4px', border: '2px dashed #000' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--text-muted)' }}>✅ Clean Queue — There are no pending task runs waiting for approval.</p>
        </div>
      ) : (
        <div className="table-container">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Requested At</th>
                <th>Client</th>
                <th>Action Type</th>
                <th>Configuration Parameters</th>
                <th>Requested By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingActions.map(action => (
                <tr key={action.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                      <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                      {new Date(action.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{action.client_name || 'System / Global'}</td>
                  <td>
                    <span className="badge badge-info" style={{ border: '1px solid #000' }}>
                      {action.action_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div><strong>Agent:</strong> {action.action_payload?.agentType || '--'}</div>
                      <div><strong>Model:</strong> {action.action_payload?.model || '--'}</div>
                      {action.action_payload?.url && <div><strong>URL:</strong> {action.action_payload.url}</div>}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{action.action_payload?.requested_by_email || 'staff'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>Role: {action.requested_role}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleResolve(action.id, 'approve')}
                        className="btn btn-primary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          background: '#22c55e',
                          color: '#fff',
                          border: '2px solid #000',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={() => handleResolve(action.id, 'reject')}
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          background: '#ef4444',
                          color: '#fff',
                          border: '2px solid #000',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
