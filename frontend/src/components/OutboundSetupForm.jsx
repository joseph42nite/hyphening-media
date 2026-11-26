import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';
import { API_BASE } from '../api.js';

/**
 * The Outbound setup step of onboarding, shown only while outbound is on for
 * the client (src/services/coldOutbound.js): who the emails come from, the
 * sending domains and mailboxes, the offer, how prospects book, who answers
 * replies, the footer, and the existing customers we must never email.
 *
 * Admin:  settingsPath /api/clients/<id>/outbound/settings,  customersPath /api/clients/<id>/outbound/suppression
 * Portal: settingsPath /api/portal/<token>/outbound-setup,   customersPath /api/portal/<token>/outbound-setup/customers
 */
const PROVIDER = { titan: 'Titan', google: 'Google Workspace', microsoft: 'Microsoft 365', zoho: 'Zoho Mail', other: 'Other' };
const TOOL = { manual: 'None yet (export a list and send by hand)', instantly: 'Instantly', smartlead: 'Smartlead', other: 'Other' };
const BOOKING = { own_tool: 'Our own booking tool', booking_link: 'A booking link', reply_only: 'They reply, we arrange it' };
const SOURCE = { directories: 'Industry directories and associations', dataforseo: 'Business listings (DataForSEO)', apollo: 'Apollo', manual: 'A list we provide' };
const lines = (a) => (Array.isArray(a) ? a.join(', ') : a || '');

