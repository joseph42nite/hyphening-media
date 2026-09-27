import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE } from '../../api.js';

const EMPTY_VENUE_FIELDS = {
  venue_name: '', venue_address: '', venue_city: '', venue_map_link: '',
  venue_poc_name: '', venue_poc_phone: '', venue_poc_email: '', venue_social_links: '',
  venue_gig_confirmed_message: ''
};

export default function ClientsTab({ auth, clients, fetchClients, venues = [], fetchCurationData, showToast }) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  const [clientSearch, setClientSearch] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editingVenueId, setEditingVenueId] = useState(null);
  const [clientFormData, setClientFormData] = useState({
    name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
    parent_id: '', website_url: '', instagram_url: '', youtube_url: '', gsc_property: '', ga4_property_id: '',
    google_ads_customer_id: '', google_ads_login_customer_id: '', meta_ads_account_id: '',
    ...EMPTY_VENUE_FIELDS
  });

  const isCurationType = clientFormData.client_type === 'artist_curation' || clientFormData.client_type === 'both';

  // Parents start closed; opening one is an explicit click, tracked here.
  const [expandedParents, setExpandedParents] = useState(new Set());
  const toggleParentCollapsed = (id) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group children under their parent company so the table can render them as a
  // collapsible dropdown instead of separate flat rows.
  const childrenByParent = {};
  clients.forEach(c => {
    if (c.parent_id) {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    }
  });

  const q = clientSearch.trim().toLowerCase();
  const matchesSearch = (c) => !q || c.name.toLowerCase().includes(q);
  // The Parent Company picker allows chaining a client under another client that
  // already has its own parent, so a group can be more than one level deep —
  // check the whole subtree, not just direct children.
  const subtreeMatchesSearch = (c) => matchesSearch(c) || (childrenByParent[c.id] || []).some(subtreeMatchesSearch);

  const topLevelClients = clients.filter(c => !c.parent_id).filter(subtreeMatchesSearch);

  const openClientModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      const existingVenue = venues.find(v => v.client_id === client.id);
      setEditingVenueId(existingVenue ? existingVenue.id : null);
      setClientFormData({
        name: client.name,
        client_type: client.client_type,
        contact_person: client.contact_person || '',
        contact_email: client.contact_email || '',
        contact_phone: client.contact_phone || '',
        parent_id: client.parent_id || '',
        website_url: client.website_url || '',
        instagram_url: client.instagram_url || '',
        youtube_url: client.youtube_url || '',
        gsc_property: client.gsc_property || '',
        ga4_property_id: client.ga4_property_id || '',
        google_ads_customer_id: client.google_ads_customer_id || '',
        google_ads_login_customer_id: client.google_ads_login_customer_id || '',
        meta_ads_account_id: client.meta_ads_account_id || '',
        venue_name: existingVenue?.name || '',
        venue_address: existingVenue?.address || '',
        venue_city: existingVenue?.city || '',
        venue_map_link: existingVenue?.map_link || '',
        venue_poc_name: existingVenue?.poc_name || '',
        venue_poc_phone: existingVenue?.poc_phone || '',
        venue_poc_email: existingVenue?.poc_email || '',
        venue_social_links: existingVenue?.social_links || '',
        venue_gig_confirmed_message: existingVenue?.gig_confirmed_message || ''
      });
    } else {
      setEditingClient(null);
      setEditingVenueId(null);
      setClientFormData({
        name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
        parent_id: '', website_url: '', instagram_url: '', youtube_url: '', gsc_property: '', ga4_property_id: '',
        google_ads_customer_id: '', google_ads_login_customer_id: '', meta_ads_account_id: '',
        ...EMPTY_VENUE_FIELDS
      });
    }
    setShowClientModal(true);
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
    const method = editingClient ? 'PATCH' : 'POST';
    const isCuration = clientFormData.client_type === 'artist_curation' || clientFormData.client_type === 'both';
    const { venue_name, venue_address, venue_city, venue_map_link, venue_poc_name, venue_poc_phone,
      venue_poc_email, venue_social_links, venue_gig_confirmed_message, ...clientPayload } = clientFormData;
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (isCuration) {
        const venuePayload = {
          name: venue_name.trim() || clientPayload.name.trim(),
          address: venue_address || null,
          city: venue_city || null,
          map_link: venue_map_link || null,
          poc_name: venue_poc_name || null,
          poc_phone: venue_poc_phone || null,
          poc_email: venue_poc_email || null,
          social_links: venue_social_links || null,
          gig_confirmed_message: venue_gig_confirmed_message || null,
          client_id: data.id
        };
        const venueUrl = editingVenueId ? `/api/artists/venues/${editingVenueId}` : '/api/artists/venues';
        const venueMethod = editingVenueId ? 'PATCH' : 'POST';
        try {
          const venueRes = await fetch(`${API_BASE}${venueUrl}`, {
            method: venueMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venuePayload),
            credentials: 'include'
          });
          if (!venueRes.ok) {
            const venueErr = await venueRes.json();
            throw new Error(venueErr.error || 'Failed to save venue');
          }
          if (fetchCurationData) fetchCurationData();
        } catch (venueErr) {
          showToast(`Client saved, but venue setup failed: ${venueErr.message}`, 'warning');
        }
      }

      showToast(`Client ${editingClient ? 'updated' : 'created'} successfully`, 'success');
      setShowClientModal(false);
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const togglePortal = async (client, enable) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_enabled: enable ? 1 : 0 }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to update portal state');
      showToast(`Portal ${enable ? 'enabled' : 'disabled'}`, 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const generatePortalToken = async (client) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal/token`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('New secure token generated', 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const setPortalPin = async (client) => {
    const pin = prompt('Enter a new 4-digit PIN for the client (leave empty to disable PIN protection):');
    if (pin === null) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || null }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to set PIN');
      showToast(pin ? 'PIN updated successfully' : 'PIN protection removed', 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteClient = async (client) => {
    if (!client) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${client.name}"?\n\nThis will remove the client, client portal credentials, and all associated marketing content, scripts, leads, campaigns, and tasks.\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete client');
      showToast(`Client "${client.name}" deleted successfully`, 'success');
      setShowClientModal(false);
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const renderClientRow = (client, { depth = 0, hasChildren = false, isCollapsed = false } = {}) => (
    <tr key={client.id} style={depth > 0 ? { background: 'rgba(255, 255, 255, 0.015)' } : undefined}>
      <td style={{ fontWeight: 'bold' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: depth * 22 }}>
          {hasChildren ? (
            <button
              onClick={() => toggleParentCollapsed(client.id)}
              aria-label={isCollapsed ? 'Expand companies' : 'Collapse companies'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : depth > 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>↳</span>
          ) : null}
          <span>{client.name}</span>
          {hasChildren && (
            <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
              {(childrenByParent[client.id] || []).length}
            </span>
          )}
        </div>
      </td>
      <td><span className="badge badge-info">{client.client_type}</span></td>
      <td>
        <div>{client.contact_person}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.contact_email}</div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {client.website_url && (
            <a href={client.website_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--accent)' }}>Website</a>
          )}
          {client.instagram_url && (
            <a href={client.instagram_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--accent)' }}>Instagram</a>
          )}
          {client.youtube_url && (
            <a href={client.youtube_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--accent)' }}>YouTube</a>
          )}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`badge badge-${client.portal_enabled ? 'success' : 'muted'}`}>
              {client.portal_enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={() => togglePortal(client, !client.portal_enabled)}
              className="btn btn-secondary"
              style={{ padding: '2px 6px', fontSize: '0.7rem' }}
            >
              {client.portal_enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          {client.portal_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {client.portal_token ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/portal/${client.portal_token}`;
                      navigator.clipboard.writeText(url);
                      showToast('Portal link copied to clipboard!', 'success');
                    }}
                    className="btn btn-primary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
                  >
                    Copy Portal Link
                  </button>
                  {(client.client_type === 'marketing' || client.client_type === 'both') && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/api/portal/${client.portal_token}/leads/capture`;
                        navigator.clipboard.writeText(url);
                        showToast('Lead capture webhook URL copied!', 'success');
                      }}
                      className="btn btn-primary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content', background: '#0ea5e9', border: 'none' }}
                      title="Copy Lead Capture Webhook API URL for Ads Manager"
                    >
                      Copy Webhook URL
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => generatePortalToken(client)}
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
                >
                  Generate Token
                </button>
              )}
              <button
                onClick={() => setPortalPin(client)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
              >
                {client.has_portal_pin ? 'Change PIN' : 'Set PIN'}
              </button>
            </div>
          )}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => openClientModal(client)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
            Edit
          </button>
          <button
            onClick={() => handleDeleteClient(client)}
            className="btn btn-danger"
            style={{ padding: '6px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            title={`Delete ${client.name}`}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </td>
    </tr>
  );

  const renderClientTree = (client, depth = 0) => {
    const kids = childrenByParent[client.id] || [];
    // While searching, force parents open so a matching child isn't hidden
    // behind a closed dropdown; otherwise respect the manual toggle (closed by default).
    const isCollapsed = q ? false : !expandedParents.has(client.id);
    return (
      <React.Fragment key={client.id}>
        {renderClientRow(client, { depth, hasChildren: kids.length > 0, isCollapsed })}
        {kids.length > 0 && !isCollapsed && kids.map(child => renderClientTree(child, depth + 1))}
      </React.Fragment>
    );
  };

  if (!isAdmin) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-search">
          <input
            type="text"
            className="form-control"
            placeholder="Filter clients..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
          />
        </div>
        <button onClick={() => openClientModal()} className="btn btn-primary">
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Contact Info</th>
              <th>Links</th>
              <th>Client Portal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topLevelClients.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No clients found</td>
              </tr>
            ) : (
              topLevelClients.map(client => renderClientTree(client))
            )}
          </tbody>
        </table>
      </div>

      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingClient ? 'Edit Client' : 'Add Client'}</h2>
            <form onSubmit={handleClientSubmit} style={{ marginTop: '20px' }}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Client Name</label>
                  <input type="text" className="form-control" value={clientFormData.name} onChange={e => setClientFormData({...clientFormData, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Type</label>
                  <select className="form-control" value={clientFormData.client_type} onChange={e => setClientFormData({...clientFormData, client_type: e.target.value})}>
                    <option value="marketing">Marketing</option>
                    <option value="artist_curation">Artist Curation</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Parent Company / Group</label>
                <select className="form-control" value={clientFormData.parent_id || ''} onChange={e => setClientFormData({...clientFormData, parent_id: e.target.value})}>
                  <option value="">None (Standalone Client)</option>
                  {clients.filter(c => !editingClient || c.id !== editingClient.id).map(c => (
                    <option key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input type="text" className="form-control" value={clientFormData.contact_person} onChange={e => setClientFormData({...clientFormData, contact_person: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={clientFormData.contact_email} onChange={e => setClientFormData({...clientFormData, contact_email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-control" value={clientFormData.contact_phone} onChange={e => setClientFormData({...clientFormData, contact_phone: e.target.value})} />
                </div>
              </div>

              {isCurationType && (
                <>
                  <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Booking Venue Details</h4>
                  <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Saving this client creates (or updates) a matching venue automatically, so it shows up in the
                    Location dropdown when adding a Gig Status — no need to add it separately in Venue List.
                  </p>
                  <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Venue / Location Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={clientFormData.name || 'Same as client name'}
                        value={clientFormData.venue_name}
                        onChange={e => setClientFormData({...clientFormData, venue_name: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input type="text" className="form-control" value={clientFormData.venue_city} onChange={e => setClientFormData({...clientFormData, venue_city: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Address</label>
                      <input type="text" className="form-control" value={clientFormData.venue_address} onChange={e => setClientFormData({...clientFormData, venue_address: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Google Maps Link</label>
                      <input type="url" className="form-control" value={clientFormData.venue_map_link} onChange={e => setClientFormData({...clientFormData, venue_map_link: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-grid-3" style={{ marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">POC Name</label>
                      <input type="text" className="form-control" value={clientFormData.venue_poc_name} onChange={e => setClientFormData({...clientFormData, venue_poc_name: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">POC Phone</label>
                      <input type="text" className="form-control" value={clientFormData.venue_poc_phone} onChange={e => setClientFormData({...clientFormData, venue_poc_phone: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">POC Email</label>
                      <input type="email" className="form-control" value={clientFormData.venue_poc_email} onChange={e => setClientFormData({...clientFormData, venue_poc_email: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Social Links (Instagram/Website/Other)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. instagram.com/venue"
                      value={clientFormData.venue_social_links}
                      onChange={e => setClientFormData({...clientFormData, venue_social_links: e.target.value})}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Gig Confirmed Message (Telegram DM Template)</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Hey {{artist_name}}! Confirmed: {{gig_date}} at {{venue_name}}..."
                      value={clientFormData.venue_gig_confirmed_message}
                      onChange={e => setClientFormData({...clientFormData, venue_gig_confirmed_message: e.target.value})}
                    />
                  </div>
                </>
              )}

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Public Profile Links</h4>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Website URL</label>
                  <input type="url" className="form-control" placeholder="https://..." value={clientFormData.website_url} onChange={e => setClientFormData({...clientFormData, website_url: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Instagram Profile URL</label>
                  <input type="url" className="form-control" placeholder="https://..." value={clientFormData.instagram_url} onChange={e => setClientFormData({...clientFormData, instagram_url: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube Channel URL</label>
                  <input type="url" className="form-control" placeholder="https://..." value={clientFormData.youtube_url} onChange={e => setClientFormData({...clientFormData, youtube_url: e.target.value})} />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>SEO Data Sources</h4>
              <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Stored per client, never shared. A global default would return one client's search
                data during another client's audit. Grant{' '}
                <code style={{ fontSize: '0.72rem' }}>claudeseo@fit-sanctum-454909-s0.iam.gserviceaccount.com</code>{' '}
                access in each property first.
              </p>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Search Console Property</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="sc-domain:example.com or https://www.example.com/"
                    value={clientFormData.gsc_property}
                    onChange={e => setClientFormData({...clientFormData, gsc_property: e.target.value})}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Copy the exact form shown in Search Console — a domain property and a URL-prefix
                    property are different and not interchangeable.
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">GA4 Property ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="370846881"
                    value={clientFormData.ga4_property_id}
                    onChange={e => setClientFormData({...clientFormData, ga4_property_id: e.target.value})}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    GA4 → Admin → Property Settings. The plain number, not the G- measurement ID.
                  </small>
                </div>
              </div>

              {/* Labels, not connections.
                  Sitting under a heading that said "Read by the Ads Monitor",
                  these read as a data source — an account ID was entered and
                  campaign data was expected to appear. Nothing in this system
                  talks to Google Ads or Meta, so the heading now says what
                  these are and the note says where the numbers actually come
                  from. */}
              <h4 style={{ margin: '20px 0 4px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
                Ad accounts
              </h4>
              <div style={{
                margin: '0 0 12px', padding: '8px 10px', borderRadius: 6,
                background: 'rgba(74, 222, 128, 0.06)',
                border: '1px solid rgba(74, 222, 128, 0.22)',
                fontSize: '0.76rem', color: 'rgba(223, 231, 224, 0.8)', lineHeight: 1.5,
              }}>
                <strong style={{ color: '#4ade80' }}>Google Ads imports automatically.</strong>{' '}
                Set the customer ID and the Ads Monitor pulls campaigns, spend, impressions, clicks
                and ad groups on its own — daily, and on demand from the Sync button.
                <br />
                <span style={{ color: 'var(--text-muted)' }}>
                  Meta has no connection yet, so its numbers are still entered by hand under
                  Marketing Data → Ad Campaigns Performance. Rows entered by hand are never
                  overwritten by a sync.
                </span>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Google Ads Customer ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="123-456-7890"
                    value={clientFormData.google_ads_customer_id}
                    onChange={e => setClientFormData({...clientFormData, google_ads_customer_id: e.target.value})}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    10 digits, no dashes. This is what the sync reads — set it and the Ads Monitor
                    starts importing this account's campaigns.
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">Google Ads Manager ID <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— optional</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Only if reached through an MCC"
                    value={clientFormData.google_ads_login_customer_id}
                    onChange={e => setClientFormData({...clientFormData, google_ads_login_customer_id: e.target.value})}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Leave blank when the account is accessed directly. If it sits under a manager
                    account and this is missing, the sync fails with a permission error that never
                    mentions the real cause.
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">Meta Ads Account ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="act_1234567890"
                    value={clientFormData.meta_ads_account_id}
                    onChange={e => setClientFormData({...clientFormData, meta_ads_account_id: e.target.value})}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    From Meta Ads Manager. Reference only: entering it connects nothing and
                    fetches nothing.
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                {editingClient ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                    onClick={() => handleDeleteClient(editingClient)}
                  >
                    <Trash2 size={15} /> Delete Client
                  </button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowClientModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingClient ? 'Update Client' : 'Save Client'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
