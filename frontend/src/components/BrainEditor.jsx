import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { API_BASE } from '../api.js';

/**
 * The client's Brain: what they sell, to whom, and the claims they can back
 * up. Every marketing-skills run reads it (src/services/clientBrain.js).
 * Shown to the client in their portal's Onboarding tab and to 007 in
 * Clients → Onboarding.
 *
 * `basePath` is /api/portal/<token>/brain or /api/clients/<id>/brain.
 */
export default function BrainEditor({ basePath, variant = 'portal', showToast = () => {} }) {
  const [meta, setMeta] = useState(null);
  const [sections, setSections] = useState({});
  const [claims, setClaims] = useState([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const portal = variant === 'portal';
  const ui = portal
    ? { card: 'portal-bento-card', input: 'portal-control', primary: 'portal-btn portal-btn-primary', secondary: 'portal-btn', title: { color: '#dfe7e0' }, muted: { color: '#8b9b90' } }
    : { card: '', input: 'form-control', primary: 'btn btn-primary', secondary: 'btn btn-secondary', title: {}, muted: { color: 'var(--text-muted)' } };

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}${basePath}`, { credentials: 'include', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not load the Brain');
    setMeta({ list: data.sections, version: data.brain.version, updated_at: data.brain.updated_at, updated_by: data.brain.updated_by, learnings: data.brain.learnings });
    setSections(data.brain.sections || {});
    setClaims(data.brain.claims?.length ? data.brain.claims : []);
  }, [basePath]);

  useEffect(() => { load().catch(err => showToast(err.message, 'error')); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const body = { sections: Object.fromEntries(meta.list.map(s => [s.key, sections[s.key] || ''])), claims: claims.filter(c => c.claim?.trim()) };
      const res = await fetch(`${API_BASE}${basePath}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setMeta(m => ({ ...m, version: data.brain.version, updated_at: data.brain.updated_at, updated_by: data.brain.updated_by }));
      showToast(data.unchanged ? 'No changes to save' : `Saved (version ${data.brain.version})`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!meta) return null;
  const filled = meta.list.filter(s => (sections[s.key] || '').trim()).length;
  const label = { fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', ...ui.title };

  return (
    <div className={ui.card} style={{ padding: portal ? '24px' : '0', marginBottom: portal ? 0 : '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          {portal
            ? <h3 style={{ fontSize: '0.95rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', ...ui.title }}>What you sell, and to whom</h3>
            : <h4 style={{ margin: '16px 0 4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Client Brain (→ product-marketing.md)</h4>}
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', ...ui.muted }}>
            {portal
              ? 'Every email, page and campaign we write for you starts from this. Plain words are best; skip anything you don\'t know.'
              : 'Read by every marketing-skills run (Outbound and the coming monitors). The client can fill this in from their portal.'}
            {' '}{filled} of {meta.list.length} filled{meta.version ? ` · version ${meta.version}${meta.updated_by ? ` by ${meta.updated_by}` : ''}` : ''}.
          </p>
        </div>
        <button type="button" className={ui.secondary} onClick={() => setOpen(!open)} style={{ fontSize: '0.8rem' }}>{open ? 'Hide' : 'Open'}</button>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
          {meta.list.map(s => (
            <div key={s.key}>
              <label style={label}>{s.label}</label>
              <span style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px', ...ui.muted }}>{s.hint}</span>
              <textarea className={ui.input} rows={(sections[s.key] || '').length > 200 ? 5 : 3} style={{ width: '100%' }}
                value={sections[s.key] || ''} onChange={e => setSections({ ...sections, [s.key]: e.target.value })} />
            </div>
          ))}

          <div>
            <label style={label}>Claims we can make</label>
            <span style={{ fontSize: '0.75rem', display: 'block', marginBottom: '6px', ...ui.muted }}>
              Facts about the product or results that emails and pages may state, each with where it comes from (a page, a report, a customer's permission). Nothing outside this list gets claimed.
            </span>
            {claims.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <input className={ui.input} style={{ flex: '2 1 240px' }} placeholder="e.g. Builds the AWB draft from the invoice in under 20 seconds" value={c.claim || ''}
                  onChange={e => setClaims(claims.map((x, j) => (j === i ? { ...x, claim: e.target.value } : x)))} />
                <input className={ui.input} style={{ flex: '1 1 160px' }} placeholder="Source" value={c.source || ''}
                  onChange={e => setClaims(claims.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))} />
                <button type="button" className={ui.secondary} title="Remove" onClick={() => setClaims(claims.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className={ui.secondary} style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => setClaims([...claims, { claim: '', source: '' }])}><Plus size={13} /> Add a claim</button>
          </div>

          {meta.learnings?.length > 0 && (
            <div>
              <label style={label}>What we've learned</label>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', ...ui.muted }}>
                {meta.learnings.map((l, i) => <li key={i}>{l.date}: {l.learning} ({l.status})</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className={ui.primary} disabled={saving} onClick={save} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
