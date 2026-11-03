import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Send, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../../api.js';
import { api, muted, label, REC_COLOR, REC_LABEL, STATUS_LABEL, STATUS_COLOR, problemsOf } from './blogMonitorShared.js';

/**
 * The full draft beside the list: problems, the bots' review and the
 * actions on top, then the post. Prev / Next (or ← →) walk the queue across
 * clients so a morning's approvals are one pass. The HTML comes from the
 * server's escaping markdown renderer, never the raw draft.
 */
export default function BlogRunDrawer({ run, position, total, busy, onClose, onPrev, onNext, onApprove, onReject, onSend, showToast }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    setHtml('');
    api(`/api/blog-runs/${run.id}/preview`).then(d => setHtml(d.html)).catch(err => showToast(err.message, 'error'));
  }, [run.id, showToast]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext?.();
      if (e.key === 'ArrowLeft') onPrev?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  const problems = problemsOf(run);
  const notes = run.evidence?.worker_notes || [];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 'min(820px, 100vw)', height: '100%', background: 'var(--bg-primary, #0b0b0f)', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button className="btn btn-secondary" disabled={!onPrev} onClick={onPrev} title="Previous (←)"><ChevronLeft size={14} /></button>
              <span style={muted}>{position} of {total}</span>
              <button className="btn btn-secondary" disabled={!onNext} onClick={onNext} title="Next (→)"><ChevronRight size={14} /></button>
            </div>
            <button className="btn btn-secondary" onClick={onClose} title="Close (Esc)"><X size={14} /></button>
          </div>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...label, color: STATUS_COLOR[run.status] }}>{STATUS_LABEL[run.status]}</span>
              <span style={{ ...muted, fontWeight: 700 }}>{run.client_name}</span>
              {run.quality_score != null && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: run.passes_bar ? '#4ade80' : '#f87171' }}>{run.quality_score}/{run.quality_bar}</span>
              )}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: '4px' }}>{run.title}</div>
            <div style={muted}>{run.meta_title} · {run.meta_description}</div>
          </div>
          {run.status === 'ready' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy === `a${run.id}`} onClick={() => onApprove(run)}><CheckCircle size={14} /> Approve</button>
              <button className="btn btn-secondary" disabled={busy === `r${run.id}`} onClick={() => onReject(run)}><XCircle size={14} /> Reject</button>
              <button className="btn btn-secondary" disabled={busy === `c${run.id}`} onClick={() => onSend(run)}><Send size={14} /> Send to client</button>
              {['handoff', 'repo_file', 'cms_api'].includes(run.publish_target) && (
                <a className="btn btn-secondary" href={`${API_BASE}/api/blog-runs/${run.id}/download`} title="Download HTML"><Download size={14} /></a>
              )}
            </div>
          )}
        </header>

        <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
          {run.agent_recommendation && (
            <div style={{ fontSize: '0.85rem', marginBottom: '12px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
              <strong style={{ color: REC_COLOR[run.agent_recommendation] }}>
                {run.agent_reviewed_by || 'Bot'} recommends: {REC_LABEL[run.agent_recommendation]}
              </strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{run.agent_review}</span>
            </div>
          )}
          {problems.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ ...label, color: '#fca5a5' }}>Problems ({problems.length})</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.8rem', color: '#fca5a5' }}>
                {problems.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <details style={{ marginBottom: '12px' }}>
              <summary style={muted}>Worker notes ({notes.length})</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {notes.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </details>
          )}
          {run.cover_image_url && /^https:\/\//.test(run.cover_image_url) && (
            <img src={run.cover_image_url} alt={run.cover_alt || ''} style={{ width: '100%', borderRadius: '8px', margin: '4px 0 12px' }} />
          )}
          {run.audio_url && <audio controls src={run.audio_url} style={{ width: '100%', marginBottom: '12px' }} />}
          {html ? <div className="blog-preview" dangerouslySetInnerHTML={{ __html: html }} /> : <p style={muted}>Loading the draft…</p>}
          {run.evidence?.serp_urls?.length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={muted}>Evidence</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{JSON.stringify(run.evidence, null, 2)}</pre>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}
