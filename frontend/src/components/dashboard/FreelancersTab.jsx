import React, { useState } from 'react';
import { Plus, CheckCircle, DollarSign } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function FreelancersTab({
  auth,
  freelancers,
  fetchFreelancers,
  showToast
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  // Modal local states
  const [showFreelancerModal, setShowFreelancerModal] = useState(false);
  const [editingFreelancer, setEditingFreelancer] = useState(null);
  const [freelancerFormData, setFreelancerFormData] = useState({
    name: '', email: '', phone: '', company_name: '', specialization: '', rate_per_video: '', videos_paid: '0'
  });

  const openFreelancerModal = (freelancer = null) => {
    if (freelancer) {
      setEditingFreelancer(freelancer);
      setFreelancerFormData({
        name: freelancer.name,
        email: freelancer.email || '',
        phone: freelancer.phone || '',
        company_name: freelancer.company_name || '',
        specialization: freelancer.specialization || '',
        rate_per_video: freelancer.rate_per_video !== null && freelancer.rate_per_video !== undefined ? String(freelancer.rate_per_video) : '',
        videos_paid: freelancer.videos_paid !== null && freelancer.videos_paid !== undefined ? String(freelancer.videos_paid) : '0'
      });
    } else {
      setEditingFreelancer(null);
      setFreelancerFormData({
        name: '', email: '', phone: '', company_name: '', specialization: '', rate_per_video: '', videos_paid: '0'
      });
    }
    setShowFreelancerModal(true);
  };

  const handleFreelancerSubmit = async (e) => {
    e.preventDefault();
    const url = editingFreelancer ? `/api/freelancers/${editingFreelancer.id}` : '/api/freelancers';
    const method = editingFreelancer ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...freelancerFormData,
          rate_per_video: freelancerFormData.rate_per_video ? parseFloat(freelancerFormData.rate_per_video) : null,
          videos_paid: freelancerFormData.videos_paid ? parseInt(freelancerFormData.videos_paid) : 0
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit freelancer data');

      showToast(`Freelancer ${editingFreelancer ? 'updated' : 'added'} successfully`, 'success');
      setShowFreelancerModal(false);
      fetchFreelancers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleQuickIncrementPaid = async (freelancer) => {
    const currentPaid = freelancer.videos_paid || 0;
    const newPaid = currentPaid + 1;
    try {
      const res = await fetch(`${API_BASE}/api/freelancers/${freelancer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos_paid: newPaid }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update payment count');
      }
      showToast(`Logged +1 video paid for ${freelancer.name} (Total: ${newPaid})`, 'success');
      fetchFreelancers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleFreelancerStatus = async (freelancer) => {
    const newStatus = freelancer.is_active === 1 ? 0 : 1;
    const actionStr = newStatus === 1 ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${actionStr} this freelancer?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/freelancers/${freelancer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to toggle status');
      }
      showToast(`Freelancer ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`, 'success');
      fetchFreelancers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!isAdmin) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3>Freelancer Roster & Payment Tracker</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Track assigned content count, completed videos, payment history, and balance due.
          </p>
        </div>
        <button onClick={() => openFreelancerModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Freelancer
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact / Company</th>
              <th>Specialization</th>
              <th>Rate / Video</th>
              <th>Videos Done</th>
              <th>Videos Paid</th>
              <th>Balance Due</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {freelancers.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No freelancers added yet.
                </td>
              </tr>
            ) : (
              freelancers.map(free => {
                const rate = free.rate_per_video || 0;
                const posted = free.posted_videos || 0;
                const total = free.total_videos || 0;
                const paid = free.videos_paid || 0;
                const unpaidCount = Math.max(0, posted - paid);
                const balanceDue = unpaidCount * rate;
                const totalEarned = posted * rate;

                return (
                  <tr key={free.id} style={{ opacity: free.is_active === 1 ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 'bold' }}>
                      {free.name}
                    </td>
                    <td>
                      <div>{free.email || free.phone || '-'}</div>
                      {free.company_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{free.company_name}</div>
                      )}
                    </td>
                    <td>
                      {free.specialization ? (
                        <span className="badge badge-muted" style={{ fontSize: '0.75rem' }}>
                          {free.specialization}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ fontWeight: '600' }}>
                      {free.rate_per_video !== null && free.rate_per_video !== undefined ? `₹${free.rate_per_video.toLocaleString()}` : '-'}
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                        {posted} posted
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({total} assigned total)
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.95rem' }}>{paid}</span>
                        {isAdmin && (
                          <button
                            onClick={() => handleQuickIncrementPaid(free)}
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', fontWeight: 'bold' }}
                            title="Log +1 video paid"
                          >
                            +1 Paid
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        {unpaidCount > 0 ? (
                          <span className="badge badge-warning" style={{ fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>
                            ₹{balanceDue.toLocaleString()} ({unpaidCount} unpaid)
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontWeight: '800', background: '#d1fae5', color: '#065f46', border: '1px solid #10b981' }}>
                            ✓ Fully Paid
                          </span>
                        )}
                        {rate > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            Earned: ₹{totalEarned.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${free.is_active === 1 ? 'success' : 'danger'}`}>
                        {free.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openFreelancerModal(free)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                          Edit
                        </button>
                        <button
                          onClick={() => toggleFreelancerStatus(free)}
                          className={`btn btn-${free.is_active === 1 ? 'secondary' : 'primary'}`}
                          style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        >
                          {free.is_active === 1 ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Freelancer Modal */}
      {showFreelancerModal && (
        <div className="modal-overlay" onClick={() => setShowFreelancerModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingFreelancer ? 'Edit Freelancer' : 'Add Freelancer'}</h2>
            <form onSubmit={handleFreelancerSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.name}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={freelancerFormData.email}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.phone}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.company_name}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, company_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Specialization</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Video Editor"
                    value={freelancerFormData.specialization}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, specialization: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rate per Video (INR)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 2500"
                    value={freelancerFormData.rate_per_video}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, rate_per_video: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Videos Paid For</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={freelancerFormData.videos_paid}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, videos_paid: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFreelancerModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Freelancer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