export default function OutboundSetupForm({ settingsPath, customersPath, variant = 'portal', showToast = () => {} }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [customers, setCustomers] = useState('');
  const [busy, setBusy] = useState(null);

  const portal = variant === 'portal';
  const ui = portal
    ? { card: 'portal-bento-card', input: 'portal-control', primary: 'portal-btn portal-btn-primary', secondary: 'portal-btn', title: { color: '#dfe7e0' }, muted: { color: '#8b9b90' } }
    : { card: '', input: 'form-control', primary: 'btn btn-primary', secondary: 'btn btn-secondary', title: {}, muted: { color: 'var(--text-muted)' } };

  const call = useCallback(async (url, options = {}) => {
    const res = await fetch(`${API_BASE}${url}`, { credentials: 'include', cache: 'no-store', headers: options.body ? { 'Content-Type': 'application/json' } : undefined, ...options });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Request failed');
    return d;
  }, []);

  const load = useCallback(async () => {
    const d = await call(settingsPath);
    setData(d);
    const s = d.settings;
    setForm({ ...s, sending_domains: lines(s.sending_domains), target_countries: lines(s.target_countries), excluded_countries: lines(s.excluded_countries) });
  }, [call, settingsPath]);
  useEffect(() => { load().catch(err => showToast(err.message, 'error')); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy('save');
    try {
      const d = await call(settingsPath, { method: 'PUT', body: JSON.stringify(form) });
      const s = d.settings;
      setForm({ ...s, sending_domains: lines(s.sending_domains), target_countries: lines(s.target_countries), excluded_countries: lines(s.excluded_countries) });
      showToast('Outbound setup saved', 'success');
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(null); }
  };

  const addCustomers = async () => {
    setBusy('customers');
    try {
      const d = await call(customersPath, { method: 'POST', body: JSON.stringify({ entries: customers, reason: 'customer' }) });
      setCustomers('');
      showToast(`${d.added} added to the do-not-contact list${d.rejected?.length ? `; not an email or domain: ${d.rejected.slice(0, 3).join(', ')}` : ''}`, 'success');
      load();
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(null); }
  };

  if (!form) return null;
  const f = (k) => ({ value: form[k] ?? '', onChange: e => setForm({ ...form, [k]: e.target.value }) });
  const label = { fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', ...ui.title };
  const hint = { fontSize: '0.75rem', display: 'block', marginTop: '3px', ...ui.muted };
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' };
  const dnc = data?.do_not_contact;
  const opt = data.options;

  return (
    <div className={ui.card} style={{ padding: portal ? '24px' : '0', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: portal ? 0 : '16px' }}>
      <div>
        {portal
          ? <h3 style={{ fontSize: '0.95rem', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', ...ui.title }}>Cold email setup</h3>
          : <h4 style={{ margin: '16px 0 4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Outbound setup</h4>}
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', ...ui.muted }}>
          What we need before the first cold email. Every prospect and email is approved before anything is sent.
        </p>
      </div>

      <div style={grid}>
        <div><label style={label}>Emails come from (name)</label><input className={ui.input} style={{ width: '100%' }} placeholder="e.g. Asha Menon" {...f('sender_name')} /></div>
        <div><label style={label}>Their role</label><input className={ui.input} style={{ width: '100%' }} placeholder="e.g. Founder" {...f('sender_title')} /></div>
      </div>

      <div style={grid}>
        <div>
          <label style={label}>Sending domains</label>
          <input className={ui.input} style={{ width: '100%' }} placeholder="getbrand.com, trybrand.com" {...f('sending_domains')} />
          <span style={hint}>Separate domains that point to the main site. Never the main website domain{data.website_url ? ` (${data.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')})` : ''}: if cold email hurts a domain's reputation, normal email from it starts landing in spam.</span>
        </div>
        <div>
          <label style={label}>Mailbox provider</label>
          <select className={ui.input} style={{ width: '100%' }} {...f('mailbox_provider')}>
            <option value="">Choose</option>
            {opt.mailbox_providers.map(p => <option key={p} value={p}>{PROVIDER[p] || p}</option>)}
          </select>
          <span style={hint}>2 or 3 mailboxes per domain, each warmed up for 3 to 4 weeks before sending.</span>
        </div>
      </div>

      <div style={grid}>
        <div><label style={label}>Number of mailboxes</label><input type="number" min="0" className={ui.input} style={{ width: '100%' }} {...f('mailboxes_count')} /></div>
        <div><label style={label}>Cold emails per mailbox per day</label><input type="number" min="1" max="50" className={ui.input} style={{ width: '100%' }} {...f('daily_cap_per_mailbox')} /><span style={hint}>20 to 30 is safe.</span></div>
        <div>
          <label style={label}>Sending tool</label>
          <select className={ui.input} style={{ width: '100%' }} {...f('sending_tool')}>
            {opt.sending_tools.map(t => <option key={t} value={t}>{TOOL[t] || t}</option>)}
          </select>
        </div>
      </div>

      <div style={grid}>
        <div><label style={label}>Countries to target</label><input className={ui.input} style={{ width: '100%' }} placeholder="India, UAE" {...f('target_countries')} /></div>
        <div><label style={label}>Never email these countries</label><input className={ui.input} style={{ width: '100%' }} {...f('excluded_countries')} /><span style={hint}>Default: {opt.default_excluded.join(', ')} (cold email to businesses there is restricted).</span></div>
      </div>

      <div>
        <label style={label}>The offer in the first email</label>
        <textarea className={ui.input} rows="2" style={{ width: '100%' }} placeholder="e.g. Send us one invoice and packing list, we send back the finished AWB draft" {...f('offer')} />
        <span style={hint}>Something useful and easy to say yes to. Not "book a 30-minute demo".</span>
      </div>

      <div style={grid}>
        <div>
          <label style={label}>How prospects book a meeting</label>
          <select className={ui.input} style={{ width: '100%' }} {...f('booking_method')}>
            <option value="">Choose</option>
            {opt.booking_methods.map(b => <option key={b} value={b}>{BOOKING[b] || b}</option>)}
          </select>
          {form.booking_method === 'own_tool' && <span style={hint}>Your tool tells us about bookings through the events link 007 gives you, so each meeting is tied to the email that got it.</span>}
        </div>
        {form.booking_method === 'booking_link' && (
          <div><label style={label}>Booking link</label><input type="url" className={ui.input} style={{ width: '100%' }} placeholder="https://..." {...f('booking_url')} /></div>
        )}
      </div>

      <div style={grid}>
        <div><label style={label}>Who answers replies</label><input className={ui.input} style={{ width: '100%' }} placeholder="Name" {...f('reply_owner_name')} /></div>
        <div><label style={label}>Their email</label><input type="email" className={ui.input} style={{ width: '100%' }} {...f('reply_owner_email')} /><span style={hint}>Positive replies go to a person, always.</span></div>
      </div>

      <div style={grid}>
        <div><label style={label}>Postal address for the footer</label><textarea className={ui.input} rows="2" style={{ width: '100%' }} {...f('postal_address')} /><span style={hint}>Required in commercial email in many countries.</span></div>
        <div><label style={label}>Opt-out line (optional)</label><textarea className={ui.input} rows="2" style={{ width: '100%' }} placeholder={'Not relevant? Reply "no" and I won\'t email again.'} {...f('opt_out_text')} /></div>
      </div>

      <div>
        <label style={label}>Where to find prospects</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '6px' }}>
          {opt.data_sources.map(d => (
            <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', ...ui.title }}>
              <input type="checkbox" checked={(form.data_sources || []).includes(d)}
                onChange={e => setForm({ ...form, data_sources: e.target.checked ? [...(form.data_sources || []), d] : (form.data_sources || []).filter(x => x !== d) })} />
              {SOURCE[d] || d}
            </label>
          ))}
        </div>
        <textarea className={ui.input} rows="2" style={{ width: '100%' }} placeholder="Associations, directories, trade shows or lists worth mining" {...f('lead_source_notes')} />
      </div>

      {!portal && (
        <div style={{ maxWidth: '240px' }}>
          <label style={label}>New prospects per run</label>
          <input type="number" min="1" max="50" className={ui.input} style={{ width: '100%' }} {...f('weekly_new_prospects')} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className={ui.primary} disabled={busy === 'save'} onClick={save} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle size={14} /> {busy === 'save' ? 'Saving...' : 'Save setup'}
        </button>
      </div>

      <div>
        <label style={label}>Existing customers (never email them)</label>
        <textarea className={ui.input} rows="3" style={{ width: '100%' }} placeholder={'One per line: an email (name@company.com) or a whole company domain (company.com)'}
          value={customers} onChange={e => setCustomers(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', ...ui.muted }}>
            {dnc ? `${dnc.count} on the do-not-contact list (${dnc.customers} customers).` : 'Unsubscribes and bounces are added automatically.'}
          </span>
          <button type="button" className={ui.secondary} disabled={!customers.trim() || busy === 'customers'} onClick={addCustomers}>
            {busy === 'customers' ? 'Adding...' : 'Add to do-not-contact'}
          </button>
        </div>
      </div>
    </div>
  );
}
