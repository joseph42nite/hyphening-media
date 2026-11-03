import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../api.js';

/**
 * "Blog pipeline" and "Publishing access" in the admin Onboarding modal.
 *
 * Pipeline settings (migration 094) say what this client's blog pipeline
 * includes and where approved posts go. They're admin-only: the client sees
 * their own requests (bottom) but can't switch anything on.
 *
 * The publishing key (095) is write-only: once saved, the form shows only
 * kind / endpoint / last 4 characters, and offers Replace, Remove and Test.
 */
const EMPTY_PIPELINE = {
  blog_publish_target: 'handoff', repo_path: '', blog_site_url: '', blog_languages: 'en',
  blog_audio_enabled: false, blog_review_required: 'none', blog_compliance_profile: 'general',
  blog_author_name: '', blog_reviewer_name: '', blog_posts_per_month: 0, blog_publish_mode: 'approve_batch',
};

const EMPTY_CREDENTIAL = { kind: 'wordpress', endpoint_url: '', username: '', secret: '' };

const TARGETS = [
  { value: 'hyphening_webhook', label: "Hyphening's own blog (signed webhook)" },
  { value: 'cms_api', label: "Client's CMS (WordPress / custom API)" },
  { value: 'repo_file', label: 'File in the site repo (commit + deploy)' },
  { value: 'handoff', label: 'Handoff (we send it, client publishes)' },
];

const languagesToText = (json) => {
  try {
    const arr = JSON.parse(json || '["en"]');
    return Array.isArray(arr) ? arr.join(', ') : 'en';
  } catch {
    return 'en';
  }
};

const h4Style = { margin: '20px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' };
const hintStyle = { fontWeight: 400, color: 'var(--text-muted)' };

