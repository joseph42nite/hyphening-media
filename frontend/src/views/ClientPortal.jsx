import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  TrendingUp, BarChart2, MessageSquare, ThumbsUp, 
  Check, X, Eye, FileText, Send, Lock
} from 'lucide-react';

export default function ClientPortal({ showToast }) {
  const { token } = useParams();
  
  // Auth state
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [clientName, setClientName] = useState('');
  
  // Dashboard data state
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [contentList, setContentList] = useState([]);
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [pendingPlan, setPendingPlan] = useState([]);
  
  // Feedback form
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  
  // Modal state for change request
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionComment, setRejectionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  
  // Expanded card state
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Try fetching to see if authenticated/PIN required
  useEffect(() => {
    checkPortalAuth();
  }, [token]);

  const checkPortalAuth = async () => {
    try {
      const response = await fetch(`/api/portal/${token}/overview`);
      const data = await response.json();
      
      if (response.status === 401 && data.requires_pin) {
        setPinRequired(true);
        setIsVerified(false);
      } else if (response.ok) {
        setIsVerified(true);
        setPinRequired(false);
        setClientName(data.client_name);
        setOverview(data);
        fetchData();
      } else {
        throw new Error(data.error || 'Unable to access portal');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const verifyPin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/portal/${token}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }
      setIsVerified(true);
      setPinRequired(false);
      setClientName(data.client_name);
      showToast('PIN verified successfully', 'success');
      checkPortalAuth(); // Reload dashboard data
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fetchData = async () => {
    try {
      // Content list
      const resContent = await fetch(`/api/portal/${token}/content`);
      const dataContent = await resContent.json();
      if (resContent.ok) setContentList(dataContent.content || []);

      // Ad campaigns
      const resAds = await fetch(`/api/portal/${token}/ads`);
      const dataAds = await resAds.json();
      if (resAds.ok) setAdCampaigns(dataAds.ads || []);

      // Content plan pending approval
      const resPlan = await fetch(`/api/portal/${token}/content-plan`);
      const dataPlan = await resPlan.json();
      if (resPlan.ok) setPendingPlan(dataPlan.content_plan || []);
    } catch (err) {
      console.error('Error fetching portal sub-data:', err);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this content?')) return;
    try {
      const response = await fetch(`/api/portal/${token}/content-plan/${id}/approve`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve');
      
      showToast('Content approved successfully', 'success');
      // Refresh
      fetchData();
      checkPortalAuth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openRejectModal = (item) => {
    setRejectingItem(item);
    setRejectionComment('');
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionComment.trim()) {
      showToast('Please provide a comment outlining the changes required', 'error');
      return;
    }
    
    setSubmittingDecision(true);
    try {
      const response = await fetch(`/api/portal/${token}/content-plan/${rejectingItem.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: rejectionComment })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request changes');

      showToast('Revisions submitted successfully', 'success');
      setRejectingItem(null);
      fetchData();
      checkPortalAuth();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;

    setSubmittingFeedback(true);
    try {
      const response = await fetch(`/api/portal/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedbackMsg })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit feedback');

      showToast('Feedback submitted successfully', 'success');
      setFeedbackMsg('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (pinRequired) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '16px' }}>
        <div className="glass-premium" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--accent-glow)', borderRadius: '50%', color: 'var(--accent)', marginBottom: '16px' }}>
            <Lock size={32} />
          </div>
          <h2 style={{ marginBottom: '8px' }}>Security Verification</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
            Please enter your Client PIN to access the performance dashboard and approval portal.
          </p>
          <form onSubmit={verifyPin}>
            <div className="form-group">
              <input
                type="password"
                className="form-control"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
              Verify Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isVerified || !overview) {
    return (
      <div className="flex-center" style={{ minHeight: '80vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loader" style={{ border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Verifying secure token access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '16px 8px', maxWidth: '800px', animation: 'fadeIn 0.3s ease-out' }}>
      
      {/* Portal Header */}
      <header className="glass" style={{ padding: '20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', fontWeight: 600 }}>
            Client Portal
          </span>
          {overview.pending_approvals > 0 && (
            <span className="badge badge-warning" style={{ animation: 'pulseGlow 2s infinite' }}>
              {overview.pending_approvals} approval pending
            </span>
          )}
        </div>
        <h1 style={{ fontSize: '1.8rem', margin: '4px 0 0' }}>{clientName}</h1>
      </header>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button 
          onClick={() => setActiveTab('overview')} 
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flexGrow: 1 }}
        >
          <BarChart2 size={16} /> Overview
        </button>
        <button 
          onClick={() => setActiveTab('content')} 
          className={`btn ${activeTab === 'content' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flexGrow: 1 }}
        >
          <TrendingUp size={16} /> Content
        </button>
        <button 
          onClick={() => setActiveTab('approval')} 
          className={`btn ${activeTab === 'approval' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flexGrow: 1, position: 'relative' }}
        >
          <FileText size={16} /> Approvals
          {overview.pending_approvals > 0 && (
            <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)' }} />
          )}
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', textAlign: 'left' }}>Performance Summary</h2>
          
          <div className="grid-auto">
            {/* Content Stats */}
            {overview.content && (
              <>
                <div className="glass card-metric">
                  <span className="metric-label">Total Video Views</span>
                  <span className="metric-value">{overview.content.total_views?.toLocaleString() || 0}</span>
                </div>
                <div className="glass card-metric">
                  <span className="metric-label">Avg Engagement Rate</span>
                  <span className="metric-value">{overview.content.avg_engagement_rate || 0}%</span>
                </div>
                <div className="glass card-metric">
                  <span className="metric-label">Content Quality Score</span>
                  <span className="metric-value">{overview.content.avg_content_score || 0}</span>
                </div>
              </>
            )}

            {/* Ads Stats */}
            {overview.ads && (
              <>
                <div className="glass card-metric">
                  <span className="metric-label">Total Leads</span>
                  <span className="metric-value">{overview.ads.total_leads || 0}</span>
                </div>
                <div className="glass card-metric">
                  <span className="metric-label">Return on Ad Spend (ROAS)</span>
                  <span className="metric-value">{overview.ads.avg_roas ? `${overview.ads.avg_roas}x` : 'N/A'}</span>
                </div>
                <div className="glass card-metric">
                  <span className="metric-label">Total Spend</span>
                  <span className="metric-value">₹{overview.ads.total_spend?.toLocaleString() || 0}</span>
                </div>
              </>
            )}
          </div>

          {/* Quick feedback request */}
          <div className="glass" style={{ padding: '20px', textAlign: 'left', marginTop: '12px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Need assistance or request changes?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Drop a note directly to our operations team. We will be notified instantly.
            </p>
            <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Ask a question or request an update..."
                value={feedbackMsg}
                onChange={(e) => setFeedbackMsg(e.target.value)}
                style={{ flexGrow: 1 }}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={submittingFeedback}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Tracked Performance</h2>
          
          {contentList.length === 0 ? (
            <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No tracked posts found yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {contentList.map(item => (
                <div key={item.id} className="glass" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <span className="badge badge-info" style={{ marginRight: '6px' }}>{item.platform}</span>
                      <span className="badge badge-muted">{item.post_type}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.date}</span>
                  </div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>{item.title}</h3>
                  {item.caption && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={item.caption}>
                      {item.caption}
                    </p>
                  )}
                  {item.link && (
                    <div style={{ marginBottom: '12px' }}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'underline' }}>
                        View Post
                      </a>
                    </div>
                  )}
                  {item.platform === 'youtube' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.8rem', marginTop: '12px', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Views</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.youtube_views?.toLocaleString() || 0}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Watch Time</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.youtube_watch_time || 0}h</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Duration</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{item.youtube_avg_view_duration || 'N/A'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>CTR</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.youtube_ctr || 0}%</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.8rem', marginTop: '12px', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Views</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.views?.toLocaleString() || 0}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Engagement</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.engagement_rate_pct ? `${item.engagement_rate_pct}%` : '0%'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Quality Score</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.content_score || 0}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {adCampaigns.length > 0 && (
            <>
              <h2 style={{ fontSize: '1.25rem', marginTop: '20px' }}>Ad Campaigns</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {adCampaigns.map((ad, idx) => (
                  <div key={idx} className="glass" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge badge-success">{ad.platform}</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{ad.roas ? `${ad.roas}x ROAS` : 'Leads focused'}</span>
                    </div>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>{ad.ad_campaign_name}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '0.75rem' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Leads</div>
                        <div style={{ fontWeight: 'bold' }}>{ad.leads}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Spend</div>
                        <div style={{ fontWeight: 'bold' }}>₹{ad.total_ad_spend_inr}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Clicks</div>
                        <div style={{ fontWeight: 'bold' }}>{ad.clicks}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>CPL</div>
                        <div style={{ fontWeight: 'bold' }}>₹{ad.cpl_inr}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Approval Tab */}
      {activeTab === 'approval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Review Pending Content</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Please review the scripts, concepts, or captions prepared by our managers. Click approve, or request revisions.
          </p>

          {pendingPlan.length === 0 ? (
            <div className="glass" style={{ padding: '45px', textAlign: 'center', color: 'var(--success)' }}>
              <div style={{ display: 'inline-flex', padding: '10px', background: 'var(--success-glow)', borderRadius: '50%', marginBottom: '12px' }}>
                <Check size={28} />
              </div>
              <h4>All Content Approved!</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                No pending content awaits your action. Good job!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pendingPlan.map(item => {
                const isExpanded = expandedItems[item.id];
                return (
                  <div key={item.id} className="glass" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <span className="badge badge-info" style={{ marginRight: '6px' }}>{item.platform}</span>
                        <span className="badge badge-muted">{item.post_type}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target: {item.date}</span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{item.title}</h3>

                    {/* Script details */}
                    <div style={{ 
                      background: 'rgba(0, 0, 0, 0.2)', 
                      padding: '12px 16px', 
                      borderRadius: '6px', 
                      fontFamily: 'var(--font-sans)', 
                      fontSize: '0.9rem', 
                      whiteSpace: 'pre-wrap',
                      maxHeight: isExpanded ? 'none' : '80px',
                      overflow: 'hidden',
                      position: 'relative',
                      borderLeft: '3px solid var(--accent)',
                      marginBottom: '12px'
                    }}>
                      {item.script || 'No script text provided.'}
                      {!isExpanded && item.script && item.script.length > 100 && (
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '30px',
                          background: 'linear-gradient(to top, rgba(10,11,16,0.9), transparent)'
                        }} />
                      )}
                    </div>

                    {item.script && item.script.length > 100 && (
                      <button 
                        onClick={() => toggleExpand(item.id)}
                        className="btn btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem', marginBottom: '16px' }}
                      >
                        {isExpanded ? 'Show Less' : 'Read Full Script'}
                      </button>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                      <button 
                        onClick={() => handleApprove(item.id)}
                        className="btn btn-success" 
                        style={{ flexGrow: 1 }}
                      >
                        <Check size={16} /> Approve
                      </button>
                      <button 
                        onClick={() => openRejectModal(item)}
                        className="btn btn-danger" 
                        style={{ flexGrow: 1 }}
                      >
                        <X size={16} /> Request Changes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Change Request Modal */}
      {rejectingItem && (
        <div className="modal-overlay" onClick={() => setRejectingItem(null)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Request Changes</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Detail the changes required for: <strong>{rejectingItem.title}</strong>. This content will be marked as rejected, and operations will address your feedback immediately.
            </p>
            
            <form onSubmit={handleReject}>
              <div className="form-group">
                <label className="form-label">Revision Instructions</label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Tell us what to change (e.g. edit the intro hook, change the call to action, adjust caption details)..."
                  value={rejectionComment}
                  onChange={(e) => setRejectionComment(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setRejectingItem(null)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={submittingDecision}
                >
                  {submittingDecision ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
