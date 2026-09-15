import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, DollarSign, Calendar, ChevronDown, ChevronUp, ExternalLink, RefreshCw, X } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function FreelancersTab({
  auth,
  freelancers,
  fetchFreelancers,
  showToast
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  // Payment period. '' is the lifetime view the tab has always shown; a YYYY-MM
  // scopes both sides of the balance to that month, which is how freelancers
  // actually invoice.
  const [paymentMonth, setPaymentMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [monthlyRows, setMonthlyRows] = useState(null);

  // Monthly breakdown ledger modal state
  const [breakdownFreelancer, setBreakdownFreelancer] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [expandedBreakdownMonth, setExpandedBreakdownMonth] = useState(null);
  const [updatingMonth, setUpdatingMonth] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/freelancers/payment-months`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { months: [] }))
      .then(d => setAvailableMonths(d.months || []))
      .catch(() => setAvailableMonths([]));
  }, []);

  const loadMonth = async (month) => {
    if (!month) { setMonthlyRows(null); return; }
    try {
      const res = await fetch(`${API_BASE}/api/freelancers?month=${month}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load monthly payment data');
      const data = await res.json();
      setMonthlyRows(data.freelancers || []);
    } catch (err) {
      showToast(err.message, 'error');
      setMonthlyRows(null);
    }
  };

  useEffect(() => { loadMonth(paymentMonth); }, [paymentMonth]);

  const refreshRoster = () => {
    fetchFreelancers();
    if (paymentMonth) loadMonth(paymentMonth);
  };

  const openMonthlyBreakdown = async (freelancer) => {
    setBreakdownFreelancer(freelancer);
    setExpandedBreakdownMonth(null);
    setLoadingBreakdown(true);
    try {
      const res = await fetch(`${API_BASE}/api/freelancers/${freelancer.id}/monthly-breakdown`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load monthly payment breakdown');
      const data = await res.json();
      setBreakdownData(data);
    } catch (err) {
      showToast(err.message, 'error');
      setBreakdownData(null);
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const handleUpdateMonthlyPayment = async (month, newPaidCount) => {
    if (!breakdownFreelancer || newPaidCount < 0) return;
    setUpdatingMonth(month);
    try {
      const res = await fetch(`${API_BASE}/api/freelancers/${breakdownFreelancer.id}/payments/${month}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos_paid: newPaidCount }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update payment count');
      }
      showToast(`Payment updated: ${newPaidCount} videos paid for ${formatMonthLabel(month)}`, 'success');

      const refreshRes = await fetch(`${API_BASE}/api/freelancers/${breakdownFreelancer.id}/monthly-breakdown`, { credentials: 'include' });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setBreakdownData(data);
      }
      refreshRoster();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingMonth(null);
    }
  };

  const rows = paymentMonth && monthlyRows ? monthlyRows : freelancers;

  const formatMonthLabel = (m) => {
    if (!m) return '';
    const [year, mon] = m.split('-');
    const name = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'][parseInt(mon, 10) - 1];
    return `${name} ${year}`;
  };

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
    const newPaid = (freelancer.videos_paid || 0) + 1;

    // With a month selected the payment belongs to that month, not to the
    // lifetime counter — crediting July's payment to the running total would
    // silently mark an earlier month's backlog as settled.
    const request = paymentMonth
      ? {
          url: `/api/freelancers/${freelancer.id}/payments/${paymentMonth}`,
          method: 'PUT',
          label: `for ${formatMonthLabel(paymentMonth)}`
        }
      : {
          url: `/api/freelancers/${freelancer.id}`,
          method: 'PATCH',
          label: `(Total: ${newPaid})`
        };

    try {
      const res = await fetch(`${API_BASE}${request.url}`, {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos_paid: newPaid }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update payment count');
      }
      showToast(`Logged +1 video paid for ${freelancer.name} ${request.label}`, 'success');
      refreshRoster();
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
            {paymentMonth
              ? `Videos posted in ${formatMonthLabel(paymentMonth)} and what is still due for that month.`
              : 'Track assigned content count, completed videos, payment history, and balance due.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={paymentMonth}
            onChange={e => setPaymentMonth(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '0.85rem', fontWeight: '700', border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' }}
            title="Scope payment due to a single month"
          >
            <option value="">All time</option>
            {availableMonths.map(m => (
              <option key={m.month} value={m.month}>
                {formatMonthLabel(m.month)} ({m.posted_videos})
              </option>
            ))}
          </select>
          <button onClick={() => openFreelancerModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Add Freelancer
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact / Company</th>
              <th>Specialization</th>
              <th>Rate / Video</th>
              <th>{paymentMonth ? `Videos Done (${formatMonthLabel(paymentMonth)})` : 'Videos Done'}</th>
              <th>{paymentMonth ? 'Paid This Month' : 'Videos Paid'}</th>
              <th>{paymentMonth ? 'Due This Month' : 'Balance Due'}</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No freelancers added yet.
                </td>
              </tr>
            ) : (
              rows.map(free => {
                const rate = free.rate_per_video || 0;
                const posted = free.posted_videos || 0;
                // In month view every figure is that month's, assigned included,
                // so a lifetime total is not shown next to a monthly count.
                const total = paymentMonth
                  ? (free.assigned_videos_in_month || 0)
                  : (free.total_videos || 0);
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
                        ({total} assigned{paymentMonth ? ' this month' : ' total'})
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
                            ✓ {paymentMonth ? 'Settled' : 'Fully Paid'}
                          </span>
                        )}
                        {rate > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {paymentMonth ? 'Earned this month' : 'Earned'}: ₹{totalEarned.toLocaleString()}
                          </div>
                        )}
                        <div style={{ marginTop: '5px' }}>
                          <button
                            onClick={() => openMonthlyBreakdown(free)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: '#38bdf8',
                              fontSize: '0.72rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            title="See month-by-month breakdown of payments due"
                          >
                            <Calendar size={11} /> Monthly breakdown
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${free.is_active === 1 ? 'success' : 'danger'}`}>
                        {free.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openMonthlyBreakdown(free)}
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="View monthly payment breakdown"
                        >
                          <Calendar size={13} /> Breakdown
                        </button>
                        <button onClick={() => openFreelancerModal(free)} className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '0.75rem' }}>
                          Edit
                        </button>
                        <button
                          onClick={() => toggleFreelancerStatus(free)}
                          className={`btn btn-${free.is_active === 1 ? 'secondary' : 'primary'}`}
                          style={{ padding: '5px 8px', fontSize: '0.75rem' }}
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
              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-3" style={{ marginBottom: '16px' }}>
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
      {/* Monthly Payment Ledger Modal */}
      {breakdownFreelancer && (
        <div className="modal-overlay" onClick={() => setBreakdownFreelancer(null)}>
          <div
            className="modal-content glass-premium"
            onClick={e => e.stopPropagation()}
            style={{ textAlign: 'left', width: '100%', maxWidth: '850px', maxHeight: '88vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0 }}>{breakdownFreelancer.name}</h2>
                  {breakdownFreelancer.specialization && (
                    <span className="badge badge-muted" style={{ fontSize: '0.8rem' }}>
                      {breakdownFreelancer.specialization}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  Monthly Payment Ledger & Due Breakdown (Rate: ₹{(breakdownFreelancer.rate_per_video || 0).toLocaleString()} / video)
                </p>
              </div>
              <button
                onClick={() => setBreakdownFreelancer(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {loadingBreakdown ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
                <div>Loading monthly breakdown...</div>
              </div>
            ) : breakdownData ? (
              <div style={{ marginTop: '20px' }}>
                {/* Summary Metrics Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginBottom: '24px'
                  }}
                >
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Posted Videos</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary)' }}>
                      {breakdownData.summary?.total_posted || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Videos Paid</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '4px', color: '#34d399' }}>
                      {breakdownData.summary?.total_paid || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Earned</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary)' }}>
                      ₹{(breakdownData.summary?.total_earned || 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{
                    background: (breakdownData.summary?.total_balance_due || 0) > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    border: `1px solid ${(breakdownData.summary?.total_balance_due || 0) > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    borderRadius: '10px',
                    padding: '12px 16px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: (breakdownData.summary?.total_balance_due || 0) > 0 ? '#fbbf24' : '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Total Balance Due
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '4px', color: (breakdownData.summary?.total_balance_due || 0) > 0 ? '#fbbf24' : '#34d399' }}>
                      ₹{(breakdownData.summary?.total_balance_due || 0).toLocaleString()}
                    </div>
                    {(breakdownData.summary?.months_with_dues || 0) > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '2px' }}>
                        Due across {breakdownData.summary.months_with_dues} {breakdownData.summary.months_with_dues === 1 ? 'month' : 'months'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Monthly Ledger Table */}
                <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', letterSpacing: '0.02em' }}>
                  Payment Status by Video Post Month
                </h4>

                {(!breakdownData.breakdown || breakdownData.breakdown.length === 0) ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    No videos or payment activity recorded for this freelancer yet.
                  </div>
                ) : (
                  <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Posted</th>
                          <th>Earned</th>
                          <th>Paid</th>
                          <th>Balance Due</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownData.breakdown.map(monthItem => {
                          const isExpanded = expandedBreakdownMonth === monthItem.month;
                          const isUpdating = updatingMonth === monthItem.month;

                          return (
                            <React.Fragment key={monthItem.month}>
                              <tr style={{ background: monthItem.balance_due > 0 ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}>
                                <td style={{ fontWeight: '700' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{formatMonthLabel(monthItem.month)}</span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: '700' }}>{monthItem.posted_videos}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                    ({monthItem.assigned_videos} assigned)
                                  </span>
                                </td>
                                <td style={{ fontWeight: '600' }}>
                                  ₹{monthItem.earned_amount.toLocaleString()}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontWeight: '800' }}>{monthItem.videos_paid}</span>
                                    {isAdmin && (
                                      <div style={{ display: 'inline-flex', gap: '3px' }}>
                                        <button
                                          disabled={isUpdating || monthItem.videos_paid <= 0}
                                          onClick={() => handleUpdateMonthlyPayment(monthItem.month, monthItem.videos_paid - 1)}
                                          className="btn btn-secondary"
                                          style={{ padding: '2px 6px', fontSize: '0.7rem', minWidth: '22px', height: '22px' }}
                                          title="Decrease paid count by 1"
                                        >
                                          -1
                                        </button>
                                        <button
                                          disabled={isUpdating}
                                          onClick={() => handleUpdateMonthlyPayment(monthItem.month, monthItem.videos_paid + 1)}
                                          className="btn btn-secondary"
                                          style={{ padding: '2px 6px', fontSize: '0.7rem', minWidth: '22px', height: '22px' }}
                                          title="Increase paid count by 1"
                                        >
                                          +1
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  {monthItem.balance_due > 0 ? (
                                    <span className="badge badge-warning" style={{ fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', fontSize: '0.75rem' }}>
                                      ₹{monthItem.balance_due.toLocaleString()} ({monthItem.unpaid_videos} unpaid)
                                    </span>
                                  ) : (
                                    <span className="badge badge-success" style={{ fontWeight: '800', background: '#d1fae5', color: '#065f46', border: '1px solid #10b981', fontSize: '0.75rem' }}>
                                      ✓ Settled
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    {isAdmin && monthItem.balance_due > 0 && (
                                      <button
                                        disabled={isUpdating}
                                        onClick={() => handleUpdateMonthlyPayment(monthItem.month, monthItem.posted_videos)}
                                        className="btn btn-primary"
                                        style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                        title={`Mark all ${monthItem.posted_videos} videos paid for ${formatMonthLabel(monthItem.month)}`}
                                      >
                                        Settle Month
                                      </button>
                                    )}
                                    {monthItem.videos && monthItem.videos.length > 0 && (
                                      <button
                                        onClick={() => setExpandedBreakdownMonth(isExpanded ? null : monthItem.month)}
                                        className="btn btn-secondary"
                                        style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                      >
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        {isExpanded ? 'Hide' : `Videos (${monthItem.videos.length})`}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && monthItem.videos && monthItem.videos.length > 0 && (
                                <tr>
                                  <td colSpan="6" style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-muted)' }}>
                                      Videos posted in {formatMonthLabel(monthItem.month)}:
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {monthItem.videos.map(vid => (
                                        <div
                                          key={vid.id}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '6px 10px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-color)'
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{vid.date}</span>
                                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{vid.title || 'Untitled'}</span>
                                            {vid.post_type && (
                                              <span className="badge badge-muted" style={{ fontSize: '0.7rem', padding: '1px 5px' }}>
                                                {vid.post_type}
                                              </span>
                                            )}
                                          </div>
                                          {vid.link && (
                                            <a
                                              href={vid.link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', textDecoration: 'none' }}
                                            >
                                              Link <ExternalLink size={11} />
                                            </a>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBreakdownFreelancer(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
