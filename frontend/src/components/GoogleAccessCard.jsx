import React, { useState, useEffect, useCallback } from 'react';
import { Copy, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { API_BASE } from '../api.js';

/**
 * The "Google access" step of onboarding, shown to the client in their portal
 * and to 007 in Clients → Onboarding. Server side: src/services/googleAccess.js.
 *
 * `basePath` is /api/portal/<token>/google-access or /api/clients/<id>/google-access.
 */
export default function GoogleAccessCard({ basePath, variant = 'portal', showToast = () => {} }) {
  const [access, setAccess] = useState(null);
  const [ga4Id, setGa4Id] = useState('');
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);

  const ui = variant === 'portal'
    ? { card: 'portal-bento-card', input: 'portal-control', primary: 'portal-btn portal-btn-primary', secondary: 'portal-btn', title: { color: '#dfe7e0' }, muted: { color: '#8b9b90' } }
    : { card: '', input: 'form-control', primary: 'btn btn-primary', secondary: 'btn btn-secondary', title: {}, muted: { color: 'var(--text-muted)' } };

  const call = useCallback(async (path = '', options = {}) => {
    const res = await fetch(`${API_BASE}${basePath}${path}`, {
      credentials: 'include', cache: 'no-store',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [basePath]);

  // Loads once per client; showToast is left out so a parent that recreates it
  // each render cannot trigger a reload loop.
  useEffect(() => {
    call().then(a => { setAccess(a); setGa4Id(a.ga4.property_id || ''); }).catch(err => showToast(err.message, 'error'));
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    setBusy('check');
    try {
      const r = await call('/check', { method: 'POST', body: JSON.stringify({ ga4_property_id: ga4Id }) });
      setResults({ search_console: r.search_console, ga4: r.ga4 });
      setAccess(r.access);
      showToast(r.search_console.ok && r.ga4.ok ? 'Google access connected' : 'Some access is still missing, see below', r.search_console.ok && r.ga4.ok ? 'success' : 'warning');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const inviteSent = async () => {
    setBusy('gbp');
    try {
      setAccess(await call('/gbp-invite', { method: 'POST' }));
      showToast('Thanks, we\'ll accept the invite on our side', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => showToast('Copied', 'success')).catch(() => {});
  };

  if (!access) return null;

  const email = access.service_account_email;
  const cardStyle = variant === 'portal'
    ? { padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }
    : { border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '14px' };

  return (
    <div className={ui.card} style={cardStyle}>
      <div>
        <h3 style={{ fontSize: '0.95rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', ...ui.title }}>Google access</h3>
        <p style={{ ...ui.muted, fontSize: '0.85rem', margin: '4px 0 0' }}>
          Three one-time steps so we can report your Google results and look after your Business Profile. Read-only, except the Business Profile.
        </p>
      </div>

      <Step
        n={1} title="Search Console" ui={ui}
        status={access.search_console.connected ? ['ok', access.search_console.property] : ['todo', 'Not connected']}
        result={results.search_console}
      >
        In Search Console, open <b>Settings → Users and permissions → Add user</b>, and add this email with <b>Full</b> permission:
        <EmailLine email={email} onCopy={copy} ui={ui} />
      </Step>

      <Step
        n={2} title="Google Analytics (GA4)" ui={ui}
        status={access.ga4.connected ? ['ok', `Property ${access.ga4.property_id}`] : ['todo', 'Not connected']}
        result={results.ga4}
      >
        In GA4, open <b>Admin → Property access management → Add users</b>, add the same email as a <b>Viewer</b>, then paste your property ID (Admin → Property details):
        <EmailLine email={email} onCopy={copy} ui={ui} />
        <input className={ui.input} style={{ marginTop: '8px', maxWidth: '260px' }} inputMode="numeric" placeholder="GA4 property ID, e.g. 358910776" value={ga4Id} onChange={e => setGa4Id(e.target.value)} />
      </Step>

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button type="button" className={ui.primary} disabled={busy === 'check'} onClick={check}>
          {busy === 'check' ? 'Checking…' : 'Check Search Console and GA4'}
        </button>
      </div>

      <Step
        n={3} title="Google Business Profile" ui={ui}
        status={access.business_profile.invite_sent_at
          ? ['wait', `Invite sent ${new Date(access.business_profile.invite_sent_at.replace(' ', 'T') + 'Z').toLocaleDateString()}`]
          : ['todo', 'Not invited yet']}
      >
        {access.agency_email ? (
          <>
            On your Business Profile, open <b>⋮ → Business Profile settings → People and access → Add</b>, and add this email as a <b>Manager</b>:
            <EmailLine email={access.agency_email} onCopy={copy} ui={ui} />
            <button type="button" className={ui.secondary} style={{ marginTop: '8px' }} disabled={busy === 'gbp'} onClick={inviteSent}>
              I've sent the invite
            </button>
          </>
        ) : (
          <>We'll add the email address for this step shortly.</>
        )}
      </Step>
    </div>
  );
}

const STATUS = {
  ok: { Icon: CheckCircle, color: '#4ade80' },
  wait: { Icon: Clock, color: '#facc15' },
  todo: { Icon: AlertCircle, color: '#f87171' },
};

function Step({ n, title, status: [kind, text], result, ui, children }) {
  const { Icon, color } = STATUS[kind];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, ...ui.title }}>{n}. {title}</span>
        <span style={{ color, fontSize: '0.8rem', display: 'flex', gap: '4px', alignItems: 'center', overflowWrap: 'anywhere' }}><Icon size={14} /> {text}</span>
      </div>
      <div style={{ ...ui.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>{children}</div>
      {result && !result.ok && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{result.message}</div>}
    </div>
  );
}

function EmailLine({ email, onCopy, ui }) {
  if (!email) return <div style={{ marginTop: '6px' }}>(the email will appear here once set up)</div>;
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
      <code style={{ overflowWrap: 'anywhere', ...ui.title }}>{email}</code>
      <button type="button" className={ui.secondary} style={{ padding: '2px 8px' }} onClick={() => onCopy(email)} title="Copy"><Copy size={12} /></button>
    </div>
  );
}
