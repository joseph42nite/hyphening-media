import React, { useState } from 'react';
import { Plus, FileDown } from 'lucide-react';
import { API_BASE } from '../../api.js';
import ContentModal from './ContentModal.jsx';

export default function MarketingDataTab({
  auth,
  clients,
  marketingContent,
  adCampaigns,
  monthlyReports,
  fetchMarketingData,
  fetchCalendarMarketingContent,
  fetchTasks,
  showToast,
  selectedClientForReports,
  setSelectedClientForReports,
  formatDateStr,
  marketingScripts,
  staffUsers
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSMM = auth?.role === 'ops_social_media_manager';

  // Modal local states (Content Row)
  const [showContentModal, setShowContentModal] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [contentFormData, setContentFormData] = useState({
    platform: 'instagram', date: '', post_type: 'Reel', title: '', script: '', script_id: '', status: 'Draft', link: '', time: '', caption: '',
    views: '', likes: '', comments: '', shares: '', saves: '', follows: '', avg_watch_time_pct: '', boosted: 'No',
    youtube_views: '', youtube_watch_time: '', youtube_avg_view_duration: '', youtube_ctr: '',
    facebook_post_id: '', instagram_media_id: '', youtube_video_id: '', assigned_to: ''
  });

  // Modal local states (Monthly Report)
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState(null);
  const [monthlyFormData, setMonthlyFormData] = useState({
    month: '', website_clicks: '', website_traffic: '', gmb_views: '', map_views: '', gmb_clicks: '', on_page_score: '', off_page: '',
    blogs: '', calls: '', directions: '', reviews: '', avg_rating: '', top_keywords: '', da: '', ai_overview_visible: 'No'
  });

  // Format month helper locally
  const formatMonthStr = (monthStr) => {
    if (!monthStr) return '-';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const monthName = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][parseInt(month) - 1];
    return `${monthName} ${year}`;
  };

  // CSV Export handler
  const handleCSVExport = (type) => {
    if (!selectedClientForReports) return;
    window.open(`/api/clients/${selectedClientForReports.id}/export/${type}`, '_blank');
  };

  // Content CRUD Handlers
  const openContentModal = (content = null) => {
    if (content) {
      setEditingContent(content);
      setContentFormData({
        platform: content.platform || 'instagram',
        date: content.date || '',
        post_type: content.post_type || 'Reel',
        title: content.title || '',
        script: content.script || '',
        script_id: content.script_id || '',
        status: content.status || 'Draft',
        link: content.link || '',
        time: content.time || '',
        caption: content.caption || '',
        views: content.views !== null && content.views !== undefined ? String(content.views) : '',
        likes: content.likes !== null && content.likes !== undefined ? String(content.likes) : '',
        comments: content.comments !== null && content.comments !== undefined ? String(content.comments) : '',
        shares: content.shares !== null && content.shares !== undefined ? String(content.shares) : '',
        saves: content.saves !== null && content.saves !== undefined ? String(content.saves) : '',
        follows: content.follows !== null && content.follows !== undefined ? String(content.follows) : '',
        avg_watch_time_pct: content.avg_watch_time_pct !== null && content.avg_watch_time_pct !== undefined ? String(content.avg_watch_time_pct) : '',
        boosted: content.boosted || 'No',
        youtube_views: content.youtube_views !== null && content.youtube_views !== undefined ? String(content.youtube_views) : '',
        youtube_watch_time: content.youtube_watch_time !== null && content.youtube_watch_time !== undefined ? String(content.youtube_watch_time) : '',
        youtube_avg_view_duration: content.youtube_avg_view_duration || '',
        youtube_ctr: content.youtube_ctr !== null && content.youtube_ctr !== undefined ? String(content.youtube_ctr) : '',
        facebook_post_id: content.facebook_post_id || '',
        instagram_media_id: content.instagram_media_id || '',
        youtube_video_id: content.youtube_video_id || '',
        assigned_to: content.assigned_to !== null && content.assigned_to !== undefined ? String(content.assigned_to) : ''
      });
    } else {
      setEditingContent(null);
      setContentFormData({
        platform: 'instagram', date: '', post_type: 'Reel', title: '', script: '', script_id: '', status: 'Draft', link: '', time: '', caption: '',
        views: '', likes: '', comments: '', shares: '', saves: '', follows: '', avg_watch_time_pct: '', boosted: 'No',
        youtube_views: '', youtube_watch_time: '', youtube_avg_view_duration: '', youtube_ctr: '',
        facebook_post_id: '', instagram_media_id: '', youtube_video_id: '', assigned_to: ''
      });
    }
    setShowContentModal(true);
  };

  const handleContentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports) return;

    const url = editingContent
      ? `/api/clients/${selectedClientForReports.id}/marketing/content/${editingContent.id}`
      : `/api/clients/${selectedClientForReports.id}/marketing/content`;
    const method = editingContent ? 'PATCH' : 'POST';

    const bodyData = {
      platform: contentFormData.platform,
      date: contentFormData.date || null,
      post_type: contentFormData.post_type || null,
      title: contentFormData.title || null,
      script: contentFormData.script || null,
      script_id: contentFormData.script_id || null,
      status: contentFormData.status || 'Draft',
      link: contentFormData.link || null,
      time: contentFormData.time || null,
      caption: contentFormData.caption || null,
      views: contentFormData.views !== '' ? parseInt(contentFormData.views) : null,
      likes: contentFormData.likes !== '' ? parseInt(contentFormData.likes) : null,
      comments: contentFormData.comments !== '' ? parseInt(contentFormData.comments) : null,
      shares: contentFormData.shares !== '' ? parseInt(contentFormData.shares) : null,
      saves: contentFormData.saves !== '' ? parseInt(contentFormData.saves) : null,
      follows: contentFormData.follows !== '' ? parseInt(contentFormData.follows) : null,
      avg_watch_time_pct: contentFormData.avg_watch_time_pct !== '' ? parseFloat(contentFormData.avg_watch_time_pct) : null,
      boosted: contentFormData.boosted || 'No',
      youtube_views: contentFormData.youtube_views !== '' ? parseInt(contentFormData.youtube_views) : null,
      youtube_watch_time: contentFormData.youtube_watch_time !== '' ? parseFloat(contentFormData.youtube_watch_time) : null,
      youtube_avg_view_duration: contentFormData.youtube_avg_view_duration || null,
      youtube_ctr: contentFormData.youtube_ctr !== '' ? parseFloat(contentFormData.youtube_ctr) : null,
      facebook_post_id: contentFormData.facebook_post_id || null,
      instagram_media_id: contentFormData.instagram_media_id || null,
      youtube_video_id: contentFormData.youtube_video_id || null,
      assigned_to: contentFormData.assigned_to !== '' ? parseInt(contentFormData.assigned_to) : null
    };

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save content row');

      showToast(`Content row ${editingContent ? 'updated' : 'added'} successfully`, 'success');
      setShowContentModal(false);
      fetchMarketingData(selectedClientForReports.id);
      fetchCalendarMarketingContent();
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateContentStatus = async (itemId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/marketing/content/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      showToast('Status updated successfully', 'success');
      fetchMarketingData(selectedClientForReports.id);
      fetchCalendarMarketingContent();
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Monthly Report CRUD Handlers
  const openMonthlyModal = (report = null) => {
    if (report) {
      setEditingMonthly(report);
      setMonthlyFormData({
        month: report.month || '',
        website_clicks: report.website_clicks !== null && report.website_clicks !== undefined ? String(report.website_clicks) : '',
        website_traffic: report.website_traffic !== null && report.website_traffic !== undefined ? String(report.website_traffic) : '',
        gmb_views: report.gmb_views !== null && report.gmb_views !== undefined ? String(report.gmb_views) : '',
        map_views: report.map_views !== null && report.map_views !== undefined ? String(report.map_views) : '',
        gmb_clicks: report.gmb_clicks !== null && report.gmb_clicks !== undefined ? String(report.gmb_clicks) : '',
        on_page_score: report.on_page_score !== null && report.on_page_score !== undefined ? String(report.on_page_score) : '',
        off_page: report.off_page !== null && report.off_page !== undefined ? String(report.off_page) : '',
        blogs: report.blogs !== null && report.blogs !== undefined ? String(report.blogs) : '',
        calls: report.calls !== null && report.calls !== undefined ? String(report.calls) : '',
        directions: report.directions !== null && report.directions !== undefined ? String(report.directions) : '',
        reviews: report.reviews !== null && report.reviews !== undefined ? String(report.reviews) : '',
        avg_rating: report.avg_rating !== null && report.avg_rating !== undefined ? String(report.avg_rating) : '',
        top_keywords: report.top_keywords || '',
        da: report.da !== null && report.da !== undefined ? String(report.da) : '',
        ai_overview_visible: report.ai_overview_visible || 'No'
      });
    } else {
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '', website_clicks: '', website_traffic: '', gmb_views: '', map_views: '', gmb_clicks: '', on_page_score: '', off_page: '',
        blogs: '', calls: '', directions: '', reviews: '', avg_rating: '', top_keywords: '', da: '', ai_overview_visible: 'No'
      });
    }
    setShowMonthlyModal(true);
  };

  const handleMonthlyReportSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/marketing/monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthlyFormData.month,
          website_clicks: monthlyFormData.website_clicks || null,
          website_traffic: monthlyFormData.website_traffic !== '' ? parseInt(monthlyFormData.website_traffic) : null,
          gmb_views: monthlyFormData.gmb_views !== '' ? parseInt(monthlyFormData.gmb_views) : null,
          map_views: monthlyFormData.map_views !== '' ? parseInt(monthlyFormData.map_views) : null,
          gmb_clicks: monthlyFormData.gmb_clicks !== '' ? parseInt(monthlyFormData.gmb_clicks) : null,
          on_page_score: monthlyFormData.on_page_score || null,
          off_page: monthlyFormData.off_page !== '' ? parseInt(monthlyFormData.off_page) : null,
          blogs: monthlyFormData.blogs !== '' ? parseInt(monthlyFormData.blogs) : null,
          calls: monthlyFormData.calls !== '' ? parseInt(monthlyFormData.calls) : null,
          directions: monthlyFormData.directions !== '' ? parseInt(monthlyFormData.directions) : null,
          reviews: monthlyFormData.reviews !== '' ? parseInt(monthlyFormData.reviews) : null,
          avg_rating: monthlyFormData.avg_rating !== '' ? parseFloat(monthlyFormData.avg_rating) : null,
          top_keywords: monthlyFormData.top_keywords || null,
          da: monthlyFormData.da !== '' ? parseInt(monthlyFormData.da) : null,
          ai_overview_visible: monthlyFormData.ai_overview_visible || 'No'
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save monthly report');

      showToast(`Monthly report ${editingMonthly ? 'updated' : 'saved'} successfully`, 'success');
      setShowMonthlyModal(false);
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '', website_clicks: '', website_traffic: '', gmb_views: '', map_views: '', gmb_clicks: '', on_page_score: '', off_page: '',
        blogs: '', calls: '', directions: '', reviews: '', avg_rating: '', top_keywords: '', da: '', ai_overview_visible: 'No'
      });
      fetchMarketingData(selectedClientForReports.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!isAdmin && !isSMM) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="dashboard-toolbar">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
          <label className="form-label" style={{ margin: 0 }}>Select Client:</label>
          <select
            className="form-control"
            value={selectedClientForReports?.id || ''}
            onChange={(e) => {
              const client = clients.find(c => c.id === parseInt(e.target.value));
              setSelectedClientForReports(client);
              if (client) fetchMarketingData(client.id);
            }}
            style={{ maxWidth: '250px' }}
          >
            {clients.filter(c => c.client_type !== 'artist_curation').map(c => (
              <option key={c.id} value={c.id}>
                {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => handleCSVExport('content')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
            <FileDown size={14} /> Content CSV
          </button>
          <button onClick={() => handleCSVExport('ads')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
            <FileDown size={14} /> Ads CSV
          </button>
          <button onClick={() => handleCSVExport('monthly')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
            <FileDown size={14} /> Monthly CSV
          </button>
        </div>
      </div>

      {selectedClientForReports && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Content Performance Tracker</h3>
            {(isAdmin || isSMM) && (
              <button onClick={() => openContentModal()} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                <Plus size={14} style={{ marginRight: '4px' }} /> Add Content Row
              </button>
            )}
          </div>
          <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
            <table>
              <thead>
                <tr>
                  <th colSpan="8" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5' }}>Metadata</th>
                  <th colSpan="11" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#fee2e2' }}>Instagram Metrics</th>
                  <th colSpan="4" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#dbeafe' }}>YouTube Metrics</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5' }}>Actions</th>
                </tr>
                <tr>
                  <th>Date</th>
                  <th>Post Type</th>
                  <th>Script</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Link</th>
                  <th>Time</th>
                  <th>Caption</th>
                  <th>Views</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Shares</th>
                  <th>Saves</th>
                  <th>Follows</th>
                  <th>Avg Watch Time %</th>
                  <th>Boosted?</th>
                  <th>Engagement %</th>
                  <th>Save Rate %</th>
                  <th>Score</th>
                  <th>Views</th>
                  <th>Watch Time (hrs)</th>
                  <th>Avg Duration</th>
                  <th>CTR%</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {marketingContent.length === 0 ? (
                  <tr>
                    <td colSpan="24" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No content items tracked yet.
                    </td>
                  </tr>
                ) : (
                  marketingContent.map(item => (
                    <tr key={item.id}>
                      <td>{item.date ? formatDateStr(item.date) : '-'}</td>
                      <td><span className="badge badge-info">{item.post_type}</span></td>
                      <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.script_title || item.script}>{item.script_title || item.script || '-'}</td>
                      <td>
                        <select
                          value={item.status === 'Pending Client Approval' || item.status === 'Client Approved' ? 'Pending' : (item.status === 'Client Rejected' ? 'Draft' : item.status)}
                          onChange={(e) => updateContentStatus(item.id, e.target.value)}
                          style={{
                            padding: '6px 24px 6px 12px',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            borderRadius: '9999px',
                            border: '2px solid #000000',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 8px center',
                            backgroundSize: '10px',
                            backgroundColor:
                              item.status === 'Posted' ? '#d1fae5' :
                              (['Pending', 'Pending Client Approval', 'Client Approved'].includes(item.status) ? '#fee2e2' : '#f4f4f5'),
                            color:
                              item.status === 'Posted' ? '#065f46' :
                              (['Pending', 'Pending Client Approval', 'Client Approved'].includes(item.status) ? '#991b1b' : '#52525b'),
                            boxShadow: 'var(--shadow-sm)'
                          }}
                        >
                          <option value="Draft" style={{ color: '#52525b', background: '#f4f4f5', fontWeight: '800' }}>Draft</option>
                          <option value="Pending" style={{ color: '#991b1b', background: '#fee2e2', fontWeight: '800' }}>Pending</option>
                          <option value="Posted" style={{ color: '#065f46', background: '#d1fae5', fontWeight: '800' }}>Posted</option>
                        </select>
                      </td>
                      <td>{item.assignee_name || '-'}</td>
                      <td>
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Link</a>
                        ) : '-'}
                      </td>
                      <td>{item.time || '-'}</td>
                      <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.caption}>{item.caption || '-'}</td>

                      <td>{item.views?.toLocaleString() || '0'}</td>
                      <td>{item.likes?.toLocaleString() || '0'}</td>
                      <td>{item.comments?.toLocaleString() || '0'}</td>
                      <td>{item.shares?.toLocaleString() || '0'}</td>
                      <td>{item.saves?.toLocaleString() || '0'}</td>
                      <td>{item.follows?.toLocaleString() || '0'}</td>
                      <td>
                        {item.avg_watch_time_pct !== null && item.avg_watch_time_pct !== undefined ? (
                          <span style={{ color: item.avg_watch_time_pct >= 50 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.avg_watch_time_pct}%
                          </span>
                        ) : '-'}
                      </td>
                      <td>{item.boosted || 'No'}</td>
                      <td>
                        {item.engagement_rate_pct !== null && item.engagement_rate_pct !== undefined ? (
                          <span style={{ color: item.engagement_rate_pct >= 10 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.engagement_rate_pct}%
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        {item.save_rate_pct !== null && item.save_rate_pct !== undefined ? (
                          <span style={{ color: item.save_rate_pct >= 2 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.save_rate_pct}%
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{item.content_score || '-'}</td>

                      <td>{item.youtube_views?.toLocaleString() || '0'}</td>
                      <td>{item.youtube_watch_time !== null && item.youtube_watch_time !== undefined ? item.youtube_watch_time.toLocaleString() : '0'}</td>
                      <td>{item.youtube_avg_view_duration || '-'}</td>
                      <td>
                        {item.youtube_ctr !== null && item.youtube_ctr !== undefined ? (
                          <span style={{ color: item.youtube_ctr >= 4 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.youtube_ctr}%
                          </span>
                        ) : '0%'}
                      </td>

                      <td>
                        {(isAdmin || isSMM) && (
                          <button
                            onClick={() => openContentModal(item)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginBottom: '12px' }}>Ad Campaigns Performance</h3>
          <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Campaign Name</th>
                  <th>Leads</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>CPL</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {adCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No ad campaigns tracked.
                    </td>
                  </tr>
                ) : (
                  adCampaigns.map(ad => (
                    <tr key={ad.id}>
                      <td><span className="badge badge-success">{ad.platform}</span></td>
                      <td style={{ fontWeight: '500' }}>{ad.ad_campaign_name}</td>
                      <td>{ad.leads}</td>
                      <td>₹{ad.total_ad_spend_inr?.toLocaleString()}</td>
                      <td>{ad.impressions?.toLocaleString()}</td>
                      <td>{ad.clicks?.toLocaleString()}</td>
                      <td>
                        {ad.ctr_pct !== null && ad.ctr_pct !== undefined ? (
                          <span style={{ color: ad.ctr_pct >= 2 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {ad.ctr_pct}%
                          </span>
                        ) : '-'}
                      </td>
                      <td>₹{ad.cpl_inr}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{ad.roas}x</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* SEO Monthly Reports Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', marginTop: '32px' }}>
            <h3 style={{ margin: 0 }}>SEO & GMB Monthly Reports</h3>
            {(isAdmin || isSMM) && (
              <button onClick={() => openMonthlyModal()} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                <Plus size={14} style={{ marginRight: '4px' }} /> Add Monthly Report
              </button>
            )}
          </div>
          <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Website Clicks</th>
                  <th>Website Traffic</th>
                  <th>GMB Views</th>
                  <th>Map Views</th>
                  <th>GMB Clicks</th>
                  <th>On Page Score</th>
                  <th>Off Page</th>
                  <th>Blogs</th>
                  <th>Calls</th>
                  <th>Directions</th>
                  <th>Reviews</th>
                  <th>Avg. Rating</th>
                  <th>Top 3 Keywords</th>
                  <th>DA</th>
                  <th>MoM Growth – Sessions</th>
                  <th>MoM Growth – GMB Views</th>
                  <th>AI Overview Visible?</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReports.length === 0 ? (
                  <tr>
                    <td colSpan="19" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No monthly reports available.
                    </td>
                  </tr>
                ) : (
                  monthlyReports.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 'bold' }}>{formatMonthStr(item.month)}</td>
                      <td>{item.website_clicks || '-'}</td>
                      <td>{item.website_traffic?.toLocaleString() || '-'}</td>
                      <td>{item.gmb_views?.toLocaleString() || '-'}</td>
                      <td>{item.map_views?.toLocaleString() || '-'}</td>
                      <td>{item.gmb_clicks?.toLocaleString() || '-'}</td>
                      <td>{item.on_page_score || '-'}</td>
                      <td>{item.off_page !== null && item.off_page !== undefined ? item.off_page : '-'}</td>
                      <td>{item.blogs !== null && item.blogs !== undefined ? item.blogs : '-'}</td>
                      <td>{item.calls !== null && item.calls !== undefined ? item.calls : '-'}</td>
                      <td>{item.directions !== null && item.directions !== undefined ? item.directions : '-'}</td>
                      <td>{item.reviews !== null && item.reviews !== undefined ? item.reviews : '-'}</td>
                      <td>{item.avg_rating !== null && item.avg_rating !== undefined ? item.avg_rating.toFixed(1) : '-'}</td>
                      <td>{item.top_keywords || '-'}</td>
                      <td>{item.da !== null && item.da !== undefined ? item.da : '-'}</td>
                      <td>
                        {item.mom_growth_sessions !== null && item.mom_growth_sessions !== undefined ? (
                          <span style={{ color: item.mom_growth_sessions >= 0 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.mom_growth_sessions >= 0 ? '+' : ''}{(item.mom_growth_sessions * 100).toFixed(2)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        {item.mom_growth_gmb_views !== null && item.mom_growth_gmb_views !== undefined ? (
                          <span style={{ color: item.mom_growth_gmb_views >= 0 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.mom_growth_gmb_views >= 0 ? '+' : ''}{(item.mom_growth_gmb_views * 100).toFixed(2)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`badge badge-${item.ai_overview_visible === 'Yes' ? 'success' : 'muted'}`}>
                          {item.ai_overview_visible || 'No'}
                        </span>
                      </td>
                      <td>
                        {(isAdmin || isSMM) && (
                          <button
                            onClick={() => openMonthlyModal(item)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content Modal */}
      <ContentModal
        showContentModal={showContentModal}
        setShowContentModal={setShowContentModal}
        editingContent={editingContent}
        contentFormData={contentFormData}
        setContentFormData={setContentFormData}
        handleContentSubmit={handleContentSubmit}
        clients={clients}
        staffUsers={staffUsers}
        marketingScripts={marketingScripts}
      />

      {/* Monthly Report Modal */}
      {showMonthlyModal && (
        <div className="modal-overlay" onClick={() => setShowMonthlyModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingMonthly ? 'Edit Monthly Report' : 'Add Monthly Report'}</h2>
            <form onSubmit={handleMonthlyReportSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Month (YYYY-MM)</label>
                  <input
                    type="month"
                    className="form-control"
                    value={monthlyFormData.month}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, month: e.target.value })}
                    required
                    disabled={!!editingMonthly}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Website Clicks</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 7.89k"
                    value={monthlyFormData.website_clicks}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, website_clicks: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Website Traffic</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 16000"
                    value={monthlyFormData.website_traffic}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, website_traffic: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GMB Views</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 52000"
                    value={monthlyFormData.gmb_views}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_views: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Map Views</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 35000"
                    value={monthlyFormData.map_views}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, map_views: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GMB Clicks</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 1200"
                    value={monthlyFormData.gmb_clicks}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_clicks: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">On Page Score</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 85/100"
                    value={monthlyFormData.on_page_score}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, on_page_score: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Off Page</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 45"
                    value={monthlyFormData.off_page}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, off_page: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Blogs</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 4"
                    value={monthlyFormData.blogs}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, blogs: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Calls</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 150"
                    value={monthlyFormData.calls}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, calls: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Directions</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 450"
                    value={monthlyFormData.directions}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, directions: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reviews</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 12"
                    value={monthlyFormData.reviews}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, reviews: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Avg. Rating</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    className="form-control"
                    placeholder="e.g. 4.8"
                    value={monthlyFormData.avg_rating}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, avg_rating: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">DA</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 32"
                    value={monthlyFormData.da}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, da: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Top 3 Keywords</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="keyword1, keyword2..."
                    value={monthlyFormData.top_keywords}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, top_keywords: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">AI Overview Visible?</label>
                  <select
                    className="form-control"
                    value={monthlyFormData.ai_overview_visible}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, ai_overview_visible: e.target.value })}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMonthlyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
