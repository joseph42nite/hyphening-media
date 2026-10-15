import React, { useState, useEffect } from 'react';
import { Plus, Search, Copy, Edit3, Check, RotateCcw, MessageSquare, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../../api.js';

// Reusable Metric Stat Card
function StatCard({ title, value, subtitle, icon: Icon, color, bg }) {
  return (
    <div
      className="glass-card glass-premium"
      style={{
        background: 'var(--bg-card, rgba(12, 16, 24, 0.85))',
        padding: '18px 20px',
        borderRadius: '14px',
        border: '1px solid rgba(223, 231, 224, 0.12)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(20px)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
        <div style={{ background: bg, color, padding: '6px', borderRadius: '8px', border: `1px solid ${color}4d`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} />
        </div>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: color === '#38bdf8' ? 'var(--text-primary)' : color, fontFamily: 'var(--font-heading)' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '6px' }}>
        {subtitle}
      </div>
    </div>
  );
}

// Reusable Pagination Controls
function PaginationControls({ page, setPage, limit, setLimit, totalItems }) {
  if (totalItems <= 0) return null;
  const totalPages = Math.ceil(totalItems / limit);
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  const buttons = [];
  for (let i = startPage; i <= endPage; i++) {
    buttons.push(
      <button
        key={i}
        className={`btn ${page === i ? 'btn-primary' : ''}`}
        style={{ padding: '8px 12px', fontSize: '0.75rem', borderWidth: '1px', borderRadius: '6px', minWidth: '32px' }}
        onClick={() => setPage(i)}
      >
        {i}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
      <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
        Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((page - 1) * limit + 1, totalItems)}</span> to{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(page * limit, totalItems)}</span> of{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{totalItems}</span> entries
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
          <select
            className="form-control"
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setPage(1);
            }}
            style={{ width: 'auto', padding: '8px 16px 8px 12px', height: 'auto', fontSize: '0.85rem', borderWidth: '1px', borderRadius: '6px', cursor: 'pointer' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '1px', borderRadius: '6px' }} disabled={page === 1} onClick={() => setPage(1)}>First</button>
          <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '1px', borderRadius: '6px' }} disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
          {buttons}
          <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '1px', borderRadius: '6px' }} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '1px', borderRadius: '6px' }} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
        </div>
      </div>
    </div>
  );
}

// Reusable Message Template Card
function MessageTemplateCard({
  badge,
  badgeBg,
  badgeBorder,
  badgeColor,
  text,
  emptyText,
  onCopy,
  onEdit,
  extraHeaderControls = null,
  disabled = false
}) {
  return (
    <div style={{ background: 'rgba(16, 22, 32, 0.75)', border: '1px solid rgba(223, 231, 224, 0.1)', borderRadius: '10px', padding: '12px 14px', backdropFilter: 'blur(12px)', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '160px' }}>
          <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em', background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor, whiteSpace: 'nowrap' }}>
            {badge}
          </span>
          {extraHeaderControls}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            disabled={disabled}
            onClick={onCopy}
            className="btn btn-primary"
            style={{ padding: '4px 11px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '6px', fontWeight: 600 }}
          >
            <Copy size={12} /> Copy
          </button>
          <button
            disabled={disabled}
            onClick={onEdit}
            className="btn btn-secondary"
            style={{ padding: '4px 9px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(223, 231, 224, 0.15)', color: 'var(--text-primary)' }}
          >
            <Edit3 size={12} /> Edit
          </button>
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'rgba(223, 231, 224, 0.9)', whiteSpace: 'pre-wrap', maxHeight: '72px', overflowY: 'auto', background: 'rgba(5, 7, 10, 0.75)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(223, 231, 224, 0.08)', fontFamily: 'inherit', lineHeight: '1.45' }}>
        {text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{emptyText}</span>}
      </div>
    </div>
  );
}

