import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Phone, Mail, Globe, MapPin, Calendar, Clock, 
  Bell, Volume2, VolumeX, Trash2, Edit3, CheckCircle2, 
  ExternalLink, X, Settings2
} from 'lucide-react';
import { API_BASE, authFetch } from '../../api.js';

// Segment / Industry icon helper
function getSegmentIcon(segment) {
  const s = (segment || '').toLowerCase();
  if (s.includes('interior') || s.includes('design') || s.includes('decor') || s.includes('furniture')) return '🛋️';
  if (s.includes('fnb') || s.includes('food') || s.includes('restaurant') || s.includes('cafe') || s.includes('beverage')) return '🍽️';
  if (s.includes('health') || s.includes('medical') || s.includes('clinic') || s.includes('hospital') || s.includes('doctor')) return '🏥';
  if (s.includes('real estate') || s.includes('property') || s.includes('realty') || s.includes('builder')) return '🏢';
  if (s.includes('tech') || s.includes('software') || s.includes('saas') || s.includes('digital') || s.includes('it')) return '💻';
  if (s.includes('fashion') || s.includes('apparel') || s.includes('clothing') || s.includes('boutique')) return '👗';
  if (s.includes('fit') || s.includes('gym') || s.includes('yoga') || s.includes('sport')) return '🏋️';
  if (s.includes('law') || s.includes('legal') || s.includes('attorney')) return '⚖️';
  if (s.includes('edu') || s.includes('school') || s.includes('academy')) return '🎓';
  if (s.includes('beauty') || s.includes('salon') || s.includes('spa') || s.includes('cosmetic')) return '✨';
  if (s.includes('auto') || s.includes('car') || s.includes('motor')) return '🚗';
  return '🏷️';
}

// Segment / Industry badge color styling helper
function getSegmentBadgeStyle(segment) {
  const s = (segment || '').toLowerCase();
  if (s.includes('fnb') || s.includes('food') || s.includes('restaurant') || s.includes('beverage')) {
    return {
      background: 'rgba(249, 115, 22, 0.14)',
      color: '#fb923c',
      border: '1px solid rgba(249, 115, 22, 0.35)'
    };
  }
  if (s.includes('health') || s.includes('medical') || s.includes('clinic') || s.includes('hospital')) {
    return {
      background: 'rgba(14, 165, 233, 0.14)',
      color: '#38bdf8',
      border: '1px solid rgba(14, 165, 233, 0.35)'
    };
  }
  if (s.includes('interior') || s.includes('design') || s.includes('decor')) {
    return {
      background: 'rgba(168, 85, 247, 0.16)',
      color: '#c084fc',
      border: '1px solid rgba(168, 85, 247, 0.35)'
    };
  }
  if (s.includes('real estate') || s.includes('property')) {
    return {
      background: 'rgba(16, 185, 129, 0.14)',
      color: '#34d399',
      border: '1px solid rgba(16, 185, 129, 0.35)'
    };
  }
  if (s.includes('tech') || s.includes('software')) {
    return {
      background: 'rgba(59, 130, 246, 0.14)',
      color: '#60a5fa',
      border: '1px solid rgba(59, 130, 246, 0.35)'
    };
  }
  const palettes = [
    { background: 'rgba(236, 72, 153, 0.14)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.35)' },
    { background: 'rgba(234, 179, 8, 0.14)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.35)' },
    { background: 'rgba(20, 184, 166, 0.14)', color: '#2dd4bf', border: '1px solid rgba(20, 184, 166, 0.35)' },
    { background: 'rgba(129, 140, 248, 0.14)', color: '#a5b4fc', border: '1px solid rgba(129, 140, 248, 0.35)' }
  ];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return palettes[sum % palettes.length];
}

// Web Audio synthesizer chime for 12 PM follow-up reminder
function playChimeSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    
    // First tone (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Second tone (A5 - 880.00 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.2);
    gain2.gain.setValueAtTime(0.3, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.8);
  } catch (err) {
    console.warn('[AUDIO] Could not play alert chime:', err);
  }
}