export default function ClientBlogPipelineSection({ client, showToast }) {
  const [form, setForm] = useState(EMPTY_PIPELINE);
  const [prefs, setPrefs] = useState({});
  const [credential, setCredential] = useState({ set: false });
  const [credForm, setCredForm] = useState(EMPTY_CREDENTIAL);
  const [editingCred, setEditingCred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credBusy, setCredBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/clients/${client.id}/blog-pipeline`, { credentials: 'include' })
      .then(res => res.json().then(data => (res.ok ? data : Promise.reject(new Error(data.error || 'Failed to load blog pipeline')))))
      .then(data => {
        setForm({
          blog_publish_target: data.blog_publish_target || 'handoff',
          repo_path: data.repo_path || '',
          blog_site_url: data.blog_site_url || '',
          blog_languages: languagesToText(data.blog_languages),
          blog_audio_enabled: !!data.blog_audio_enabled,
          blog_review_required: data.blog_review_required || 'none',
          blog_compliance_profile: data.blog_compliance_profile || 'general',
          blog_author_name: data.blog_author_name || '',
          blog_reviewer_name: data.blog_reviewer_name || '',
          blog_posts_per_month: data.blog_posts_per_month ?? 0,
          blog_publish_mode: data.blog_publish_mode || 'approve_batch',
        });
        setPrefs({
          reviewer: data.blog_pref_reviewer_name, avoid: data.blog_pref_topics_avoid,
          requests: data.blog_pref_requests, updated_at: data.blog_prefs_updated_at,
        });
        setCredential(data.publish_credential || { set: false });
      })
      .catch(err => showToast(err.message, 'error'));
  }, [client.id]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const savePipeline = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/blog-pipeline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, blog_posts_per_month: parseInt(form.blog_posts_per_month, 10) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save blog pipeline');
      setForm(f => ({ ...f, blog_languages: languagesToText(data.blog_languages) }));
      showToast('Blog pipeline saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCredential = async () => {
    setCredBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/publish-credential`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save the key');
      setCredential(data.publish_credential);
      setCredForm(EMPTY_CREDENTIAL);
      setEditingCred(false);
      showToast('Publishing key saved (encrypted)', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCredBusy(false);
    }
  };

  const removeCredential = async () => {
    if (!window.confirm(`Remove ${client.name}'s publishing key? Posts can't be published to their CMS until a new one is saved.`)) return;
    setCredBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/publish-credential`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove the key');
      setCredential({ set: false });
      showToast('Publishing key removed', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCredBusy(false);
    }
  };

  const testCredential = async () => {
    setCredBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/publish-credential/test`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      if (data.ok) showToast(`Connection works (HTTP ${data.status})`, 'success');
      else showToast(data.error || `The site refused the key (HTTP ${data.status})`, 'error');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCredBusy(false);
    }
  };

  const needsKey = form.blog_publish_target === 'cms_api';
  const qualityBar = form.blog_compliance_profile === 'healthcare' ? 80 : 71;

  return (
    <>
      <h4 style={h4Style}>Blog pipeline <span style={{ ...hintStyle, fontSize: '0.8rem' }}>— admin only; the night pipeline reads this</span></h4>
      <div className="form-grid-2" style={{ marginBottom: '12px' }}>
        <div className="form-group">
          <label className="form-label">Where approved posts go</label>
          <select className="form-control" value={form.blog_publish_target} onChange={set('blog_publish_target')}>
            {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Blog URL <span style={hintStyle}>— live blog index</span></label>
          <input type="text" className="form-control" placeholder="https://example.com/blog" value={form.blog_site_url} onChange={set('blog_site_url')} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label className="form-label">Site repo on the Mac <span style={hintStyle}>— absolute path, leave empty if there's none</span></label>
        <input type="text" className="form-control" placeholder="/Volumes/Mac Valhalla/Projects/..." value={form.repo_path} onChange={set('repo_path')} />
      </div>
      <div className="form-grid-3" style={{ marginBottom: '12px' }}>
        <div className="form-group">
          <label className="form-label">Posts per month</label>
          <input type="number" min="0" max="60" className="form-control" value={form.blog_posts_per_month} onChange={set('blog_posts_per_month')} />
        </div>
        <div className="form-group">
          <label className="form-label">Languages <span style={hintStyle}>— codes, e.g. en, hi</span></label>
          <input type="text" className="form-control" value={form.blog_languages} onChange={set('blog_languages')} />
        </div>
        <div className="form-group">
          <label className="form-label">Approval</label>
          <select className="form-control" value={form.blog_publish_mode} onChange={set('blog_publish_mode')}>
            <option value="approve_batch">Morning batch (Approve all)</option>
            <option value="approve_each">One by one</option>
          </select>
        </div>
      </div>
      <div className="form-grid-3" style={{ marginBottom: '12px' }}>
        <div className="form-group">
          <label className="form-label">Compliance <span style={hintStyle}>— quality bar {qualityBar}/100</span></label>
          <select className="form-control" value={form.blog_compliance_profile} onChange={set('blog_compliance_profile')}>
            <option value="general">General</option>
            <option value="healthcare">Healthcare</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Review before publish</label>
          <select className="form-control" value={form.blog_review_required} onChange={set('blog_review_required')}>
            <option value="none">None (007 only)</option>
            <option value="client">Client</option>
            <option value="clinician">Clinician</option>
          </select>
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label className="form-label" style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.blog_audio_enabled} onChange={set('blog_audio_enabled')} /> Audio narration
          </label>
        </div>
      </div>
      <div className="form-grid-2" style={{ marginBottom: '12px' }}>
        <div className="form-group">
          <label className="form-label">Author byline</label>
          <input type="text" className="form-control" placeholder="e.g. Dr. Divya Sharma" value={form.blog_author_name} onChange={set('blog_author_name')} />
        </div>
        <div className="form-group">
          <label className="form-label">Reviewed by <span style={hintStyle}>— shown as "medically reviewed by" for healthcare</span></label>
          <input type="text" className="form-control" value={form.blog_reviewer_name} onChange={set('blog_reviewer_name')} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={savePipeline}>
          {saving ? 'Saving...' : 'Save Blog Pipeline'}
        </button>
      </div>

      {(prefs.reviewer || prefs.avoid || prefs.requests) && (
        <div style={{ margin: '8px 0 12px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem' }}>
          <strong>Client's requests</strong> <span style={hintStyle}>(from their portal{prefs.updated_at ? `, ${new Date(prefs.updated_at).toLocaleDateString()}` : ''}; nothing is switched on by these)</span>
          {prefs.reviewer && <div>Reviewer: {prefs.reviewer}</div>}
          {prefs.avoid && <div>Avoid: {prefs.avoid}</div>}
          {prefs.requests && <div>Requests: {prefs.requests}</div>}
        </div>
      )}

      <h4 style={h4Style}>Publishing access <span style={{ ...hintStyle, fontSize: '0.8rem' }}>— encrypted, can't be viewed after saving</span></h4>
      {!needsKey && !credential.set && (
        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Only needed when posts go to the client's CMS.
        </p>
      )}
      {credential.set && !editingCred && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ fontSize: '0.85rem' }}>
            Key set · {credential.kind} · …{credential.last4} · {credential.endpoint_url}
            {credential.updated_at && <span style={hintStyle}> · updated {new Date(credential.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" disabled={credBusy} onClick={testCredential}>Test connection</button>
            <button type="button" className="btn btn-secondary" disabled={credBusy} onClick={() => setEditingCred(true)}>Replace</button>
            <button type="button" className="btn btn-secondary" disabled={credBusy} onClick={removeCredential}>Remove</button>
          </div>
        </div>
      )}
      {(needsKey || credential.set) && (!credential.set || editingCred) && (
        <>
          <div className="form-grid-3" style={{ marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={credForm.kind} onChange={e => setCredForm({ ...credForm, kind: e.target.value })}>
                <option value="wordpress">WordPress (Application Password)</option>
                <option value="custom">Custom API (Bearer key)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{credForm.kind === 'wordpress' ? 'Site URL' : 'API endpoint'}</label>
              <input type="text" className="form-control" placeholder="https://..." value={credForm.endpoint_url} onChange={e => setCredForm({ ...credForm, endpoint_url: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Username {credForm.kind !== 'wordpress' && <span style={hintStyle}>(optional)</span>}</label>
              <input type="text" className="form-control" autoComplete="off" value={credForm.username} onChange={e => setCredForm({ ...credForm, username: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">{credForm.kind === 'wordpress' ? 'Application Password' : 'API key'}</label>
            <input type="password" className="form-control" autoComplete="new-password" value={credForm.secret} onChange={e => setCredForm({ ...credForm, secret: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {editingCred && <button type="button" className="btn btn-secondary" onClick={() => { setEditingCred(false); setCredForm(EMPTY_CREDENTIAL); }}>Cancel</button>}
            <button type="button" className="btn btn-primary" disabled={credBusy || !credForm.secret} onClick={saveCredential}>
              {credBusy ? 'Saving...' : 'Save Key'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
