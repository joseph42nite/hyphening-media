import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X, Copy, Mail, Send, Trophy, MessageSquare, Ban, ExternalLink } from 'lucide-react';
import { muted, label } from './blogMonitorShared.js';
import { KIND_LABEL, STATUS_LABEL, gmailComposeUrl } from './outreachShared.js';

const field = { marginBottom: '12px' };
const linkStyle = { fontSize: '0.82rem', overflowWrap: 'anywhere' };

/**
 * One prospect: where the link would go and why, the drafted email, and the
 * step that's next. 007 edits, assigns and approves; the assignee copies the
 * email or opens it in Gmail, sends it, marks it sent, and records the outcome.
 */
export default function OutreachDrawer({ prospect: p, admin, staff, defaultCc, busy, onClose, onApprove, onReject, onSent, onOutcome, showToast }) {
  const waitingApproval = ['to_approve', 'follow_up_to_approve'].includes(p.status);
  const toSend = ['to_send', 'follow_up_to_send'].includes(p.status);
  const [draft, setDraft] = useState({});

  useEffect(() => {
    setDraft({
      email_subject: p.email_subject || '', email_body: p.email_body || '', contact_email: p.contact_email || '',
      email_cc: p.email_cc ?? defaultCc.join(', '), assigned_to: p.assigned_to || '',
    });
  }, [p.id, p.status, p.email_subject, p.email_body, p.contact_email, p.email_cc, p.assigned_to, defaultCc]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); showToast(`${what} copied`, 'success'); } catch { showToast('Could not copy', 'error'); }
  };
  const editable = admin && waitingApproval;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100vw)', height: '100%', background: 'var(--bg-primary)', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...label, color: '#a5b4fc' }}>{KIND_LABEL[p.kind]}</span>
              <span style={{ ...label }}>{STATUS_LABEL[p.status]}</span>
              <span style={{ ...muted, fontWeight: 700 }}>{p.client_name}</span>
            </div>
            <button className="btn btn-secondary" onClick={onClose} title="Close (Esc)"><X size={14} /></button>
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: '6px' }}>{p.site_domain}{p.domain_rank != null && <span style={muted}> · rank {p.domain_rank}</span>}</div>
        </header>

        <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
          <div style={field}>
            <div style={label}>Their page</div>
            <a href={p.page_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{p.page_title || p.page_url} <ExternalLink size={11} /></a>
          </div>
          {p.dead_url && <div style={field}><div style={label}>Dead link on it (to {p.competitor_domain})</div><span style={linkStyle}>{p.dead_url}</span></div>}
          {p.kind === 'competitor_gap' && p.competitor_domain && <div style={field}><div style={label}>Links to</div><span style={linkStyle}>{p.competitor_domain}</span></div>}
          <div style={field}>
            <div style={label}>We offer</div>
            {p.our_url ? <a href={p.our_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{p.our_url}</a>
              : <span style={{ fontSize: '0.82rem', color: '#facc15' }}>No matching page yet: a blog topic was added to {p.client_name}'s queue. Send once it's published.</span>}
          </div>
          {p.reason && <div style={field}><div style={label}>Why it's worth asking</div><div style={{ fontSize: '0.85rem' }}>{p.reason}</div></div>}
          <div style={field}>
            <div style={label}>Contact</div>
            <div style={{ fontSize: '0.85rem' }}>
              {p.contact_name && <>{p.contact_name} · </>}
              {editable
                ? <input className="form-control" style={{ marginTop: '4px' }} placeholder="email address (from their site)" value={draft.contact_email || ''} onChange={e => setDraft({ ...draft, contact_email: e.target.value })} />
                : (p.contact_email || <span style={{ color: '#facc15' }}>No email published</span>)}
              {p.contact_url && <div><a href={p.contact_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>Contact page</a></div>}
            </div>
          </div>

          <div style={{ ...field, borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <div style={label}>Email{p.follow_up_count > 0 || p.status.startsWith('follow_up') ? ' (follow-up)' : ''}</div>
            {editable ? (
              <>
                <input className="form-control" style={{ margin: '6px 0' }} value={draft.email_subject || ''} onChange={e => setDraft({ ...draft, email_subject: e.target.value })} />
                <textarea className="form-control" rows={10} value={draft.email_body || ''} onChange={e => setDraft({ ...draft, email_body: e.target.value })} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <input className="form-control" style={{ flex: '2 1 260px' }} placeholder="CC (internal staff)" value={draft.email_cc || ''} onChange={e => setDraft({ ...draft, email_cc: e.target.value })} />
                  <select className="form-control" style={{ flex: '1 1 180px' }} value={draft.assigned_to || ''} onChange={e => setDraft({ ...draft, assigned_to: e.target.value })}>
                    <option value="">Who sends it?</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', marginTop: '6px' }}>
                <div style={{ fontWeight: 700 }}>{p.email_subject}</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '6px 0 0' }}>{p.email_body}</pre>
                {p.email_cc && <div style={{ ...muted, marginTop: '6px' }}>CC: {p.email_cc}</div>}
                {p.assignee_name && <div style={muted}>Sent by: {p.assignee_name}</div>}
              </div>
            )}
          </div>
          {p.reply_note && <div style={field}><div style={label}>Notes</div><div style={{ fontSize: '0.85rem' }}>{p.reply_note}</div></div>}
          {p.live_url && <div style={field}><div style={label}>Live link</div><a href={p.live_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{p.live_url}</a>{p.link_verified_at && <span style={muted}> · checked {p.link_verified_at}</span>}</div>}
        </div>

        <footer style={{ padding: '12px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {editable && (
            <>
              <button className="btn btn-primary" disabled={busy === `a${p.id}`} onClick={() => onApprove(p, draft)}><CheckCircle size={14} /> Approve</button>
              <button className="btn btn-secondary" disabled={busy === `r${p.id}`} onClick={() => onReject(p)}><XCircle size={14} /> {p.status === 'follow_up_to_approve' ? 'No follow-up (lost)' : 'Reject'}</button>
            </>
          )}
          {toSend && (
            <>
              <a className="btn btn-primary" href={gmailComposeUrl(p)} target="_blank" rel="noopener noreferrer"><Mail size={14} /> Open in Gmail</a>
              <button className="btn btn-secondary" onClick={() => copy(p.email_subject, 'Subject')}><Copy size={14} /> Subject</button>
              <button className="btn btn-secondary" onClick={() => copy(p.email_body, 'Email')}><Copy size={14} /> Email</button>
              <button className="btn btn-secondary" disabled={busy === `s${p.id}`} onClick={() => onSent(p)}><Send size={14} /> Mark sent</button>
            </>
          )}
          {['sent', 'replied', 'follow_up_to_approve'].includes(p.status) && (
            <>
              {p.status === 'sent' && <button className="btn btn-secondary" onClick={() => onOutcome(p, 'replied')}><MessageSquare size={14} /> Replied</button>}
              <button className="btn btn-secondary" onClick={() => onOutcome(p, 'won')}><Trophy size={14} /> Link is live</button>
              <button className="btn btn-secondary" onClick={() => onOutcome(p, 'lost')}><Ban size={14} /> Lost</button>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
