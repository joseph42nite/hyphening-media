import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search } from 'lucide-react';
import { API_BASE } from '../api.js';
import logoImg from '../assets/logo.png';

const formatMonthLabel = (m) => {
  if (!m) return '-';
  const [year, month] = m.split('-');
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(month) - 1];
  return monthName ? `${monthName} ${year}` : m;
};

/**
 * Read-only script library for the cinematographer login.
 * The backend only lets this role reach /api/clients/marketing/scripts-library.
 */
export default function CinematographerScripts({ auth, setAuth, showToast }) {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchScripts = async () => {
    try {
      let res = await fetch(`${API_BASE}/api/clients/marketing/scripts-library`, { credentials: 'include' });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!refreshRes.ok) {
          localStorage.removeItem('user');
          setAuth(null);
          navigate('/login');
          return;
        }
        res = await fetch(`${API_BASE}/api/clients/marketing/scripts-library`, { credentials: 'include' });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load scripts');
      setScripts(data.scripts || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error(err);
    }
    localStorage.removeItem('user');
    setAuth(null);
    navigate('/login');
  };

  const clientNames = Array.from(new Set(scripts.map(s => s.client_name))).sort();
  const months = Array.from(new Set(scripts.map(s => s.month))).filter(Boolean).sort((a, b) => b.localeCompare(a));
  const query = search.trim().toLowerCase();

  const visible = scripts.filter(s =>
    (!clientFilter || s.client_name === clientFilter) &&
    (!monthFilter || s.month === monthFilter) &&
    (!query || s.title?.toLowerCase().includes(query) || s.script_text?.toLowerCase().includes(query))
  );

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-ambient-glow" />
      <div className="dashboard-vignette" />

      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <div className="dashboard-header-left">
            <span style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
              <img src={logoImg} alt="Hyphening Media" style={{ height: '80px', width: 'auto' }} />
            </span>
          </div>
          <div className="dashboard-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="dashboard-user-info">
              <div className="dashboard-user-name">{auth?.name}</div>
              <div className="dashboard-user-role">cinematographer</div>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary btn-logout">
              <LogOut size={16} /> <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main style={{ textAlign: 'left', padding: '24px 16px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <h3 style={{ margin: 0 }}>Client Scripts</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '8px 0 20px' }}>
          Scripts for all clients. View only.
        </p>

        <div className="dashboard-toolbar" style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-control" value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={{ maxWidth: '220px', padding: '8px' }}>
            <option value="">All clients</option>
            {clientNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="form-control" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ maxWidth: '160px', padding: '8px' }}>
            <option value="">All months</option>
            {months.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
          </select>
          <div style={{ position: 'relative', flexGrow: 1, maxWidth: '320px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search scripts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 8px 8px 30px', width: '100%' }}
            />
          </div>
        </div>

        {loading ? (
          <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading scripts...</div>
        ) : visible.length === 0 ? (
          <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No scripts found.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
            {visible.map(item => (
              <div key={item.id} className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  <span>{item.client_name}</span>
                  <span>{formatMonthLabel(item.month)}</span>
                </div>
                <h4 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {item.title}
                  <span
                    className={`badge badge-${item.format === 'long_format' ? 'info' : 'success'}`}
                    style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', lineHeight: '1', boxShadow: 'none' }}
                  >
                    {item.format === 'long_format' ? 'Long Format' : 'Reel'}
                  </span>
                </h4>

                <div style={{ maxHeight: '350px', overflowY: 'auto', padding: '14px', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.1)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {item.script_text}
                </div>

                {(item.reference_video_link || item.reaction_video_link) && (
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                    {item.reference_video_link && (
                      <a href={item.reference_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ textDecoration: 'none' }}>
                        🎥 Reference Video
                      </a>
                    )}
                    {item.reaction_video_link && (
                      <a href={item.reaction_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-warning" style={{ textDecoration: 'none' }}>
                        🎬 Reaction Video
                      </a>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Status:</span>
                  <span
                    className={`badge badge-${['Client Approved', 'Posted'].includes(item.content_status) ? 'success' : item.content_status === 'Client Rejected' ? 'danger' : 'warning'}`}
                    style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}
                  >
                    {item.content_status || 'Pending Client Approval'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
