import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../api.js';

/**
 * Manual or auto for one fleet (ads, seo, blog), via /api/automation/:scope.
 * Each tab that shows a fleet loads and saves the same server-side value
 * rather than keeping its own.
 *
 * Manual is the default. Auto lets the night schedule queue that fleet's runs
 * unattended. `scheduleReady={false}` for a fleet whose night schedule isn't
 * built yet, so Auto doesn't look like it's doing something it can't.
 */
const LABELS = { ads: 'Ads', seo: 'SEO', blog: 'Blog' };

export default function FleetModeToggle({ scope, showToast, confirmText, scheduleReady = true }) {
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const label = LABELS[scope] || scope;

  useEffect(() => {
    fetch(`${API_BASE}/api/automation/${scope}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(data => setMode(data.mode))
      .catch(() => setMode(null));
  }, [scope]);

  const toggle = async () => {
    const next = mode === 'auto' ? 'manual' : 'auto';
    if (next === 'auto' && !window.confirm(confirmText || `Turn the ${label} fleet to AUTO? Scheduled ${label} runs will start on their own and spend API tokens without you clicking anything.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/automation/${scope}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change mode');
      setMode(data.mode);
      showToast?.(`${label} fleet set to ${data.mode}`, 'success');
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
        title={auto ? `${label} runs on schedule. Click to return to manual.` : `${label} runs only when you click them. Click to let the schedule run them.`}
      >
        {saving ? 'Saving…' : mode === null ? `${label}: …` : `${label}: ${auto ? 'Auto' : 'Manual'}`}
      </button>
      <span style={{ fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.55)' }}>
        {!auto ? `${label} runs only when clicked`
          : scheduleReady ? `Scheduled ${label} runs are on`
          : `Auto saved. The ${label} night schedule isn't built yet, so nothing runs on its own.`}
      </span>
    </div>
  );
}
