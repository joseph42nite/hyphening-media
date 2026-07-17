import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function ClientsTab({ auth, clients, fetchClients, showToast }) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  const [clientSearch, setClientSearch] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientFormData, setClientFormData] = useState({
    name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
    calendar_sync_link: '', drive_folder_link: '', instagram_business_account_id: '',
    instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: '',
    parent_id: '', website_url: '', instagram_url: '', youtube_url: ''
  });

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const openClientModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setClientFormData({
        name: client.name,
        client_type: client.client_type,
        contact_person: client.contact_person || '',
        contact_email: client.contact_email || '',
        contact_phone: client.contact_phone || '',
        calendar_sync_link: client.calendar_sync_link || '',
        drive_folder_link: client.drive_folder_link || '',
        instagram_business_account_id: client.instagram_business_account_id || '',
        instagram_access_token: '',
        youtube_channel_id: client.youtube_channel_id || '',
        youtube_api_key: '',
        google_ads_customer_id: client.google_ads_customer_id || '',
        parent_id: client.parent_id || '',
        website_url: client.website_url || '',
        instagram_url: client.instagram_url || '',
        youtube_url: client.youtube_url || ''
      });
    } else {
      setEditingClient(null);
      setClientFormData({
        name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
        calendar_sync_link: '', drive_folder_link: '', instagram_business_account_id: '',
        instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: '',
        parent_id: '', website_url: '', instagram_url: '', youtube_url: ''
      });
    }
    setShowClientModal(true);
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
    const method = editingClient ? 'PATCH' : 'POST';
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientFormData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
              <th>API Integration</th>
              <th>Client Portal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.id}>
                <td style={{ fontWeight: 'bold' }}>
                  {client.name}
                  {client.parent_name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '2px' }}>
                      Company: <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{client.parent_name}</span>
                    </div>
                  )}
                </td>
                <td><span className="badge badge-info">{client.client_type}</span></td>
                <td>
                  <div>{client.contact_person}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.contact_email}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className={`badge ${client.instagram_business_account_id ? 'badge-success' : 'badge-muted'}`}>Instagram API</span>
                    <span className={`badge ${client.youtube_channel_id ? 'badge-success' : 'badge-muted'}`}>YouTube API</span>
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingClient ? 'Edit Client' : 'Add Client'}</h2>
            <form onSubmit={handleClientSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Integrations &amp; Links</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Calendar Sync Link</label>
                  <input type="url" className="form-control" value={clientFormData.calendar_sync_link} onChange={e => setClientFormData({...clientFormData, calendar_sync_link: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Drive Folder Link</label>
                  <input type="url" className="form-control" value={clientFormData.drive_folder_link} onChange={e => setClientFormData({...clientFormData, drive_folder_link: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Instagram Business ID</label>
                  <input type="text" className="form-control" value={clientFormData.instagram_business_account_id} onChange={e => setClientFormData({...clientFormData, instagram_business_account_id: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Instagram Token (encrypted)</label>
                  <input type="password" className="form-control" placeholder="Enter new token to overwrite" value={clientFormData.instagram_access_token} onChange={e => setClientFormData({...clientFormData, instagram_access_token: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">YouTube Channel ID</label>
                  <input type="text" className="form-control" value={clientFormData.youtube_channel_id} onChange={e => setClientFormData({...clientFormData, youtube_channel_id: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube API Key (encrypted)</label>
                  <input type="password" className="form-control" placeholder="Enter new API key to overwrite" value={clientFormData.youtube_api_key} onChange={e => setClientFormData({...clientFormData, youtube_api_key: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Google Ads Customer ID</label>
                <input type="text" className="form-control" value={clientFormData.google_ads_customer_id} onChange={e => setClientFormData({...clientFormData, google_ads_customer_id: e.target.value})} />
              </div>

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Public Profile Links</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowClientModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Client</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