// Reusable Searchable Autocomplete Select
function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false
}) {
  const [search, setSearch] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  const filtered = options.filter(opt =>
    (opt.label || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (opt.sublabel && opt.sublabel.toLowerCase().includes((search || '').toLowerCase()))
  );

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-control"
        placeholder={placeholder}
        value={search}
        onChange={e => {
          setSearch(e.target.value);
          setShowDropdown(true);
          onChange(e.target.value, null);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        required={required}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'rgba(12, 16, 24, 0.96)',
          border: '1px solid rgba(223, 231, 224, 0.18)',
          borderRadius: '8px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '4px',
          backdropFilter: 'blur(16px)'
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              No matches found
            </div>
          ) : (
            filtered.map(opt => (
              <div
                key={opt.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const displayText = opt.display || opt.label;
                  setSearch(displayText);
                  onChange(displayText, opt);
                  setShowDropdown(false);
                }}
                className="dropdown-item-hover"
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  borderBottom: '1px solid rgba(223, 231, 224, 0.08)',
                  color: 'var(--text-primary)'
                }}
              >
                {opt.label} {opt.sublabel ? `(${opt.sublabel})` : ''}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ArtistCurationTab({
  auth,
  gigs,
  artists,
  venues = [],
  fetchCurationData,
  showToast,
  formatDateStr
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSuperAdmin = auth?.role === 'super_admin';
  const isSMM = auth?.role === 'ops_social_media_manager';

  // Message Templates State (synced with backend + cached in localStorage)
  const [onboardingMsg, setOnboardingMsg] = useState(() => {
    return localStorage.getItem('artist_template_onboarding') || '';
  });
  const [confirmationMsg, setConfirmationMsg] = useState(() => {
    return localStorage.getItem('artist_template_confirmation') || '';
  });
  const [editingMsgType, setEditingMsgType] = useState(null);
  const [tempMsgText, setTempMsgText] = useState('');
  const [selectedVenueMessageId, setSelectedVenueMessageId] = useState('');
  const currentVenue = (venues || []).find(v => String(v.id) === String(selectedVenueMessageId)) || (venues && venues[0]) || null;

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/artists/templates`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.templates) {
            if (data.templates.onboarding !== undefined) {
              setOnboardingMsg(data.templates.onboarding);
              localStorage.setItem('artist_template_onboarding', data.templates.onboarding);
            }
            if (data.templates.confirmation !== undefined) {
              setConfirmationMsg(data.templates.confirmation);
              localStorage.setItem('artist_template_confirmation', data.templates.confirmation);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching message templates:', err);
      }
    };
    fetchTemplates();
  }, []);

  const handleCopyTemplate = (text, label) => {
    if (!text || !text.trim()) {
      showToast(`Please click 'Edit' to enter your ${label} text first`, 'warning');
      return;
    }
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`, 'success');
  };

  const handleSaveTemplate = async (type) => {
    try {
      if (type === 'venue') {
        const venueId = currentVenue?.id;
        if (!venueId) throw new Error('No venue selected');
        const res = await fetch(`${API_BASE}/api/artists/venues/${venueId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gig_confirmed_message: tempMsgText }),
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save venue template');
        if (fetchCurationData) fetchCurationData();
        setEditingMsgType(null);
        showToast(`Template saved for ${currentVenue.name}!`, 'success');
        return;
      }

      const res = await fetch(`${API_BASE}/api/artists/templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, text: tempMsgText }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template');

      if (type === 'onboarding') {
        setOnboardingMsg(tempMsgText);
        localStorage.setItem('artist_template_onboarding', tempMsgText);
      } else {
        setConfirmationMsg(tempMsgText);
        localStorage.setItem('artist_template_confirmation', tempMsgText);
      }
      setEditingMsgType(null);
      showToast('Template saved safely!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleClearTemplate = async (type) => {
    try {
      if (type === 'venue') {
        const venueId = currentVenue?.id;
        if (!venueId) throw new Error('No venue selected');
        const res = await fetch(`${API_BASE}/api/artists/venues/${venueId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gig_confirmed_message: null }),
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to clear venue template');
        if (fetchCurationData) fetchCurationData();
        setTempMsgText('');
        setEditingMsgType(null);
        showToast(`Template cleared for ${currentVenue.name}`, 'info');
        return;
      }

      const res = await fetch(`${API_BASE}/api/artists/templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, text: '' }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear template');

      if (type === 'onboarding') {
        setOnboardingMsg('');
        localStorage.removeItem('artist_template_onboarding');
      } else {
        setConfirmationMsg('');
        localStorage.removeItem('artist_template_confirmation');
      }
      setTempMsgText('');
      setEditingMsgType(null);
      showToast('Template cleared', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Pagination states
  const [gigsPage, setGigsPage] = useState(1);
  const [gigsLimit, setGigsLimit] = useState(10);
  const [artistsPage, setArtistsPage] = useState(1);
  const [artistsLimit, setArtistsLimit] = useState(10);

  // Search state for Artist Roster
  const [artistRosterSearch, setArtistRosterSearch] = useState('');

  // Filtered Artists calculation
  const filteredArtists = artists.filter(art => {
    if (!artistRosterSearch.trim()) return true;
    const q = artistRosterSearch.toLowerCase();
    return (
      (art.name && art.name.toLowerCase().includes(q)) ||
      (art.category && art.category.toLowerCase().includes(q)) ||
      (art.city && art.city.toLowerCase().includes(q)) ||
      (art.phone && art.phone.toLowerCase().includes(q)) ||
      (art.email && art.email.toLowerCase().includes(q)) ||
      (art.instruments && art.instruments.toLowerCase().includes(q))
    );
  });

  // Bank decryption state
  const [decryptedBank, setDecryptedBank] = useState({});

  // Modals visibility states
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
  const [venueSearch, setVenueSearch] = useState('');

  // Bank decryption handler
  const decryptBankDetails = async (artistId) => {
    try {
      const res = await fetch(`${API_BASE}/api/artists/${artistId}/bank`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDecryptedBank(prev => ({ ...prev, [artistId]: data.bank_details || 'No bank details recorded' }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Artist CRUD handlers
  const openArtistModal = async (artist = null) => {
    if (artist) {
      setEditingArtist(artist);
      const bankVal = artist.bank_details || decryptedBank[artist.id] || '';
      setArtistFormData({
        name: artist.name,
        category: artist.category || '',
        city: artist.city || '',
        phone: artist.phone || '',
        email: artist.email || '',
        telegram_chat_id: artist.telegram_chat_id || '',
        bank_details: bankVal,
        instruments: artist.instruments || '',
        insta_link: artist.insta_link || '',
        description: artist.description || '',
        rating: artist.rating !== null && artist.rating !== undefined ? String(artist.rating) : '',
        notes: artist.notes || ''
      });
      setShowArtistModal(true);
      if (!bankVal && (artist.has_bank_details || artist.bank_details_enc)) {
        try {
          const res = await fetch(`${API_BASE}/api/artists/${artist.id}/bank`, { credentials: 'include' });
          const data = await res.json();
          if (res.ok && data.bank_details) {
            setDecryptedBank(prev => ({ ...prev, [artist.id]: data.bank_details }));
            setArtistFormData(prev => ({ ...prev, bank_details: data.bank_details }));
          }
        } catch (err) {
          // ignore
        }
      }
    } else {
      setEditingArtist(null);
      setArtistFormData({
        name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: '',
        instruments: '', insta_link: '', description: '', rating: '', notes: ''
      });
      setShowArtistModal(true);
    }
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

  // Gig Summary Metrics
  const nonCancelledGigs = (gigs || []).filter(g => g.status !== 'Cancelled');
  const gigsDoneCount = nonCancelledGigs.length;
  const paidGigs = (gigs || []).filter(g => g.status === 'Paid');
  const paidGigsCount = paidGigs.length;
  const leftForPaymentGigs = nonCancelledGigs.filter(g => g.status !== 'Paid');
  const leftForPaymentCount = leftForPaymentGigs.length;

  const totalPaidAmount = (gigs || []).reduce((acc, g) => {
    if (g.status === 'Paid') {
      return acc + (Number(g.fee_inr) || 0);
    }
    return acc + (Number(g.advance_paid) || 0);
  }, 0);

  const totalPendingAmount = leftForPaymentGigs.reduce((acc, g) => {
    const fee = Number(g.fee_inr) || 0;
    const advance = Number(g.advance_paid) || 0;
    return acc + Math.max(0, fee - advance);
  }, 0);

  if (!isAdmin && !isSMM) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      
      {/* Gig Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="Gigs Done"
          value={gigsDoneCount}
          subtitle="Completed & active gigs"
          icon={Calendar}
          color="#38bdf8"
          bg="rgba(56, 189, 248, 0.15)"
        />
        <StatCard
          title="Left for Payment"
          value={leftForPaymentCount}
          subtitle={`₹${totalPendingAmount.toLocaleString('en-IN')} pending balance`}
          icon={Clock}
          color="#fbbf24"
          bg="rgba(245, 158, 11, 0.15)"
        />
        <StatCard
          title="Paid Gigs"
          value={paidGigsCount}
          subtitle={`₹${totalPaidAmount.toLocaleString('en-IN')} disbursed`}
          icon={CheckCircle2}
          color="#34d399"
          bg="rgba(16, 185, 129, 0.15)"
        />
      </div>

      {/* Gig Status Tracker */}
      <div className="dashboard-toolbar curation-section-header">
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
      <PaginationControls
        page={gigsPage}
        setPage={setGigsPage}
        limit={gigsLimit}
        setLimit={setGigsLimit}
        totalItems={gigs.length}
      />

      {/* Roster & Encrypted Details */}
      <div className="dashboard-toolbar curation-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Artist Roster (Client Specific)</h3>
        <div className="curation-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search artist roster..."
              value={artistRosterSearch}
              onChange={(e) => {
                setArtistRosterSearch(e.target.value);
                setArtistsPage(1);
              }}
              style={{ paddingLeft: '34px', paddingRight: '12px', height: '36px', fontSize: '0.85rem' }}
            />
          </div>
          <button onClick={() => openArtistModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Add Artist
          </button>
        </div>
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
            {filteredArtists.length === 0 ? (
              <tr>
                <td colSpan="20" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No artists found matching your search.
                </td>
              </tr>
            ) : (
              filteredArtists.slice((artistsPage - 1) * artistsLimit, artistsPage * artistsLimit).map(art => (
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
                    {art.bank_details || decryptedBank[art.id] ? (
                      <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
                        {art.bank_details || decryptedBank[art.id]}
                      </span>
                    ) : decryptedBank[art.id] !== undefined ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No bank details</span>
                    ) : (
                      <button
                        onClick={() => decryptBankDetails(art.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls for Artists */}
      <PaginationControls
        page={artistsPage}
        setPage={setArtistsPage}
        limit={artistsLimit}
        setLimit={setArtistsLimit}
        totalItems={filteredArtists.length}
      />

      {/* Quick Artist Message Templates Strip (Bottom of Page) */}
      <div
        className="glass-card glass-premium"
        style={{
          marginTop: '32px',
          marginBottom: '24px',
          padding: '16px 20px',
          border: '1px solid rgba(223, 231, 224, 0.12)',
          borderRadius: '12px',
          background: 'rgba(12, 16, 24, 0.85)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
            <MessageSquare size={18} style={{ color: 'var(--accent)' }} /> Quick Artist Message Templates
          </h4>
          <span style={{ fontSize: '0.68rem', color: 'rgba(223, 231, 224, 0.75)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(223, 231, 224, 0.05)', padding: '3px 9px', borderRadius: '4px', border: '1px solid rgba(223, 231, 224, 0.1)' }}>
            1-CLICK COPY & EDIT
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
          <MessageTemplateCard
            badge="1. Onboarding Message"
            badgeBg="rgba(56, 189, 248, 0.12)"
            badgeBorder="rgba(56, 189, 248, 0.3)"
            badgeColor="#7dd3fc"
            text={onboardingMsg}
            emptyText="No template set yet. Click 'Edit' to enter your template."
            onCopy={() => handleCopyTemplate(onboardingMsg, 'Onboarding Message')}
            onEdit={() => { setEditingMsgType('onboarding'); setTempMsgText(onboardingMsg); }}
          />

          <MessageTemplateCard
            badge="2. Confirmation Message"
            badgeBg="rgba(34, 197, 94, 0.12)"
            badgeBorder="rgba(34, 197, 94, 0.3)"
            badgeColor="#4ade80"
            text={confirmationMsg}
            emptyText="No template set yet. Click 'Edit' to enter your template."
            onCopy={() => handleCopyTemplate(confirmationMsg, 'Confirmation Message')}
            onEdit={() => { setEditingMsgType('confirmation'); setTempMsgText(confirmationMsg); }}
          />

          <MessageTemplateCard
            badge="3. Venue Message"
            badgeBg="rgba(245, 158, 11, 0.12)"
            badgeBorder="rgba(245, 158, 11, 0.3)"
            badgeColor="#fbbf24"
            disabled={!currentVenue}
            extraHeaderControls={
              venues && venues.length > 0 ? (
                <select
                  className="form-control"
                  value={currentVenue ? currentVenue.id : ''}
                  onChange={e => setSelectedVenueMessageId(e.target.value)}
                  style={{
                    fontSize: '0.74rem',
                    padding: '2px 8px',
                    height: '26px',
                    background: 'rgba(5, 7, 10, 0.8)',
                    borderColor: 'rgba(223, 231, 224, 0.18)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    maxWidth: '190px'
                  }}
                  title="Select Venue"
                >
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.client_name ? ` (${v.client_name})` : ''}
                    </option>
                  ))}
                </select>
              ) : null
            }
            text={
              !venues || venues.length === 0 ? null : currentVenue?.gig_confirmed_message || null
            }
            emptyText={
              !venues || venues.length === 0
                ? 'No venues available. Add an Artist Curation client in Clients tab.'
                : `No custom message for ${currentVenue?.name}. Click 'Edit' to enter your template.`
            }
            onCopy={() => handleCopyTemplate(currentVenue?.gig_confirmed_message, `${currentVenue?.name || 'Venue'} Confirmation Message`)}
            onEdit={() => { setEditingMsgType('venue'); setTempMsgText(currentVenue?.gig_confirmed_message || ''); }}
          />
        </div>
      </div>

      {/* Edit Template Modal */}
      {editingMsgType && (
        <div className="modal-overlay" onClick={() => setEditingMsgType(null)}>
          <div
            className="modal-content glass-premium"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '560px',
              width: '92%',
              padding: '24px',
              background: 'rgba(10, 14, 20, 0.96)',
              border: '1px solid rgba(223, 231, 224, 0.18)',
              borderRadius: '14px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
              backdropFilter: 'blur(32px)'
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Edit {editingMsgType === 'onboarding' ? 'Onboarding Message' : editingMsgType === 'confirmation' ? 'General Confirmation Message' : `${currentVenue?.name || 'Venue'} Confirmation Message`} Template
            </h3>
            <div style={{ marginBottom: '18px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px', display: 'block', color: 'var(--text-secondary)' }}>
                Template Text
              </label>
              <textarea
                className="form-control"
                rows={8}
                placeholder="Type or paste your custom message template here..."
                value={tempMsgText}
                onChange={(e) => setTempMsgText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  background: 'rgba(5, 7, 10, 0.85)',
                  border: '1px solid rgba(223, 231, 224, 0.18)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px'
                }}
              />
              {editingMsgType === 'venue' && (
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <strong>Supported variables:</strong> <code style={{ color: '#7dd3fc' }}>{'{{artist_name}}'}</code>, <code style={{ color: '#7dd3fc' }}>{'{{gig_date}}'}</code>, <code style={{ color: '#7dd3fc' }}>{'{{venue_name}}'}</code>, <code style={{ color: '#7dd3fc' }}>{'{{address}}'}</code>, <code style={{ color: '#7dd3fc' }}>{'{{map_link}}'}</code>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => handleClearTemplate(editingMsgType)}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#f87171',
                  background: 'rgba(224, 35, 28, 0.1)',
                  border: '1px solid rgba(224, 35, 28, 0.3)',
                  borderRadius: '6px',
                  padding: '6px 12px'
                }}
              >
                Clear Text
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingMsgType(null)}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.8rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(223, 231, 224, 0.15)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    padding: '6px 14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveTemplate(editingMsgType)}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.8rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    fontWeight: 700
                  }}
                >
                  <Check size={14} /> Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Bank Details</label>
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

      {/* Gig Modal */}
      {showGigModal && (
        <div className="modal-overlay" onClick={() => setShowGigModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingGig ? 'Edit Gig Status' : 'Add Gig Status'}</h2>
            <form onSubmit={handleGigSubmit} style={{ marginTop: '20px' }}>

              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                <SearchableSelect
                  label="Artist"
                  placeholder="Search artist..."
                  value={artistSearch}
                  required
                  options={artists.map(a => ({
                    id: a.id,
                    label: a.name,
                    sublabel: a.category || 'No Category',
                    display: `${a.name} (${a.category || 'No Category'})`,
                    artist: a
                  }))}
                  onChange={(displayText, match) => {
                    setArtistSearch(displayText);
                    if (match) {
                      setGigFormData(prev => ({ ...prev, artist_id: String(match.id) }));
                    } else {
                      const found = artists.find(a =>
                        `${a.name} (${a.category || 'No Category'})` === displayText ||
                        a.name === displayText
                      );
                      setGigFormData(prev => ({ ...prev, artist_id: found ? String(found.id) : '' }));
                    }
                  }}
                />

                <SearchableSelect
                  label="Location / Venue"
                  placeholder="Search venue..."
                  value={venueSearch}
                  options={venues.map(v => ({
                    id: v.id,
                    label: v.name,
                    sublabel: v.client_name ? `Client: ${v.client_name}` : null,
                    display: v.name,
                    venue: v
                  }))}
                  onChange={(displayText, match) => {
                    setVenueSearch(displayText);
                    if (match) {
                      setGigFormData(prev => ({ ...prev, venue_id: String(match.id) }));
                    } else {
                      const found = venues.find(v => v.name === displayText);
                      setGigFormData(prev => ({ ...prev, venue_id: found ? String(found.id) : '' }));
                    }
                  }}
                />
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