export default function LeadsTab({
  auth,
  showToast,
  onRemindersCountChange,
  remindersDismissed,
  onDismissReminders
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');

  // Segments state (defaults include FnB, Healthcare, and Interior Designers)
  const [segments, setSegments] = useState([
    'FnB',
    'Healthcare',
    'Interior Designers'
  ]);
  const [isAddingInlineSegment, setIsAddingInlineSegment] = useState(false);
  const [newSegmentInput, setNewSegmentInput] = useState('');
  
  // Manage Industries Modal state
  const [showSegmentModal, setShowSegmentModal] = useState(false);
  const [segmentModalInput, setSegmentModalInput] = useState('');
  const [editingSegment, setEditingSegment] = useState(null); // { oldName: '', newName: '' }

  // Inline industry edit within Add/Edit Lead modal
  const [isEditingInlineSegment, setIsEditingInlineSegment] = useState(false);
  const [inlineEditSegmentInput, setInlineEditSegmentInput] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [formData, setFormData] = useState({
    client_name: '',
    company_name: '',
    location: '',
    phone: '',
    email: '',
    website: '',
    notes: '',
    follow_up_date: '',
    status: 'New',
    industry: ''
  });

  // Sound toggle state (defaults to on, persisted in localStorage)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('leads_sound_enabled') !== 'false';
  });

  const hasPlayedSoundRef = useRef(false);

  // Fetch leads
  const fetchLeads = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/leads?`;
      if (statusFilter !== 'all') url += `status=${encodeURIComponent(statusFilter)}&`;
      if (industryFilter !== 'all') url += `industry=${encodeURIComponent(industryFilter)}&`;
      if (search.trim()) url += `q=${encodeURIComponent(search.trim())}&`;
      if (dueFilter !== 'all') url += `due=${encodeURIComponent(dueFilter)}&`;

      const res = await authFetch(url);
      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      setLeads(data.leads || []);
      if (Array.isArray(data.industries) && data.industries.length > 0) {
        setSegments(data.industries);
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, dueFilter, industryFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeads();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Add new industry handler (from Add/Edit Lead modal inline adder)
  const handleAddInlineSegment = async () => {
    const trimmed = (newSegmentInput || '').trim();
    if (!trimmed) return;
    
    try {
      const res = await authFetch(`${API_BASE}/api/leads/industries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (data.industries) {
        setSegments(data.industries);
      } else if (!segments.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
        setSegments(prev => [...prev, trimmed]);
      }
    } catch (err) {
      if (!segments.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
        setSegments(prev => [...prev, trimmed]);
      }
    }

    setFormData(prev => ({ ...prev, industry: trimmed }));
    setNewSegmentInput('');
    setIsAddingInlineSegment(false);
    showToast?.(`Industry "${trimmed}" selected`, 'success');
  };

  // Add new industry handler (from Manage Industries modal)
  const handleAddSegmentFromModal = async () => {
    const trimmed = (segmentModalInput || '').trim();
    if (!trimmed) return;

    try {
      const res = await authFetch(`${API_BASE}/api/leads/industries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (data.industries) {
        setSegments(data.industries);
      } else if (!segments.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
        setSegments(prev => [...prev, trimmed]);
      }
      showToast?.(`Industry "${trimmed}" added!`, 'success');
      setSegmentModalInput('');
    } catch (err) {
      if (!segments.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
        setSegments(prev => [...prev, trimmed]);
        showToast?.(`Industry "${trimmed}" added!`, 'success');
        setSegmentModalInput('');
      } else {
        showToast?.(`Industry "${trimmed}" already exists`, 'info');
      }
    }
  };

  // Rename/Edit an existing industry
  const handleRenameIndustry = async (oldName, newName) => {
    const oldTrimmed = (oldName || '').trim();
    const newTrimmed = (newName || '').trim();

    if (!newTrimmed) {
      showToast?.('Industry name cannot be empty', 'error');
      return;
    }

    if (oldTrimmed.toLowerCase() === newTrimmed.toLowerCase() && oldTrimmed === newTrimmed) {
      setEditingSegment(null);
      setIsEditingInlineSegment(false);
      return;
    }

    try {
      const res = await authFetch(`${API_BASE}/api/leads/industries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldTrimmed, new_name: newTrimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update industry name');

      if (data.industries) {
        setSegments(data.industries);
      } else {
        setSegments(prev => prev.map(s => s.toLowerCase() === oldTrimmed.toLowerCase() ? newTrimmed : s));
      }

      // Update leads in local state immediately
      setLeads(prev => prev.map(lead => {
        if (lead.industry && lead.industry.toLowerCase() === oldTrimmed.toLowerCase()) {
          return { ...lead, industry: newTrimmed };
        }
        return lead;
      }));

      // Update active filters and form if matching
      if (industryFilter.toLowerCase() === oldTrimmed.toLowerCase()) {
        setIndustryFilter(newTrimmed);
      }
      if (formData.industry.toLowerCase() === oldTrimmed.toLowerCase()) {
        setFormData(prev => ({ ...prev, industry: newTrimmed }));
      }

      setEditingSegment(null);
      setIsEditingInlineSegment(false);
      showToast?.(`Industry renamed to "${newTrimmed}"`, 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  // Delete an existing industry
  const handleDeleteIndustry = async (industryName) => {
    const trimmed = (industryName || '').trim();
    if (!trimmed) return;

    if (!window.confirm(`Are you sure you want to remove the industry "${trimmed}"?\nAny leads assigned to this industry will have their industry reset to None.`)) {
      return;
    }

    try {
      const res = await authFetch(`${API_BASE}/api/leads/industries`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete industry');

      if (data.industries) {
        setSegments(data.industries);
      } else {
        setSegments(prev => prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase()));
      }

      setLeads(prev => prev.map(lead => {
        if (lead.industry && lead.industry.toLowerCase() === trimmed.toLowerCase()) {
          return { ...lead, industry: null };
        }
        return lead;
      }));

      if (industryFilter.toLowerCase() === trimmed.toLowerCase()) {
        setIndustryFilter('all');
      }
      if (formData.industry.toLowerCase() === trimmed.toLowerCase()) {
        setFormData(prev => ({ ...prev, industry: '' }));
      }

      showToast?.(`Industry "${trimmed}" removed`, 'info');
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  // Calculate follow-up reminders due today at 12 PM
  const todayStr = new Date().toLocaleDateString('en-CA');
  const currentHour = new Date().getHours();
  const isAfter12PM = currentHour >= 12;

  const pendingReminders = leads.filter(l => {
    if (!l.follow_up_date || ['Converted', 'Lost'].includes(l.status)) return false;
    if (l.follow_up_date < todayStr) return true;
    if (l.follow_up_date === todayStr) return isAfter12PM;
    return false;
  });

  const pendingCount = pendingReminders.length;

  useEffect(() => {
    if (onRemindersCountChange) {
      onRemindersCountChange(pendingCount);
    }
  }, [pendingCount, onRemindersCountChange]);

  useEffect(() => {
    if (pendingCount > 0 && !remindersDismissed && soundEnabled && !hasPlayedSoundRef.current) {
      playChimeSound();
      hasPlayedSoundRef.current = true;
    }
  }, [pendingCount, remindersDismissed, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('leads_sound_enabled', String(next));
    if (next) {
      playChimeSound();
      showToast?.('Alert sound enabled (Test chime played)', 'info');
    } else {
      showToast?.('Alert sound muted', 'info');
    }
  };

  const openAddModal = () => {
    setEditingLead(null);
    setIsAddingInlineSegment(false);
    setIsEditingInlineSegment(false);
    setNewSegmentInput('');
    setFormData({
      client_name: '',
      company_name: '',
      location: '',
      phone: '',
      email: '',
      website: '',
      notes: '',
      follow_up_date: '',
      status: 'New',
      industry: industryFilter !== 'all' ? industryFilter : ''
    });
    setShowModal(true);
  };

  const openEditModal = (lead) => {
    setEditingLead(lead);
    setIsAddingInlineSegment(false);
    setIsEditingInlineSegment(false);
    setNewSegmentInput('');
    if (lead.industry && !segments.some(s => s.toLowerCase() === lead.industry.toLowerCase())) {
      setSegments(prev => [...prev, lead.industry]);
    }
    setFormData({
      client_name: lead.client_name || '',
      company_name: lead.company_name || '',
      location: lead.location || '',
      phone: lead.phone || '',
      email: lead.email || '',
      website: lead.website || '',
      notes: lead.notes || '',
      follow_up_date: lead.follow_up_date || '',
      status: lead.status || 'New',
      industry: lead.industry || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent double submissions on rapid clicks or double clicks
    if (isSubmittingRef.current || submitting) return;

    // Allow user to supply either client_name or company_name
    const resolvedClient = (formData.client_name || '').trim() || (formData.company_name || '').trim();
    if (!resolvedClient) {
      showToast?.('Please enter a Client Name or Company Name', 'error');
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);

    // If user typed into the inline add industry field and directly submitted the form
    let finalIndustry = formData.industry;
    if (isAddingInlineSegment && newSegmentInput.trim()) {
      finalIndustry = newSegmentInput.trim();
      if (!segments.some(s => s.toLowerCase() === finalIndustry.toLowerCase())) {
        setSegments(prev => [...prev, finalIndustry]);
      }
    }

    const payload = {
      ...formData,
      client_name: resolvedClient,
      company_name: (formData.company_name || '').trim() || null,
      industry: finalIndustry || null
    };

    try {
      const url = editingLead ? `${API_BASE}/api/leads/${editingLead.id}` : `${API_BASE}/api/leads`;
      const method = editingLead ? 'PATCH' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save lead');

      showToast?.(editingLead ? 'Lead updated successfully' : 'Lead created successfully', 'success');
      setShowModal(false);

      if (data.industries && Array.isArray(data.industries)) {
        setSegments(data.industries);
      }

      // If the user added a lead with an industry different from active filter, switch filter to 'all' so it's immediately seen
      if (!editingLead && industryFilter !== 'all' && finalIndustry && finalIndustry.toLowerCase() !== industryFilter.toLowerCase()) {
        setIndustryFilter('all');
      }

      fetchLeads();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      // Keep lock active briefly to prevent queued rapid events from triggering a secondary POST
      setTimeout(() => {
        isSubmittingRef.current = false;
        setSubmitting(false);
      }, 500);
    }
  };

  const handleDelete = async (lead) => {
    if (!window.confirm(`Are you sure you want to delete lead "${lead.client_name}"?`)) return;

    try {
      const res = await authFetch(`${API_BASE}/api/leads/${lead.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete lead');

      showToast?.('Lead deleted successfully', 'success');
      fetchLeads();
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const handleQuickStatusChange = async (leadId, newStatus) => {
    try {
      const res = await authFetch(`${API_BASE}/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      showToast?.(`Status updated to ${newStatus}`, 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      
      {/* 12 PM Follow-Up Reminders Alert Banner */}
      {pendingCount > 0 && !remindersDismissed && (
        <div 
          className="glass-card glass-premium"
          style={{
            marginBottom: '20px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(224, 35, 28, 0.14) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.25)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24'
            }}>
              <Bell size={22} className="animate-pulse" />
            </div>
            <div>
              <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#fef3c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                12:00 PM Follow-Up Reminders Active
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: '#ef4444',
                  color: '#fff'
                }}>
                  {pendingCount} Pending
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(254, 243, 199, 0.85)', marginTop: '2px' }}>
                You have {pendingCount} lead follow-up{pendingCount > 1 ? 's' : ''} scheduled for today at 12:00 PM. Call or reach out directly!
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={toggleSound}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '6px 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                color: '#fef3c7'
              }}
              title={soundEnabled ? 'Mute alert sound' : 'Enable alert sound'}
            >
              {soundEnabled ? <Volume2 size={14} style={{ color: '#4ade80' }} /> : <VolumeX size={14} style={{ color: '#f87171' }} />}
              Sound: {soundEnabled ? 'On' : 'Off'}
            </button>
            <button
              onClick={() => {
                onDismissReminders?.();
                showToast?.('Reminders acknowledged', 'info');
              }}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 16px',
                fontWeight: 700,
                background: '#f59e0b',
                color: '#000',
                borderColor: '#d97706',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={15} /> Dismiss Alert
            </button>
          </div>
        </div>
      )}

      {/* Leads Header & Toolbar */}
      <div className="dashboard-toolbar curation-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            Client Leads & Follow-ups
            {pendingCount > 0 && remindersDismissed && (
              <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '6px' }}>
                {pendingCount} due today (acknowledged)
              </span>
            )}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Track client prospects, 1-click direct dialing, company websites, notes, and 12:00 PM follow-up reminders.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => {
              setEditingSegment(null);
              setShowSegmentModal(true);
            }}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            title="Manage, edit or add industry names"
          >
            <Settings2 size={15} style={{ color: '#60a5fa' }} /> Manage Industries
          </button>
          <button onClick={openAddModal} disabled={submitting} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Add Lead
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '380px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search leads, companies, phone, city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Status:</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem' }}
          >
            <option value="all">All Statuses</option>
            <option value="New">New</option>
            <option value="Follow Up">Follow Up Needed</option>
            <option value="Contacted">Contacted</option>
            <option value="Proposal Sent">Proposal Sent</option>
            <option value="Converted">Converted</option>
            <option value="Lost">Lost</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Industry:</span>
          <select
            className="form-control"
            value={industryFilter}
            onChange={e => {
              if (e.target.value === '__MANAGE__') {
                setEditingSegment(null);
                setShowSegmentModal(true);
              } else {
                setIndustryFilter(e.target.value);
              }
            }}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem' }}
          >
            <option value="all">All Industries</option>
            {segments.map(seg => (
              <option key={seg} value={seg}>{getSegmentIcon(seg)} {seg}</option>
            ))}
            <option value="__MANAGE__">⚙️ Manage / Edit Industries...</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Follow-up:</span>
          <select
            className="form-control"
            value={dueFilter}
            onChange={e => setDueFilter(e.target.value)}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem' }}
          >
            <option value="all">All Dates</option>
            <option value="today">Due Today</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        {(search || statusFilter !== 'all' || dueFilter !== 'all' || industryFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setDueFilter('all'); setIndustryFilter('all'); }}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Leads Table */}
      <div className="table-container table-scrollable-y" style={{ marginBottom: '24px' }}>
        <table>
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Company Name</th>
              <th>Industry</th>
              <th>Location</th>
              <th>Phone (Click to Call)</th>
              <th>Email</th>
              <th>Website</th>
              <th>Follow-Up Date</th>
              <th>Status</th>
              <th>Notes</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="11" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan="11" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No leads found. Click "+ Add Lead" to record a new client inquiry.
                </td>
              </tr>
            ) : (
              leads.map(lead => {
                const isDueToday = lead.follow_up_date === todayStr;
                const isOverdue = lead.follow_up_date && lead.follow_up_date < todayStr && !['Converted', 'Lost'].includes(lead.status);
                const hasReminder = (isDueToday && isAfter12PM) || isOverdue;

                return (
                  <tr 
                    key={lead.id}
                    style={{
                      background: hasReminder ? 'rgba(245, 158, 11, 0.05)' : undefined
                    }}
                  >
                    {/* Client Name */}
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {lead.client_name}
                    </td>

                    {/* Company Name */}
                    <td style={{ fontWeight: 600 }}>
                      {lead.company_name || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>

                    {/* Segment / Industry */}
                    <td>
                      {lead.industry ? (
                        <span 
                          className="badge" 
                          style={{ 
                            ...getSegmentBadgeStyle(lead.industry),
                            fontWeight: 700, 
                            fontSize: '0.74rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setIndustryFilter(lead.industry);
                          }}
                          title={`Filter by ${lead.industry}`}
                        >
                          {getSegmentIcon(lead.industry)} {lead.industry}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>

                    {/* Location */}
                    <td>
                      {lead.location ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <MapPin size={13} style={{ color: '#38bdf8' }} /> {lead.location}
                        </span>
                      ) : '-'}
                    </td>

                    {/* Clickable Direct Phone Link */}
                    <td>
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone.replace(/[^0-9+]/g, '')}`}
                          className="btn btn-secondary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#34d399',
                            background: 'rgba(16, 185, 129, 0.12)',
                            borderColor: 'rgba(16, 185, 129, 0.35)',
                            textDecoration: 'none',
                            fontWeight: 700,
                            borderRadius: '6px'
                          }}
                          title="Click to dial directly from your device"
                        >
                          <Phone size={13} /> {lead.phone}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>

                    {/* Email */}
                    <td>
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            color: '#38bdf8',
                            textDecoration: 'none',
                            fontSize: '0.8rem'
                          }}
                        >
                          <Mail size={13} /> {lead.email}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>

                    {/* Company Website */}
                    <td>
                      {lead.website ? (
                        <a
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 600
                          }}
                        >
                          <Globe size={13} />
                          {lead.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 20)}
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>

                    {/* Follow-up Date & 12 PM Alert Badge */}
                    <td>
                      {lead.follow_up_date ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span 
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              color: isOverdue ? '#f87171' : isDueToday ? '#fbbf24' : 'var(--text-primary)'
                            }}
                          >
                            <Calendar size={13} /> {lead.follow_up_date}
                          </span>
                          {hasReminder && (
                            <span 
                              style={{
                                fontSize: '0.68rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                background: isOverdue ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                                color: isOverdue ? '#fca5a5' : '#fde047',
                                border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`
                              }}
                            >
                              <Clock size={10} /> {isOverdue ? 'Overdue (12 PM)' : 'Due at 12 PM'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None set</span>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      <select
                        className="form-control"
                        value={lead.status}
                        onChange={e => handleQuickStatusChange(lead.id, e.target.value)}
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          height: 'auto',
                          borderRadius: '6px',
                          background: lead.status === 'Converted' ? 'rgba(16, 185, 129, 0.15)' :
                                      lead.status === 'Lost' ? 'rgba(239, 68, 68, 0.15)' :
                                      lead.status === 'Follow Up' ? 'rgba(245, 158, 11, 0.15)' :
                                      'rgba(56, 189, 248, 0.15)',
                          color: lead.status === 'Converted' ? '#34d399' :
                                 lead.status === 'Lost' ? '#f87171' :
                                 lead.status === 'Follow Up' ? '#fbbf24' :
                                 '#38bdf8',
                          borderColor: lead.status === 'Converted' ? 'rgba(16, 185, 129, 0.35)' :
                                       lead.status === 'Lost' ? 'rgba(239, 68, 68, 0.35)' :
                                       lead.status === 'Follow Up' ? 'rgba(245, 158, 11, 0.35)' :
                                       'rgba(56, 189, 248, 0.35)'
                        }}
                      >
                        <option value="New">New</option>
                        <option value="Follow Up">Follow Up</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Proposal Sent">Proposal Sent</option>
                        <option value="Converted">Converted</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </td>

                    {/* Notes */}
                    <td style={{ maxWidth: '180px' }}>
                      <div 
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={lead.notes || ''}
                      >
                        {lead.notes || '-'}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEditModal(lead)}
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                          title="Edit Lead"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(lead)}
                          className="btn btn-secondary"
                          style={{
                            padding: '5px 8px',
                            fontSize: '0.74rem',
                            color: '#f87171',
                            borderColor: 'rgba(239, 68, 68, 0.35)',
                            background: 'rgba(239, 68, 68, 0.08)'
                          }}
                          title="Delete Lead"
                        >
                          <Trash2 size={13} />
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

      {/* Add / Edit Lead Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal-content glass-premium"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '620px',
              width: '92%',
              maxHeight: '90vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '24px 26px',
              background: 'rgba(10, 14, 20, 0.96)',
              border: '1px solid rgba(223, 231, 224, 0.18)',
              borderRadius: '14px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
              backdropFilter: 'blur(32px)',
              boxSizing: 'border-box',
              pointerEvents: submitting ? 'none' : 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {editingLead ? 'Edit Lead' : 'Add New Client Lead'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Client Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. John Doe"
                    value={formData.client_name}
                    onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                  />
                  <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Person name or primary contact</small>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Company Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Studio Luxe"
                    value={formData.company_name}
                    onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  />
                  <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Business / Brand / Studio</small>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Location / City</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Mumbai / Bangalore"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Phone Number (Direct Call)</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="e.g. +91 98765 43210"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Email Address</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. contact@client.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Company Website</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. https://company.com"
                    value={formData.website}
                    onChange={e => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Industry / Sector</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {formData.industry && !isEditingInlineSegment && (
                        <button
                          type="button"
                          onClick={() => {
                            setInlineEditSegmentInput(formData.industry);
                            setIsEditingInlineSegment(true);
                            setIsAddingInlineSegment(false);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#38bdf8',
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          title="Rename this selected industry"
                        >
                          <Edit3 size={11} /> Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingInlineSegment(prev => !prev);
                          setIsEditingInlineSegment(false);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary, #60a5fa)',
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                          padding: 0,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  </div>

                  {/* Inline Add Industry Input */}
                  {isAddingInlineSegment && (
                    <div style={{
                      display: 'flex',
                      gap: '6px',
                      marginBottom: '8px',
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)'
                    }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter industry name (e.g. Interior Designers)"
                        value={newSegmentInput}
                        onChange={e => setNewSegmentInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddInlineSegment();
                          }
                        }}
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAddInlineSegment}
                        style={{ fontSize: '0.75rem', padding: '6px 10px', whiteSpace: 'nowrap' }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsAddingInlineSegment(false);
                          setNewSegmentInput('');
                        }}
                        style={{ fontSize: '0.75rem', padding: '6px 8px' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {/* Inline Edit Industry Input */}
                  {isEditingInlineSegment && (
                    <div style={{
                      display: 'flex',
                      gap: '6px',
                      marginBottom: '8px',
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.35)'
                    }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Edit industry name"
                        value={inlineEditSegmentInput}
                        onChange={e => setInlineEditSegmentInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRenameIndustry(formData.industry, inlineEditSegmentInput);
                          }
                        }}
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleRenameIndustry(formData.industry, inlineEditSegmentInput)}
                        style={{ fontSize: '0.75rem', padding: '6px 10px', whiteSpace: 'nowrap' }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsEditingInlineSegment(false)}
                        style={{ fontSize: '0.75rem', padding: '6px 8px' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <select
                    className="form-control"
                    value={formData.industry || ''}
                    onChange={e => {
                      if (e.target.value === '__ADD_NEW__') {
                        setIsAddingInlineSegment(true);
                        setIsEditingInlineSegment(false);
                      } else if (e.target.value === '__MANAGE__') {
                        setShowSegmentModal(true);
                      } else {
                        setFormData({ ...formData, industry: e.target.value });
                        setIsEditingInlineSegment(false);
                      }
                    }}
                  >
                    <option value="">-- Select Industry --</option>
                    {segments.map(seg => (
                      <option key={seg} value={seg}>
                        {getSegmentIcon(seg)} {seg}
                      </option>
                    ))}
                    <option value="__ADD_NEW__">➕ + Add Industry...</option>
                    <option value="__MANAGE__">⚙️ Manage / Edit Industries...</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Status</label>
                  <select
                    className="form-control"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="New">New</option>
                    <option value="Follow Up">Follow Up Needed</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Proposal Sent">Proposal Sent</option>
                    <option value="Converted">Converted</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: '4px' }}>Follow-Up Date (12:00 PM Reminder)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.follow_up_date}
                    onChange={e => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ marginBottom: '4px' }}>Notes & Interaction History</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Record call discussions, client requirements, pricing quotes, etc..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(223, 231, 224, 0.1)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontWeight: 700 }}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : (editingLead ? 'Update Lead' : 'Save Lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Industries / Segments Modal */}
      {showSegmentModal && (
        <div 
          className="modal-overlay" 
          onClick={() => {
            setShowSegmentModal(false);
            setSegmentModalInput('');
            setEditingSegment(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div 
            className="modal-content glass-premium"
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid rgba(223, 231, 224, 0.18)',
              background: 'rgba(10, 14, 20, 0.98)',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85)',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <Settings2 size={18} style={{ color: '#60a5fa' }} /> Manage Industries
              </h4>
              <button 
                className="btn-icon" 
                onClick={() => {
                  setShowSegmentModal(false);
                  setSegmentModalInput('');
                  setEditingSegment(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.45 }}>
              Add new industry names or edit/rename existing ones. Renaming an industry updates all leads currently tagged with it automatically.
            </p>

            {/* Add New Industry Input */}
            <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(223, 231, 224, 0.1)' }}>
              <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '6px', display: 'block' }}>
                Add New Industry
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Interior Designers, Real Estate..."
                  value={segmentModalInput}
                  onChange={e => setSegmentModalInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSegmentFromModal();
                    }
                  }}
                  style={{ fontSize: '0.84rem' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddSegmentFromModal}
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px' }}
                >
                  <Plus size={15} /> Add
                </button>
              </div>
            </div>

            {/* Saved Industries List with Edit Options */}
            <div style={{ marginBottom: '18px' }}>
              <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Saved Industries ({segments.length})</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'none' }}>Click pencil to edit name</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {segments.map(seg => {
                  const isEditingThis = editingSegment && editingSegment.oldName === seg;
                  return (
                    <div
                      key={seg}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: isEditingThis ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                        border: isEditingThis ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(223, 231, 224, 0.08)'
                      }}
                    >
                      {isEditingThis ? (
                        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-control"
                            value={editingSegment.newName}
                            onChange={e => setEditingSegment({ ...editingSegment, newName: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameIndustry(editingSegment.oldName, editingSegment.newName);
                              } else if (e.key === 'Escape') {
                                setEditingSegment(null);
                              }
                            }}
                            autoFocus
                            style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleRenameIndustry(editingSegment.oldName, editingSegment.newName)}
                            style={{ fontSize: '0.76rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setEditingSegment(null)}
                            style={{ fontSize: '0.76rem', padding: '6px 8px' }}
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>{getSegmentIcon(seg)}</span>
                            <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{seg}</span>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditingSegment({ oldName: seg, newName: seg })}
                              style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title={`Edit industry name "${seg}"`}
                            >
                              <Edit3 size={12} style={{ color: '#38bdf8' }} /> Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteIndustry(seg)}
                              style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                              title={`Delete industry "${seg}"`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid rgba(223, 231, 224, 0.1)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowSegmentModal(false);
                  setSegmentModalInput('');
                  setEditingSegment(null);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
