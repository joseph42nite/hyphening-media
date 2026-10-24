import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../api.js';

/**
 * Manual or auto for the ads fleet. Rendered on both the SEO and Ads tabs, so
 * each loads and saves the same server-side value rather than keeping its own.
 *
 * Manual is the default. Auto lets the schedule queue ads runs unattended.
 */
export default function AdsModeToggle({ showToast }) {
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/ads/automation`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(data => setMode(data.mode))
      .catch(() => setMode(null));
  }, []);

  const toggle = async () => {
    const next = mode === 'auto' ? 'manual' : 'auto';
    if (next === 'auto' && !window.confirm('Turn the Ads fleet to AUTO? Scheduled ads runs will start queueing on their own and spend API tokens without you clicking anything.')) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/ads/automation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change mode');
      setMode(data.mode);
      showToast?.(`Ads fleet set to ${data.mode}`, 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const auto = mode === 'auto';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <button
        onClick={toggle}
        disabled={mode === null || saving}
        className={`btn ${auto ? 'btn-primary' : 'btn-secondary'}`}
        style={{ padding: '8px 16px', fontWeight: 700, borderRadius: 8, border: '1px solid rgba(223, 231, 224, 0.15)', background: auto ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255, 255, 255, 0.05)', color: auto ? '#4ade80' : 'var(--text-primary)', whiteSpace: 'nowrap' }}
        title={auto ? 'Ads runs on schedule. Click to return to manual.' : 'Ads runs only when you click them. Click to let the schedule run them.'}
      >
        {saving ? 'Saving…' : mode === null ? 'Ads: …' : `Ads: ${auto ? 'Auto' : 'Manual'}`}
      </button>
      <span style={{ fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.55)' }}>
        {auto ? 'Scheduled ads runs are on' : 'Ads run only when clicked'}
      </span>
    </div>
  );
}
