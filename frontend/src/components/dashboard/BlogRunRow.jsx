import React, { useState } from 'react';
import { CheckCircle, XCircle, Eye, RefreshCw, Send, ChevronRight, ChevronDown } from 'lucide-react';
import { STATUS_LABEL, STATUS_COLOR, REC_COLOR, REC_LABEL, muted, label, problemsOf } from './blogMonitorShared.js';

/** One post in the Blog Monitor: a single compact row, problems folded until asked for. */
export default function BlogRunRow({ run, busy, onPreview, onApprove, onReject, onSend, onRetryPublish }) {
  const [open, setOpen] = useState(false);
  const problems = problemsOf(run);
  const notes = run.evidence?.worker_notes || [];

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 360px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...label, color: STATUS_COLOR[run.status] }}>{STATUS_LABEL[run.status]}</span>
          <span style={{ ...muted, fontWeight: 700 }}>{run.client_name}</span>
          {run.quality_score != null && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: run.passes_bar ? '#4ade80' : '#f87171' }}>
              {run.quality_score}/{run.quality_bar}
            </span>
          )}
          {run.audio_url ? <span style={muted}>· audio</span> : run.audio_expected && run.content && <span style={{ fontSize: '0.75rem', color: '#facc15' }}>· no audio</span>}
          {run.agent_recommendation && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: REC_COLOR[run.agent_recommendation] }}>
              · {run.agent_reviewed_by || 'Bot'}: {REC_LABEL[run.agent_recommendation]}
            </span>
          )}
        </div>
        <button type="button" onClick={() => (run.content ? onPreview(run) : null)}
          style={{ all: 'unset', cursor: run.content ? 'pointer' : 'default', fontWeight: 700, display: 'block', margin: '4px 0', overflowWrap: 'anywhere' }}>
          {run.title || `Run #${run.id}`}
        </button>
        {(problems.length > 0 || notes.length > 0) && (
          <button type="button" onClick={() => setOpen(!open)}
            style={{ all: 'unset', cursor: 'pointer', fontSize: '0.78rem', color: problems.length ? '#fca5a5' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {problems.length > 0 ? `${problems.length} problem${problems.length === 1 ? '' : 's'}` : 'No problems'}
            {notes.length > 0 && <span style={{ color: 'var(--text-muted)' }}>&nbsp;· {notes.length} worker note{notes.length === 1 ? '' : 's'}</span>}
          </button>
        )}
        {open && (
          <div style={{ marginTop: '4px' }}>
            {problems.length > 0 && (
              <ul style={{ margin: '0', paddingLeft: '18px', fontSize: '0.78rem', color: '#fca5a5' }}>
                {problems.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            {notes.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {notes.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
        )}
        {run.error && <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '4px' }}>{run.error}</div>}
        {run.reject_reason && <div style={muted}>Sent back: {run.reject_reason}</div>}
        {run.client_review_note && <div style={muted}>Client: {run.client_review_note}</div>}
        {run.published_url && <a href={run.published_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem' }}>{run.published_url}</a>}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {run.content && <button className="btn btn-secondary" onClick={() => onPreview(run)} title="Preview"><Eye size={14} /></button>}
        {run.status === 'ready' && (
          <>
            <button className="btn btn-primary" disabled={busy === `a${run.id}`} onClick={() => onApprove(run)} title="Approve and publish"><CheckCircle size={14} /> Approve</button>
            <button className="btn btn-secondary" disabled={busy === `r${run.id}`} onClick={() => onReject(run)} title="Send back for a redraft"><XCircle size={14} /></button>
            <button className="btn btn-secondary" disabled={busy === `c${run.id}`} onClick={() => onSend(run)} title="Send to the client's portal for their review"><Send size={14} /></button>
          </>
        )}
        {run.status === 'approved' && run.error && (
          <button className="btn btn-secondary" disabled={busy === `a${run.id}`} onClick={() => onRetryPublish(run)}><RefreshCw size={14} /> Retry publish</button>
        )}
      </div>
    </div>
  );
}
