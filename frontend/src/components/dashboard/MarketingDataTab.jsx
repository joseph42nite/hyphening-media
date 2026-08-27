import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { API_BASE } from '../../api.js';
import ContentModal from './ContentModal.jsx';
import AllClientsMarketingDashboard from './AllClientsMarketingDashboard.jsx';
import { CONTENT_FORM_DEFAULTS, buildContentPayload, buildContentFormState } from './contentFormHelper.js';

export default function MarketingDataTab({
  auth,
  clients,
  allClientsOverview = [],
  overviewMonths = [],
  overviewMonth = '',
  onOverviewMonthChange,
  marketingContent,
  adCampaigns = [],
  availableAdMonths = [],
  selectedAdMonth = '',
  setSelectedAdMonth,
  adLeadTotals = null,
  monthlyReports,
  fetchMarketingData,
  fetchCalendarMarketingContent,
  fetchTasks,
  showToast,
  selectedClientForReports,
  setSelectedClientForReports,
  formatDateStr,
  marketingScripts,
  staffUsers,
  freelancers = []
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSMM = auth?.role === 'ops_social_media_manager';
  const isVideoEditor = auth?.role === 'ops_video_editor';

  // Content Tracker Pagination State
  const [contentPage, setContentPage] = useState(1);
  const ITEMS_PER_PAGE_CONTENT = 10;

  useEffect(() => {
    setContentPage(1);
    if (selectedClientForReports?.id === 'all' || !selectedClientForReports) {
      fetchMarketingData('all');
    } else if (selectedClientForReports?.id) {
      fetchMarketingData(selectedClientForReports.id);
    }
  }, [selectedClientForReports?.id]);

  // Modal local states (Content Row)
  const [showContentModal, setShowContentModal] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [contentFormData, setContentFormData] = useState({ ...CONTENT_FORM_DEFAULTS });

  // Modal local states (Monthly Report)
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState(null);
  const [monthlyFormData, setMonthlyFormData] = useState({
    month: '', website_clicks: '', website_traffic: '', gmb_views: '', map_views: '', gmb_clicks: '', on_page_score: '', off_page: '',
    blogs: '', calls: '', directions: '', reviews: '', avg_rating: '', top_keywords: '', da: '', ai_overview_visible: 'No'
  });

  // Platform filter — the tracker is sorted by date, so a client whose YouTube
  // posts are older than their Instagram ones has them stranded pages deep.
  //
  // Cross-posted Shorts are logged as platform=instagram with the YouTube URL in
  // `link`, so matching on `platform` alone would hide most of the YouTube
  // catalogue. Ask whether the row has a YouTube video instead.
  const [platformFilter, setPlatformFilter] = useState('all');
  const hasYouTube = (i) => !!(
    i.youtube_video_id ||
    (i.platform || '').toLowerCase().includes('youtube') ||
    /(?:youtube\.com|youtu\.be)\//i.test(i.link || '') ||
    /(?:youtube\.com|youtu\.be)\//i.test(i.youtube_link || '')
  );
  const visibleContent = platformFilter === 'all'
    ? marketingContent
    : platformFilter === 'youtube'
      ? marketingContent.filter(hasYouTube)
      : marketingContent.filter(i => (i.platform || '').toLowerCase() === 'instagram' && !hasYouTube(i));

  // Video length as m:ss (YouTube durations are short enough that hours are rare)
  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

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

  // Sync All Metrics handler
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const handleSyncAllMetrics = async () => {
    if (!selectedClientForReports || isSyncing) return;
    setIsSyncing(true);
    try {
      const resp = await fetch(`${API_BASE}/api/marketing/content/sync-all-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clientId: selectedClientForReports.id })
      });
      if (resp.ok) {
        const { summary } = await resp.json();
        setLastSync(summary);
        const failed = summary?.failed ? `, ${summary.failed} failed` : '';
        showToast?.(`✅ Synced ${summary?.synced ?? 0} of ${summary?.total ?? 0} posts${failed}`);
        fetchMarketingData(selectedClientForReports.id);
      } else {
        const err = await resp.json().catch(() => ({}));
        showToast?.(`❌ Sync failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      showToast?.(`❌ Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Ad campaign entry. Leads, qualified leads and bookings are derived from
  // campaign_leads by name and month, so the form only asks for what nothing
  // else can know — and never for CTR/CPC/CPL/ROAS, which are computed.
  const AD_FORM_DEFAULTS = {
    platform: 'Meta', ad_campaign_name: '', month: '',
    total_ad_spend_inr: '', impressions: '', clicks: '', revenue_generated: ''
  };
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState(null);
  const [adFormData, setAdFormData] = useState({ ...AD_FORM_DEFAULTS });

  const openAdModal = (ad = null) => {
    const fallbackMonth = selectedAdMonth && selectedAdMonth !== 'all'
      ? selectedAdMonth
      : new Date().toISOString().slice(0, 7);
    if (ad) {
      // A lead-derived row is passed in with id null: pre-fill from it, but
      // create rather than update, since there is no record to update.
      setEditingAd(ad.id ? ad : null);
      setAdFormData({
        platform: ad.platform || 'Meta',
        ad_campaign_name: ad.ad_campaign_name || '',
        month: ad.month || fallbackMonth,
        total_ad_spend_inr: ad.total_ad_spend_inr != null ? String(ad.total_ad_spend_inr) : '',
        impressions: ad.impressions != null ? String(ad.impressions) : '',
        clicks: ad.clicks != null ? String(ad.clicks) : '',
        revenue_generated: ad.revenue_generated ? String(ad.revenue_generated) : ''
      });
    } else {
      setEditingAd(null);
      setAdFormData({ ...AD_FORM_DEFAULTS, month: fallbackMonth });
    }
    setShowAdModal(true);
  };

  const handleAdSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports?.id) return;
    const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

    const url = editingAd
      ? `/api/clients/${selectedClientForReports.id}/marketing/ads/${editingAd.id}`
      : `/api/clients/${selectedClientForReports.id}/marketing/ads`;

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: editingAd ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          platform: adFormData.platform,
          ad_campaign_name: adFormData.ad_campaign_name,
          month: adFormData.month,
          total_ad_spend_inr: num(adFormData.total_ad_spend_inr),
          impressions: num(adFormData.impressions),
          clicks: num(adFormData.clicks),
          revenue_generated: num(adFormData.revenue_generated)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save campaign');

      showToast(`Campaign ${editingAd ? 'updated' : 'added'} successfully`, 'success');
      setShowAdModal(false);
      fetchMarketingData(selectedClientForReports.id, adFormData.month);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Procedure price list. Estimated revenue values each booking by what it was
  // actually for, so this is what makes Est. ROAS mean anything.
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceRows, setPriceRows] = useState([]);
  const [defaultBookingValue, setDefaultBookingValue] = useState('');
  const [priceMeta, setPriceMeta] = useState({ observed: [], untyped: 0 });

  const openPriceModal = async () => {
    if (!selectedClientForReports?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/treatment-prices`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load procedure prices');
      const data = await res.json();

      // Seed from the treatment types the client's leads actually mention, so
      // rows cannot be typed in with names that will never match a booking.
      const priced = new Map((data.prices || []).map(p => [p.treatment_type.trim().toLowerCase(), p]));
      const rows = (data.observed_treatments || []).map(o => ({
        treatment_type: o.treatment_type,
        bookings: o.bookings,
        leads: o.leads,
        price_inr: priced.has(o.treatment_type.trim().toLowerCase())
          ? String(priced.get(o.treatment_type.trim().toLowerCase()).price_inr)
          : ''
      }));
      // Anything priced previously whose treatment no longer appears on a lead
      // is kept, rather than silently dropped on the next save.
      for (const p of (data.prices || [])) {
        if (!rows.some(r => r.treatment_type.trim().toLowerCase() === p.treatment_type.trim().toLowerCase())) {
          rows.push({ treatment_type: p.treatment_type, bookings: 0, leads: 0, price_inr: String(p.price_inr) });
        }
      }

      setPriceRows(rows);
      setDefaultBookingValue(data.default_booking_value_inr != null ? String(data.default_booking_value_inr) : '');
      setPriceMeta({ observed: data.observed_treatments || [], untyped: data.untyped_bookings || 0 });
      setShowPriceModal(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePriceSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/treatment-prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prices: priceRows
            .filter(r => r.price_inr !== '' && Number(r.price_inr) >= 0)
            .map(r => ({ treatment_type: r.treatment_type, price_inr: Number(r.price_inr) })),
          default_booking_value_inr: defaultBookingValue === '' ? null : Number(defaultBookingValue)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save procedure prices');

      showToast('Procedure prices saved', 'success');
      setShowPriceModal(false);
      fetchMarketingData(selectedClientForReports.id, selectedAdMonth);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Content CRUD Handlers
  const openContentModal = (content = null) => {
    if (content) {
      setEditingContent(content);
      setContentFormData(buildContentFormState(content));
    } else {
      setEditingContent(null);
      setContentFormData({ ...CONTENT_FORM_DEFAULTS });
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

    const bodyData = buildContentPayload(contentFormData);

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
      if (fetchCalendarMarketingContent) fetchCalendarMarketingContent();
      if (fetchTasks) fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteContent = async (contentId, skipConfirm = false) => {
    if (!selectedClientForReports) return;
    if (!skipConfirm && !window.confirm('Are you sure you want to delete this content item? This action cannot be undone.')) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/marketing/content/${contentId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete content item');

      showToast('Content item deleted successfully', 'success');
      setShowContentModal(false);
      fetchMarketingData(selectedClientForReports.id);
      if (fetchCalendarMarketingContent) fetchCalendarMarketingContent();
      if (fetchTasks) fetchTasks();
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

  // Video editors get the tab read-only: every add/edit/delete control below
  // is gated on (isAdmin || isSMM), and the API refuses them the writes too.
  if (!isAdmin && !isSMM && !isVideoEditor) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="dashboard-toolbar marketing-toolbar">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
          <label className="form-label" style={{ margin: 0 }}>Select Client:</label>
          <select
            className="form-control"
            value={selectedClientForReports?.id || 'all'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all') {
                setSelectedClientForReports({ id: 'all', name: 'All Clients' });
                fetchMarketingData('all');
              } else {
                const client = clients.find(c => c.id === parseInt(val));
                setSelectedClientForReports(client);
                if (client) fetchMarketingData(client.id);
              }
            }}
            style={{ maxWidth: '280px', fontWeight: 'bold' }}
          >
            <option value="all">🌐 All Clients (Dashboard)</option>
            {clients.filter(c => c.client_type !== 'artist_curation').map(c => (
              <option key={c.id} value={c.id}>
                {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(!selectedClientForReports || selectedClientForReports.id === 'all') ? (
        <AllClientsMarketingDashboard
          overviewData={allClientsOverview}
          availableMonths={overviewMonths}
          selectedMonth={overviewMonth}
          onMonthChange={onOverviewMonthChange}
          onSelectClient={(client) => {
            setSelectedClientForReports(client);
            fetchMarketingData(client.id);
          }}
        />
      ) : (
        <div>
          <div className="marketing-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Content Performance Tracker</h3>
            <div className="marketing-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={platformFilter}
                onChange={e => { setPlatformFilter(e.target.value); setContentPage(1); }}
                style={{ padding: '6px 10px', fontSize: '0.8rem', fontWeight: '700', border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' }}
              >
                <option value="all">All platforms</option>
                <option value="instagram">Instagram only</option>
                <option value="youtube">YouTube only</option>
              </select>
              {(isAdmin || isSMM) && (
                <>
                  {lastSync?.finishedAt && !isSyncing && (
                    <span style={{ fontSize: '0.75rem', color: '#71717a', whiteSpace: 'nowrap' }}>
                      Last synced {new Date(lastSync.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {lastSync.failed > 0 && (
                        <span style={{ color: '#991b1b', fontWeight: 'bold' }}> · {lastSync.failed} failed</span>
                      )}
                    </span>
                  )}
                  <button onClick={handleSyncAllMetrics} disabled={isSyncing} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                    <RefreshCw size={14} style={{ marginRight: '4px', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                    {isSyncing ? 'Syncing...' : '🔄 Sync Metrics'}
                  </button>
                </>
              )}
              {(isAdmin || isSMM) && (
                <button onClick={() => openContentModal()} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> Add Content Row
                </button>
              )}
            </div>
          </div>
          <div className="table-container table-scrollable-y" style={{ marginBottom: visibleContent.length > 0 ? '12px' : '32px' }}>
            <table>
              <thead>
                <tr>
                  <th colSpan="8" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5', whiteSpace: 'nowrap', fontWeight: '900' }}>Metadata</th>
                  <th colSpan="12" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#fee2e2', color: '#991b1b', whiteSpace: 'nowrap', fontWeight: '900' }}>Instagram Metrics</th>
                  <th colSpan="8" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#dbeafe', color: '#1e40af', whiteSpace: 'nowrap', fontWeight: '900' }}>YouTube Metrics</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5', whiteSpace: 'nowrap', fontWeight: '900' }}>Actions</th>
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
                  <th>Skip Rate %</th>
                  <th>Boosted?</th>
                  <th>Engagement %</th>
                  <th>Save Rate %</th>
                  <th>Score</th>
                  <th>Views</th>
                  <th title="Views per day since publish — comparable across video ages">Views/Day</th>
                  <th title="Short (≤60s) or long-form">Format</th>
                  <th>Length</th>
                  <th title="Likes as a percentage of views">Like %</th>
                  <th>Watch Time (hrs)</th>
                  <th>Avg Duration</th>
                  <th>CTR%</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleContent.length === 0 ? (
                  <tr>
                    <td colSpan="29" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No content items tracked yet.
                    </td>
                  </tr>
                ) : (
                  visibleContent
                    .slice((contentPage - 1) * ITEMS_PER_PAGE_CONTENT, contentPage * ITEMS_PER_PAGE_CONTENT)
                    .map(item => (
                    <tr key={item.id}>
                      <td>{item.date ? formatDateStr(item.date) : '-'}</td>
                      <td><span className="badge badge-info">{item.post_type}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.script_title || item.script}>
                        {item.script_title || item.script || '-'}
                        {item.client_comments && (
                          <div style={{ fontSize: '0.72rem', color: '#991b1b', background: '#fee2e2', border: '1px solid #ef4444', padding: '2px 6px', borderRadius: '4px', marginTop: '2px', fontWeight: '800' }} title={`Client Feedback: ${item.client_comments}`}>
                            💬 "{item.client_comments}"
                          </div>
                        )}
                      </td>
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
                      <td>
                        {item.assignee_name || '-'}
                        {item.freelancer_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                            🎨 {item.freelancer_name}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontSize: '0.75rem', fontWeight: 'bold' }} title="Primary Link">🔗 Main</a>
                          )}
                          {item.instagram_link && (
                            <a href={item.instagram_link} target="_blank" rel="noopener noreferrer" style={{ color: '#e1306c', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.75rem' }} title="Instagram Link">📸 IG</a>
                          )}
                          {item.youtube_link && (
                            <a href={item.youtube_link} target="_blank" rel="noopener noreferrer" style={{ color: '#ff0000', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.75rem' }} title="YouTube Link">▶️ YT</a>
                          )}
                          {item.facebook_link && (
                            <a href={item.facebook_link} target="_blank" rel="noopener noreferrer" style={{ color: '#1877f2', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.75rem' }} title="Facebook Link">📘 FB</a>
                          )}
                          {item.linkedin_link && (
                            <a href={item.linkedin_link} target="_blank" rel="noopener noreferrer" style={{ color: '#0077b5', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.75rem' }} title="LinkedIn Link">💼 LN</a>
                          )}
                          {!item.link && !item.instagram_link && !item.youtube_link && !item.facebook_link && !item.linkedin_link && '-'}
                        </div>
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
                      <td>
                        {item.skip_rate_pct !== null && item.skip_rate_pct !== undefined ? (
                          <span style={{ color: item.skip_rate_pct <= 30 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.skip_rate_pct}%
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
                      <td style={{ fontWeight: 'bold' }}>
                        {item.youtube_views_per_day !== null && item.youtube_views_per_day !== undefined
                          ? item.youtube_views_per_day.toLocaleString()
                          : '-'}
                      </td>
                      <td>
                        {item.youtube_format ? (
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold',
                            background: item.youtube_format === 'Short' ? '#fef3c7' : '#e0e7ff',
                            color: item.youtube_format === 'Short' ? '#92400e' : '#3730a3'
                          }}>
                            {item.youtube_format}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{formatDuration(item.youtube_duration_seconds)}</td>
                      <td>
                        {item.youtube_like_rate_pct !== null && item.youtube_like_rate_pct !== undefined ? (
                          <span style={{ color: item.youtube_like_rate_pct >= 1 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                            {item.youtube_like_rate_pct}%
                          </span>
                        ) : '-'}
                      </td>
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
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => openContentModal(item)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteContent(item.id)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#ef4444' }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {visibleContent.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                Showing {Math.min((contentPage - 1) * ITEMS_PER_PAGE_CONTENT + 1, visibleContent.length)} to {Math.min(contentPage * ITEMS_PER_PAGE_CONTENT, visibleContent.length)} of {visibleContent.length} entries
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  onClick={() => setContentPage(p => Math.max(1, p - 1))}
                  disabled={contentPage === 1}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: contentPage === 1 ? 0.5 : 1, cursor: contentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                {Array.from({ length: Math.ceil(visibleContent.length / ITEMS_PER_PAGE_CONTENT) }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setContentPage(page)}
                    className={`btn ${contentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 10px', fontSize: '0.8rem', minWidth: '32px' }}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setContentPage(p => Math.min(Math.ceil(visibleContent.length / ITEMS_PER_PAGE_CONTENT), p + 1))}
                  disabled={contentPage >= Math.ceil(visibleContent.length / ITEMS_PER_PAGE_CONTENT)}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: contentPage >= Math.ceil(visibleContent.length / ITEMS_PER_PAGE_CONTENT) ? 0.5 : 1, cursor: contentPage >= Math.ceil(visibleContent.length / ITEMS_PER_PAGE_CONTENT) ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Ad Campaigns Performance Section with MoM Month Selection & Pagination */}
          <div style={{ marginTop: '32px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ margin: 0 }}>Ad Campaigns Performance</h3>
              {selectedAdMonth && (
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                  {selectedAdMonth === 'all' ? 'All Months' : formatMonthStr(selectedAdMonth)}
                </span>
              )}
            </div>

            {/* Month Pagination & Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Month:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                disabled={!availableAdMonths.length || availableAdMonths.indexOf(selectedAdMonth) >= availableAdMonths.length - 1}
                onClick={() => {
                  const currIdx = availableAdMonths.indexOf(selectedAdMonth);
                  const nextMonth = currIdx < availableAdMonths.length - 1 ? availableAdMonths[currIdx + 1] : selectedAdMonth;
                  if (nextMonth && setSelectedAdMonth && selectedClientForReports?.id) {
                    setSelectedAdMonth(nextMonth);
                    fetchMarketingData(selectedClientForReports.id, nextMonth);
                  }
                }}
              >
                &larr; Prev
              </button>

              <select
                className="form-control"
                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.85rem', fontWeight: 'bold' }}
                value={selectedAdMonth || 'all'}
                onChange={(e) => {
                  // 'all' is sent through as-is: an empty month means "let the server pick
                  // the latest month", which is not the same thing as an all-time total.
                  const val = e.target.value;
                  if (setSelectedAdMonth) setSelectedAdMonth(val);
                  if (selectedClientForReports?.id) {
                    fetchMarketingData(selectedClientForReports.id, val);
                  }
                }}
              >
                <option value="all">All Months (Total)</option>
                {availableAdMonths.map(m => (
                  <option key={m} value={m}>{formatMonthStr(m)}</option>
                ))}
              </select>

              {(isAdmin || isSMM) && (
                <>
                  <button onClick={openPriceModal} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} title="Set what each procedure is worth, used for estimated revenue">
                    ₹ Procedure Prices
                  </button>
                  <button onClick={() => openAdModal()} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                    <Plus size={13} style={{ marginRight: '3px' }} /> Add Campaign
                  </button>
                </>
              )}

              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                disabled={!availableAdMonths.length || availableAdMonths.indexOf(selectedAdMonth) <= 0}
                onClick={() => {
                  const currIdx = availableAdMonths.indexOf(selectedAdMonth);
                  const prevMonth = currIdx > 0 ? availableAdMonths[currIdx - 1] : selectedAdMonth;
                  if (prevMonth && setSelectedAdMonth && selectedClientForReports?.id) {
                    setSelectedAdMonth(prevMonth);
                    fetchMarketingData(selectedClientForReports.id, prevMonth);
                  }
                }}
              >
                Next &rarr;
              </button>
            </div>
          </div>

          {/* MoM Performance Summary Cards */}
          {adCampaigns.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Ad Spend</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '2px' }}>
                  ₹{adCampaigns.reduce((acc, curr) => acc + (curr.total_ad_spend_inr || 0), 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Leads Captured</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
                  {adLeadTotals ? adLeadTotals.total_leads : adCampaigns.reduce((acc, curr) => acc + (curr.actual_leads || curr.leads || 0), 0)}
                </div>
              </div>
              {adLeadTotals && (
                <>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Qualified Leads</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
                      {adLeadTotals.qualified_leads}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cost / Booking</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      {(() => {
                        const spend = adCampaigns.reduce((acc, c) => acc + (c.total_ad_spend_inr || 0), 0);
                        const bookings = adLeadTotals.confirmed_bookings || 0;
                        return bookings > 0 && spend > 0 ? `₹${Math.round(spend / bookings).toLocaleString()}` : '-';
                      })()}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Confirmed Bookings</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      {adLeadTotals.confirmed_bookings}
                    </div>
                  </div>
                </>
              )}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Avg Cost Per Lead (CPL)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '2px' }}>
                  {(() => {
                    const totalSpend = adCampaigns.reduce((acc, curr) => acc + (curr.total_ad_spend_inr || 0), 0);
                    const totalLeads = adLeadTotals
                      ? adLeadTotals.total_leads
                      : adCampaigns.reduce((acc, curr) => acc + (curr.actual_leads || curr.leads || 0), 0);
                    return totalLeads > 0 ? `₹${Math.round(totalSpend / totalLeads)}` : '-';
                  })()}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Overall ROAS</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)', marginTop: '2px' }}>
                  {(() => {
                    const totalSpend = adCampaigns.reduce((acc, curr) => acc + (curr.total_ad_spend_inr || 0), 0);
                    const totalRev = adCampaigns.reduce((acc, curr) => acc + (curr.revenue_generated || 0), 0);
                    return totalSpend > 0 ? `${(totalRev / totalSpend).toFixed(2)}x` : '-';
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Campaign Name</th>
                  <th>Leads (Ad Platform)</th>
                  <th>Captured Leads</th>
                  <th>Qualified Leads</th>
                  <th>Confirmed Bookings</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>CPL</th>
                  <th title="Spend divided by confirmed bookings — measured, no pricing assumed">Cost / Booking</th>
                  <th>ROAS</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {adCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan="14" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No ad campaigns tracked for this selection.
                    </td>
                  </tr>
                ) : (
                  adCampaigns.map(ad => (
                    <tr key={ad.id}>
                      <td><span className="badge badge-success">{ad.platform}</span></td>
                      <td style={{ fontWeight: '500' }}>{ad.ad_campaign_name}</td>
                      <td>{ad.leads}</td>
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{ad.actual_leads ?? 0}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>{ad.actual_qualified_leads ?? 0}</td>
                      <td style={{ fontWeight: 'bold', color: '#2563eb' }}>{ad.actual_confirmed_bookings ?? 0}</td>
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
                      <td style={{ fontWeight: 800, color: '#2563eb' }}>
                        {ad.cost_per_booking_inr != null ? `₹${ad.cost_per_booking_inr.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                        {ad.roas != null ? `${ad.roas}x` : '-'}
                        {ad.roas_is_estimated && (
                          <span
                            title={`Estimated from ${ad.actual_confirmed_bookings ?? 0} booking(s) priced at ₹${(ad.estimated_revenue_inr || 0).toLocaleString()} — no actual revenue entered`}
                            style={{ marginLeft: '4px', fontSize: '0.6rem', fontWeight: 900, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', padding: '1px 4px', borderRadius: '4px', verticalAlign: 'middle' }}
                          >EST</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(isAdmin || isSMM) && (
                          String(ad.id).startsWith('synth-') ? (
                            // This row was assembled from leads — there is no campaign
                            // record behind it to edit. Opening the form pre-filled with
                            // its name and platform creates one that those same leads
                            // will match, which is the only way to give it a spend.
                            <button
                              onClick={() => openAdModal({ ...ad, id: null, month: selectedAdMonth && selectedAdMonth !== 'all' ? selectedAdMonth : undefined })}
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                              title="No spend recorded yet — add this campaign so you can enter its spend"
                            >
                              Add spend
                            </button>
                          ) : (
                            <button onClick={() => openAdModal(ad)} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Edit</button>
                          )
                        )}
                      </td>
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

      {/* Ad Campaign Modal — six fields; everything else is derived */}
      {showAdModal && (
        <div className="modal-overlay" onClick={() => setShowAdModal(false)}>
          {/* glass-premium carries the background, border and padding —
              modal-content alone is transparent and unpadded. */}
          <div
            className="modal-content glass-premium"
            style={{ textAlign: 'left', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{editingAd ? 'Edit Campaign' : 'Add Ad Campaign'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-6px' }}>
              Leads, qualified leads and bookings come from the CRM by campaign name and month.
              CTR, CPC, CPL and ROAS are calculated — don't enter them.
            </p>
            <form onSubmit={handleAdSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Platform</label>
                  <select className="form-control" value={adFormData.platform}
                    onChange={e => setAdFormData({ ...adFormData, platform: e.target.value })}>
                    <option value="Meta">Meta</option>
                    <option value="Google">Google</option>
                    <option value="YouTube">YouTube</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Month</label>
                  <input className="form-control" type="month" required value={adFormData.month}
                    onChange={e => setAdFormData({ ...adFormData, month: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Campaign Name</label>
                <input className="form-control" required value={adFormData.ad_campaign_name}
                  placeholder="e.g. Janya IVF - Meta Lead Gen (Aug)"
                  onChange={e => setAdFormData({ ...adFormData, ad_campaign_name: e.target.value })} />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  Leads are matched to this name — keep it identical to the CRM's campaign name.
                </small>
              </div>
              <div className="form-group">
                <label>Total Ad Spend (₹)</label>
                <input className="form-control" type="number" min="0" step="0.01" required
                  value={adFormData.total_ad_spend_inr}
                  onChange={e => setAdFormData({ ...adFormData, total_ad_spend_inr: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Impressions</label>
                  <input className="form-control" type="number" min="0" value={adFormData.impressions}
                    onChange={e => setAdFormData({ ...adFormData, impressions: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Clicks</label>
                  <input className="form-control" type="number" min="0" value={adFormData.clicks}
                    onChange={e => setAdFormData({ ...adFormData, clicks: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Actual Revenue (₹) — optional</label>
                <input className="form-control" type="number" min="0" step="0.01" value={adFormData.revenue_generated}
                  placeholder="Leave blank to estimate from procedure prices"
                  onChange={e => setAdFormData({ ...adFormData, revenue_generated: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingAd ? 'Save Changes' : 'Add Campaign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Procedure Prices Modal */}
      {showPriceModal && (
        <div className="modal-overlay" onClick={() => setShowPriceModal(false)}>
          <div
            className="modal-content glass-premium"
            style={{ textAlign: 'left', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Procedure Prices</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-6px' }}>
              What each procedure is worth. Every booking is valued by what it was actually for,
              so estimated revenue is used only where no actual revenue has been entered.
            </p>
            <form onSubmit={handlePriceSubmit}>
              {priceRows.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No treatment types recorded on this client's leads yet.
                </p>
              ) : (
                // The modal scrolls as a whole; a second scroller in here left
                // the list clipped with its own stray scrollbar.
                <div style={{ marginBottom: '12px' }}>
                  {priceRows.map((row, i) => (
                    <div
                      key={row.treatment_type}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                        padding: '8px 10px', marginBottom: '6px',
                        border: '2px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.treatment_type}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {row.bookings} booking{row.bookings === 1 ? '' : 's'} · {row.leads} lead{row.leads === 1 ? '' : 's'}
                        </div>
                      </div>
                      <input
                        className="form-control" type="number" min="0" step="0.01" placeholder="₹"
                        style={{ width: '120px', flex: '0 0 120px' }}
                        value={row.price_inr}
                        onChange={e => {
                          const next = [...priceRows];
                          next[i] = { ...next[i], price_inr: e.target.value };
                          setPriceRows(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '12px' }}>
                <label>Fallback value per booking (₹)</label>
                <input className="form-control" type="number" min="0" step="0.01" value={defaultBookingValue}
                  placeholder="Used when a booking has no procedure or no price"
                  onChange={e => setDefaultBookingValue(e.target.value)} />
                {priceMeta.untyped > 0 && (
                  <small style={{ color: '#92400e', fontWeight: 700, fontSize: '0.72rem' }}>
                    {priceMeta.untyped} booking{priceMeta.untyped === 1 ? '' : 's'} on this client have no procedure recorded — without a fallback they count as ₹0.
                  </small>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPriceModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Prices</button>
              </div>
            </form>
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
        handleDeleteContent={handleDeleteContent}
        clients={clients}
        staffUsers={staffUsers}
        marketingScripts={marketingScripts}
        freelancers={freelancers}
      />

      {/* Monthly Report Modal */}
      {showMonthlyModal && (
        <div className="modal-overlay" onClick={() => setShowMonthlyModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <h2>{editingMonthly ? 'Edit Monthly Report' : 'Add Monthly Report'}</h2>
            <form onSubmit={handleMonthlyReportSubmit} style={{ marginTop: '20px' }}>
              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
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
