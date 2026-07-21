import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function ArtistCurationTab({
  auth,
  gigs,
  artists,
  venues,
  fetchCurationData,
  showToast,
  formatDateStr,
  clients
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSuperAdmin = auth?.role === 'super_admin';
  const isSMM = auth?.role === 'ops_social_media_manager';

  // Pagination states
  const [gigsPage, setGigsPage] = useState(1);
  const [gigsLimit, setGigsLimit] = useState(10);
  const [artistsPage, setArtistsPage] = useState(1);
  const [artistsLimit, setArtistsLimit] = useState(10);

  // Bank decryption state
  const [decryptedBank, setDecryptedBank] = useState({});

  // Modals visibility states
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [venueFormData, setVenueFormData] = useState({
    name: '', address: '', city: '', map_link: '', poc_name: '', poc_phone: '', poc_email: '', social_links: '', gig_confirmed_message: '', client_id: ''
  });

  const [showArtistModal, setShowArtistModal] = useState(false);
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistFormData, setArtistFormData] = useState({
    name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: '',
    instruments: '', insta_link: '', description: '', rating: '', notes: ''
  });

  const [showGigModal, setShowGigModal] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [gigFormData, setGigFormData] = useState({
    artist_id: '', venue_id: '', gig_date: '', fee_inr: '0', advance_paid: '0', status: 'Pending', swiggy_link: '', zomato_link: ''
  });

  // Autocomplete search states inside modals
  const [artistSearch, setArtistSearch] = useState('');
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);

  // Bank decryption handler
  const decryptBankDetails = async (artistId) => {
    try {
      const res = await fetch(`${API_BASE}/api/artists/${artistId}/bank`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDecryptedBank(prev => ({ ...prev, [artistId]: data.bank_details }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Venue CRUD handlers
  const openVenueModal = (venue = null) => {
    if (venue) {
      setEditingVenue(venue);
      setVenueFormData({
        name: venue.name,
        address: venue.address || '',
        city: venue.city || '',
        map_link: venue.map_link || '',
        poc_name: venue.poc_name || '',
        poc_phone: venue.poc_phone || '',
        poc_email: venue.poc_email || '',
        social_links: venue.social_links || '',
        gig_confirmed_message: venue.gig_confirmed_message || '',
        client_id: venue.client_id || ''
      });
    } else {
      setEditingVenue(null);
      setVenueFormData({
        name: '', address: '', city: '', map_link: '', poc_name: '', poc_phone: '', poc_email: '', social_links: '', gig_confirmed_message: '', client_id: ''
      });
    }
    setShowVenueModal(true);
  };

  const handleVenueSubmit = async (e) => {
    e.preventDefault();
    const url = editingVenue ? `/api/artists/venues/${editingVenue.id}` : '/api/artists/venues';
    const method = editingVenue ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...venueFormData,
          client_id: venueFormData.client_id ? parseInt(venueFormData.client_id) : null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit venue data');

      showToast(`Venue ${editingVenue ? 'updated' : 'added'} successfully`, 'success');
      setShowVenueModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Artist CRUD handlers
  const openArtistModal = (artist = null) => {
    if (artist) {
      setEditingArtist(artist);
      setArtistFormData({
        name: artist.name,
        category: artist.category || '',
        city: artist.city || '',
        phone: artist.phone || '',
        email: artist.email || '',
        telegram_chat_id: artist.telegram_chat_id || '',
        bank_details: '', // Leave blank unless updating
        instruments: artist.instruments || '',
        insta_link: artist.insta_link || '',
        description: artist.description || '',
        rating: artist.rating !== null && artist.rating !== undefined ? String(artist.rating) : '',
        notes: artist.notes || ''
      });
    } else {
      setEditingArtist(null);
      setArtistFormData({
        name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: '',
        instruments: '', insta_link: '', description: '', rating: '', notes: ''
      });
    }
    setShowArtistModal(true);
  };

  const handleArtistSubmit = async (e) => {
    e.preventDefault();
    const url = editingArtist ? `/api/artists/${editingArtist.id}` : '/api/artists';
    const method = editingArtist ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...artistFormData,
          rating: artistFormData.rating ? parseInt(artistFormData.rating) : null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Artist ${editingArtist ? 'updated' : 'added'} successfully`, 'success');
      setShowArtistModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Gig CRUD handlers
  const openGigModal = (gig = null) => {
    if (gig) {
      setEditingGig(gig);
      setGigFormData({
        artist_id: gig.artist_id || '',
        venue_id: gig.venue_id || '',
        gig_date: gig.gig_date || '',
        fee_inr: gig.fee_inr !== null && gig.fee_inr !== undefined ? String(gig.fee_inr) : '0',
        advance_paid: gig.advance_paid !== null && gig.advance_paid !== undefined ? String(gig.advance_paid) : '0',
        status: gig.status || 'Pending',
        swiggy_link: gig.swiggy_link || '',
        zomato_link: gig.zomato_link || ''
      });
      const artist = artists.find(a => a.id === gig.artist_id);
      setArtistSearch(artist ? `${artist.name} (${artist.category || 'No Category'})` : '');
      const venue = venues.find(v => v.id === gig.venue_id);
      setVenueSearch(venue ? venue.name : '');
    } else {
      setEditingGig(null);
      const defaultArtist = artists.length > 0 ? artists[0] : null;
      const defaultVenue = venues.length > 0 ? venues[0] : null;
      setGigFormData({
        artist_id: defaultArtist ? String(defaultArtist.id) : '',
        venue_id: defaultVenue ? String(defaultVenue.id) : '',
        gig_date: new Date().toISOString().split('T')[0],
        fee_inr: '0',
        advance_paid: '0',
        status: 'Pending',
        swiggy_link: '',
        zomato_link: ''
      });
      setArtistSearch(defaultArtist ? `${defaultArtist.name} (${defaultArtist.category || 'No Category'})` : '');
      setVenueSearch(defaultVenue ? defaultVenue.name : '');
    }
    setShowGigModal(true);
  };

  const handleGigSubmit = async (e) => {
    e.preventDefault();
    const url = editingGig ? `/api/artists/gigs/${editingGig.id}` : '/api/artists/gigs';
    const method = editingGig ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: parseInt(gigFormData.artist_id),
          venue_id: gigFormData.venue_id ? parseInt(gigFormData.venue_id) : null,
          gig_date: gigFormData.gig_date,
          fee_inr: gigFormData.fee_inr ? parseFloat(gigFormData.fee_inr) : 0,
          advance_paid: gigFormData.advance_paid ? parseFloat(gigFormData.advance_paid) : 0,
          status: gigFormData.status,
          swiggy_link: gigFormData.swiggy_link || null,
          zomato_link: gigFormData.zomato_link || null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit gig data');

      showToast(`Gig ${editingGig ? 'updated' : 'added'} successfully`, 'success');
      setShowGigModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleGigDelete = async (gigId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/artists/gigs/${gigId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete event');

      showToast('Event deleted successfully', 'success');
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!isAdmin && !isSMM) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      
      {/* Gig Status Tracker */}
      <div className="dashboard-toolbar">
        <h3>Gig Status Tracker</h3>
        <button onClick={() => openGigModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Gig
        </button>
      </div>
      <div className="table-container table-scrollable-y" style={{ marginBottom: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Artist ID</th>
              <th>Artist Name</th>
              <th>Date</th>
              <th>Location</th>
              <th>Payment (₹)</th>
              <th>Status</th>
              <th>Advance Paid</th>
              <th>Links</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gigs.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No gigs found</td>
              </tr>
            ) : (
              gigs.slice((gigsPage - 1) * gigsLimit, gigsPage * gigsLimit).map(g => (
                <tr key={g.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{g.artist_code || '-'}</td>
                  <td style={{ fontWeight: 'bold' }}>{g.artist_name || '-'}</td>
                  <td>{formatDateStr(g.gig_date)}</td>
                  <td>{g.venue_name || '-'}</td>
                  <td>₹{g.fee_inr !== null ? g.fee_inr.toLocaleString('en-IN') : '0'}</td>
                  <td>
                    <span className={`badge badge-${
                      g.status === 'Paid' || g.status === 'Confirmed' ? 'success' :
                      g.status === 'Pending' ? 'warning' :
                      g.status === 'Cancelled' ? 'danger' : 'info'
                    }`}>
                      {g.status}
                    </span>
                  </td>
                  <td>₹{g.advance_paid !== null ? g.advance_paid.toLocaleString('en-IN') : '0'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {g.swiggy_link ? (
                        <a href={g.swiggy_link} target="_blank" rel="noopener noreferrer" className="badge" style={{ background: '#fc8019', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Swiggy
                        </a>
                      ) : null}
                      {g.zomato_link ? (
                        <a href={g.zomato_link} target="_blank" rel="noopener noreferrer" className="badge" style={{ background: '#cb202d', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Zomato
                        </a>
                      ) : null}
                      {!g.swiggy_link && !g.zomato_link && '-'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => openGigModal(g)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                        Edit
                      </button>
                      <button onClick={() => handleGigDelete(g.id)} className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls for Gigs */}
      {gigs.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
            Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((gigsPage - 1) * gigsLimit + 1, gigs.length)}</span> to{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(gigsPage * gigsLimit, gigs.length)}</span> of{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{gigs.length}</span> entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
              <select
                className="form-control"
                value={gigsLimit}
                onChange={(e) => {
                  setGigsLimit(parseInt(e.target.value));
                  setGigsPage(1);
                }}
                style={{ width: 'auto', padding: '8px 16px 8px 12px', height: 'auto', fontSize: '0.85rem', borderWidth: '2px', cursor: 'pointer' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={gigsPage === 1} onClick={() => setGigsPage(1)}>First</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={gigsPage === 1} onClick={() => setGigsPage(gigsPage - 1)}>Prev</button>

              {(() => {
                const totalPages = Math.ceil(gigs.length / gigsLimit);
                const buttons = [];
                const startPage = Math.max(1, gigsPage - 2);
                const endPage = Math.min(totalPages, gigsPage + 2);
                for (let i = startPage; i <= endPage; i++) {
                  buttons.push(
                    <button key={i} className={`btn ${gigsPage === i ? 'btn-primary' : ''}`} style={{ padding: '8px 12px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: gigsPage === i ? 'none' : '2px 2px 0px #000', minWidth: '32px' }} onClick={() => setGigsPage(i)}>
                      {i}
                    </button>
                  );
                }
                return buttons;
              })()}

              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={gigsPage >= Math.ceil(gigs.length / gigsLimit)} onClick={() => setGigsPage(gigsPage + 1)}>Next</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={gigsPage >= Math.ceil(gigs.length / gigsLimit)} onClick={() => setGigsPage(Math.ceil(gigs.length / gigsLimit))}>Last</button>
            </div>
          </div>
        </div>
      )}

      {/* Roster & Encrypted Details */}
      <div className="dashboard-toolbar">
        <h3>Artist Roster (Client Specific)</h3>
        <button onClick={() => openArtistModal()} className="btn btn-primary">
          <Plus size={16} /> Add Artist
        </button>
      </div>
      <div className="table-container table-scrollable-y" style={{ marginBottom: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Artist Name</th>
              <th>Category</th>
              <th>Phone Number</th>
              <th>Instruments</th>
              <th>Insta Link</th>
              <th>Description</th>
              <th>Email</th>
              <th>City</th>
              <th>Total Performances</th>
              <th>Perf. with M-</th>
              <th>Last Perf. Date</th>
              <th>Average Fee (₹)</th>
              <th>Payment Status</th>
              <th>Rating (1-10)</th>
              <th>Reliability Score</th>
              <th>Notes</th>
              <th>Bank Details</th>
              <th>Total Amount Paid</th>
              <th>Total Amount Pending</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {artists.slice((artistsPage - 1) * artistsLimit, artistsPage * artistsLimit).map(art => (
              <tr key={art.id}>
                <td style={{ fontWeight: 'bold' }}>{art.name}</td>
                <td>{art.category || '-'}</td>
                <td>{art.phone || '-'}</td>
                <td>{art.instruments || '-'}</td>
                <td>
                  {art.insta_link ? (
                    <a href={art.insta_link.startsWith('http') ? art.insta_link : `https://${art.insta_link}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>
                      {art.insta_link}
                    </a>
                  ) : '-'}
                </td>
                <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={art.description}>
                  {art.description || '-'}
                </td>
                <td>{art.email || '-'}</td>
                <td>{art.city || '-'}</td>
                <td>{art.total_performances}</td>
                <td>{art.perf_with_m}</td>
                <td>{art.last_perf_date}</td>
                <td>₹{art.average_fee_inr ? art.average_fee_inr.toLocaleString('en-IN') : '0'}</td>
                <td>{art.payment_status}</td>
                <td>{art.rating || '-'}</td>
                <td>{art.reliability_score !== null && art.reliability_score !== undefined ? `${art.reliability_score}%` : 'N/A'}</td>
                <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={art.notes}>
                  {art.notes || '-'}
                </td>
                <td>
                  {decryptedBank[art.id] ? (
                    <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{decryptedBank[art.id]}</span>
                  ) : (
                    <button
                      onClick={() => decryptBankDetails(art.id)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                      disabled={!isSuperAdmin}
                      title={!isSuperAdmin ? 'Only Super Admin can decrypt bank credentials' : ''}
                    >
                      Reveal Bank Info
                    </button>
                  )}
                </td>
                <td>₹{art.total_amount_paid_inr ? art.total_amount_paid_inr.toLocaleString('en-IN') : '0'}</td>
                <td>₹{art.total_amount_pending_inr ? art.total_amount_pending_inr.toLocaleString('en-IN') : '0'}</td>
                <td>
                  <button onClick={() => openArtistModal(art)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls for Artists */}
      {artists.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
            Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((artistsPage - 1) * artistsLimit + 1, artists.length)}</span> to{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(artistsPage * artistsLimit, artists.length)}</span> of{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{artists.length}</span> entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
              <select
                className="form-control"
                value={artistsLimit}
                onChange={(e) => {
                  setArtistsLimit(parseInt(e.target.value));
                  setArtistsPage(1);
                }}
                style={{ width: 'auto', padding: '8px 16px 8px 12px', height: 'auto', fontSize: '0.85rem', borderWidth: '2px', cursor: 'pointer' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={artistsPage === 1} onClick={() => setArtistsPage(1)}>First</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={artistsPage === 1} onClick={() => setArtistsPage(artistsPage - 1)}>Prev</button>

              {(() => {
                const totalPages = Math.ceil(artists.length / artistsLimit);
                const buttons = [];
                const startPage = Math.max(1, artistsPage - 2);
                const endPage = Math.min(totalPages, artistsPage + 2);
                for (let i = startPage; i <= endPage; i++) {
                  buttons.push(
                    <button key={i} className={`btn ${artistsPage === i ? 'btn-primary' : ''}`} style={{ padding: '8px 12px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: artistsPage === i ? 'none' : '2px 2px 0px #000', minWidth: '32px' }} onClick={() => setArtistsPage(i)}>
                      {i}
                    </button>
                  );
                }
                return buttons;
              })()}

              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={artistsPage >= Math.ceil(artists.length / artistsLimit)} onClick={() => setArtistsPage(artistsPage + 1)}>Next</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={artistsPage >= Math.ceil(artists.length / artistsLimit)} onClick={() => setArtistsPage(Math.ceil(artists.length / artistsLimit))}>Last</button>
            </div>
          </div>
        </div>
      )}

      {/* Venues Table */}
      <div className="dashboard-toolbar">
        <h3>Venue List</h3>
        <button onClick={() => openVenueModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Venue
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Location Name</th>
              <th>Address</th>
              <th>Google Maps Link</th>
              <th>POC Name</th>
              <th>POC Phone</th>
              <th>POC Email</th>
              <th>Social Links</th>
              <th>Telegram Template</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {venues.map(v => (
              <tr key={v.id}>
                <td>{v.client_name || '-'}</td>
                <td style={{ fontWeight: 'bold' }}>{v.name}</td>
                <td>{v.address || '-'}</td>
                <td>
                  {v.map_link ? (
                    <a href={v.map_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                      View Map
                    </a>
                  ) : '-'}
                </td>
                <td>{v.poc_name || '-'}</td>
                <td>{v.poc_phone || '-'}</td>
                <td>{v.poc_email || '-'}</td>
                <td>{v.social_links || '-'}</td>
                <td style={{ fontSize: '0.75rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.gig_confirmed_message}>
                  {v.gig_confirmed_message || '-'}
                </td>
                <td>
                  <button onClick={() => openVenueModal(v)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Artist Modal */}
      {showArtistModal && (
        <div className="modal-overlay" onClick={() => setShowArtistModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingArtist ? 'Edit Artist Details' : 'Add Artist to Roster'}</h2>
            <form onSubmit={handleArtistSubmit} style={{ marginTop: '20px' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={artistFormData.name}
                  onChange={e => setArtistFormData({...artistFormData, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Jazz Vocalist"
                    value={artistFormData.category}
                    onChange={e => setArtistFormData({...artistFormData, category: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Mumbai"
                    value={artistFormData.city}
                    onChange={e => setArtistFormData({...artistFormData, city: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={artistFormData.phone}
                    onChange={e => setArtistFormData({...artistFormData, phone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={artistFormData.email}
                    onChange={e => setArtistFormData({...artistFormData, email: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Instruments</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Guitar, Drums"
                    value={artistFormData.instruments}
                    onChange={e => setArtistFormData({...artistFormData, instruments: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Insta Link</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. instagram.com/artist"
                    value={artistFormData.insta_link}
                    onChange={e => setArtistFormData({...artistFormData, insta_link: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Short summary..."
                    value={artistFormData.description}
                    onChange={e => setArtistFormData({...artistFormData, description: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rating (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-control"
                    placeholder="e.g. 8"
                    value={artistFormData.rating}
                    onChange={e => setArtistFormData({...artistFormData, rating: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Telegram Chat ID</label>
                <input
                  type="text"
                  className="form-control"
                  value={artistFormData.telegram_chat_id}
                  onChange={e => setArtistFormData({...artistFormData, telegram_chat_id: e.target.value})}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Bank Details (Super Admin only can decrypt)</label>
                  <textarea
                    className="form-control"
                    placeholder="Enter Bank Details..."
                    value={artistFormData.bank_details}
                    onChange={e => setArtistFormData({...artistFormData, bank_details: e.target.value})}
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Onboarding notes..."
                    value={artistFormData.notes}
                    onChange={e => setArtistFormData({...artistFormData, notes: e.target.value})}
                    rows={2}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowArtistModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Artist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Venue Modal */}
      {showVenueModal && (
        <div className="modal-overlay" onClick={() => setShowVenueModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingVenue ? 'Edit Venue Details' : 'Add Venue'}</h2>
            <form onSubmit={handleVenueSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Client Name (Association)</label>
                  <select
                    className="form-control"
                    value={venueFormData.client_id}
                    onChange={e => setVenueFormData({ ...venueFormData, client_id: e.target.value })}
                  >
                    <option value="">Select Client (None)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Location / Venue Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.name}
                    onChange={e => setVenueFormData({ ...venueFormData, name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.address}
                    onChange={e => setVenueFormData({ ...venueFormData, address: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.city}
                    onChange={e => setVenueFormData({ ...venueFormData, city: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Google Maps Link</label>
                  <input
                    type="url"
                    className="form-control"
                    value={venueFormData.map_link}
                    onChange={e => setVenueFormData({ ...venueFormData, map_link: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Social Links (Instagram/Website/Other)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. instagram.com/venue"
                    value={venueFormData.social_links}
                    onChange={e => setVenueFormData({ ...venueFormData, social_links: e.target.value })}
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Point of Contact (POC)</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">POC Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.poc_name}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">POC Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.poc_phone}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">POC Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={venueFormData.poc_email}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Gig Confirmed Message (Telegram DM Template)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Hey {{artist_name}}! Confirmed: {{gig_date}} at {{venue_name}}..."
                  value={venueFormData.gig_confirmed_message}
                  onChange={e => setVenueFormData({ ...venueFormData, gig_confirmed_message: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowVenueModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Venue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gig Modal */}
      {showGigModal && (
        <div className="modal-overlay" onClick={() => setShowGigModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingGig ? 'Edit Gig Status' : 'Add Gig Status'}</h2>
            <form onSubmit={handleGigSubmit} style={{ marginTop: '20px' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Artist</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search artist..."
                    value={artistSearch}
                    onChange={e => {
                      setArtistSearch(e.target.value);
                      setShowArtistDropdown(true);
                      const match = artists.find(a =>
                        `${a.name} (${a.category || 'No Category'})` === e.target.value ||
                        a.name === e.target.value
                      );
                      if (match) {
                        setGigFormData(prev => ({ ...prev, artist_id: String(match.id) }));
                      } else {
                        setGigFormData(prev => ({ ...prev, artist_id: '' }));
                      }
                    }}
                    onFocus={() => setShowArtistDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowArtistDropdown(false), 200);
                    }}
                    required
                  />
                  {showArtistDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      background: '#fff',
                      border: '3px solid #000',
                      borderRadius: '8px',
                      boxShadow: '4px 4px 0 #000',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}>
                      {(() => {
                        const filtered = artists.filter(a =>
                          a.name.toLowerCase().includes(artistSearch.toLowerCase()) ||
                          (a.category && a.category.toLowerCase().includes(artistSearch.toLowerCase()))
                        );
                        if (filtered.length === 0) {
                          return <div style={{ padding: '8px 12px', color: '#888', fontWeight: 'bold' }}>No artists found</div>;
                        }
                        return filtered.map(a => (
                          <div
                            key={a.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setGigFormData(prev => ({ ...prev, artist_id: String(a.id) }));
                              setArtistSearch(`${a.name} (${a.category || 'No Category'})`);
                              setShowArtistDropdown(false);
                            }}
                            className="dropdown-item-hover"
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              borderBottom: '1px solid #eee'
                            }}
                          >
                            {a.name} ({a.category || 'No Category'})
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Location / Venue</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search venue..."
                    value={venueSearch}
                    onChange={e => {
                      setVenueSearch(e.target.value);
                      setShowVenueDropdown(true);
                      const match = venues.find(v => v.name === e.target.value);
                      if (match) {
                        setGigFormData(prev => ({ ...prev, venue_id: String(match.id) }));
                      } else {
                        setGigFormData(prev => ({ ...prev, venue_id: '' }));
                      }
                    }}
                    onFocus={() => setShowVenueDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowVenueDropdown(false), 200);
                    }}
                  />
                  {showVenueDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      background: '#fff',
                      border: '3px solid #000',
                      borderRadius: '8px',
                      boxShadow: '4px 4px 0 #000',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}>
                      {(() => {
                        const filtered = venues.filter(v =>
                          v.name.toLowerCase().includes(venueSearch.toLowerCase())
                        );
                        if (filtered.length === 0) {
                          return <div style={{ padding: '8px 12px', color: '#888', fontWeight: 'bold' }}>No venues found</div>;
                        }
                        return filtered.map(v => (
                          <div
                            key={v.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setGigFormData(prev => ({ ...prev, venue_id: String(v.id) }));
                              setVenueSearch(v.name);
                              setShowVenueDropdown(false);
                            }}
                            className="dropdown-item-hover"
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              borderBottom: '1px solid #eee'
                            }}
                          >
                            {v.name}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Gig Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={gigFormData.gig_date}
                  onChange={e => setGigFormData({ ...gigFormData, gig_date: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Payment Fee (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 15000"
                    value={gigFormData.fee_inr}
                    onChange={e => setGigFormData({ ...gigFormData, fee_inr: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Advance Paid (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 5000"
                    value={gigFormData.advance_paid}
                    onChange={e => setGigFormData({ ...gigFormData, advance_paid: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Swiggy Link</label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://swiggy.com/..."
                    value={gigFormData.swiggy_link || ''}
                    onChange={e => setGigFormData({ ...gigFormData, swiggy_link: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Zomato Link</label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://zomato.com/..."
                    value={gigFormData.zomato_link || ''}
                    onChange={e => setGigFormData({ ...gigFormData, zomato_link: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-control"
                  value={gigFormData.status}
                  onChange={e => setGigFormData({ ...gigFormData, status: e.target.value })}
                  required
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Advance Paid">Advance Paid</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Hold">Hold</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGigModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Gig Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
