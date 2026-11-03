import React, { useEffect, useState } from 'react';
import { Rocket, Trash2, X, ChevronLeft, ChevronRight, Moon, EyeOff } from 'lucide-react';
import { muted, label } from './blogMonitorShared.js';
import { BATCH_LABEL, BATCH_COLOR } from './seoNightShared.js';

const section = { marginBottom: '18px' };
const item = { borderTop: '1px solid var(--border-color)', padding: '10px 0' };

/** A diff with added and removed lines coloured, folded until asked for. */
function Diff({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div style={{ marginTop: '6px' }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ all: 'unset', cursor: 'pointer', ...muted }}>{open ? '▾ Hide code change' : '▸ Show code change'}</button>
      {open && (
        <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '6px', maxHeight: '360px', overflowY: 'auto', margin: '6px 0 0' }}>
          {text.split('\n').map((l, i) => (
            <div key={i} style={{ color: l.startsWith('+') && !l.startsWith('+++') ? '#4ade80' : l.startsWith('-') && !l.startsWith('---') ? '#f87171' : 'var(--text-muted)' }}>{l || ' '}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

/**
 * One client's night in full: every fix with its before/after and code
 * change, what needs 007 (Fix tonight / Ignore), what failed, the deploy log,
 * and Deploy / Discard. ‹ › (or the arrow keys) move between clients.
 */
export default function SeoNightDrawer({ client, position, total, busy, onClose, onPrev, onNext, onDeploy, onDiscard, onFixTonight, onIgnore }) {
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

  const b = client.batch;
  const ready = client.fixes.filter(f => f.status === 'ready_to_deploy');
  const done = client.fixes.filter(f => f.status === 'completed');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 'min(860px, 100vw)', height: '100%', background: 'var(--bg-primary)', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button className="btn btn-secondary" disabled={!onPrev} onClick={onPrev} title="Previous client (←)"><ChevronLeft size={14} /></button>
              <span style={muted}>{position} of {total}</span>
              <button className="btn btn-secondary" disabled={!onNext} onClick={onNext} title="Next client (→)"><ChevronRight size={14} /></button>
            </div>
            <button className="btn btn-secondary" onClick={onClose} title="Close (Esc)"><X size={14} /></button>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{client.client_name}</div>
            {b && <div style={{ ...label, color: BATCH_COLOR[b.status], marginTop: '2px' }}>{BATCH_LABEL[b.status]} · night of {b.night}{b.summary ? ` · ${b.summary}` : ''}</div>}
            {client.setup && <div style={{ fontSize: '0.8rem', color: '#facc15', marginTop: '4px' }}>{client.setup}</div>}
          </div>
          {b?.status === 'ready' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" disabled={busy === `d${b.id}`} onClick={() => onDeploy(client)}><Rocket size={14} /> Deploy {ready.length} fix{ready.length === 1 ? '' : 'es'}</button>
              <button className="btn btn-secondary" disabled={busy === `x${b.id}`} onClick={() => onDiscard(client)}><Trash2 size={14} /> Discard</button>
            </div>
          )}
        </header>

        <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
          {b?.error && <div style={{ ...section, fontSize: '0.85rem', color: '#fca5a5' }}>{b.error}</div>}

          {(ready.length > 0 || done.length > 0) && (
            <div style={section}>
              <div style={{ ...label, color: '#4ade80' }}>{done.length ? `Live (${done.length})` : `Ready to deploy (${ready.length})`}</div>
              {[...ready, ...done].map(f => (
                <div key={f.id} style={item}>
                  <div style={{ fontWeight: 700 }}>{f.metric} <span style={muted}>· {f.priority}{f.page_url ? ` · ${f.page_url}` : ''}</span></div>
                  <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>{f.fix_summary}</div>
                  <Diff text={f.fix_diff} />
                </div>
              ))}
            </div>
          )}

          {client.needs_007.length > 0 && (
            <div style={section}>
              <div style={{ ...label, color: '#facc15' }}>Needs you ({client.needs_007.length})</div>
              <div style={{ ...muted, marginTop: '2px' }}>Outside the safe list. "Fix tonight" lets the night worker make the change; it still waits for Deploy.</div>
              {client.needs_007.map(f => (
                <div key={f.id} style={{ ...item, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 400px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{f.metric} <span style={muted}>· {f.priority}</span></div>
                    <div style={{ fontSize: '0.82rem', marginTop: '2px' }}>{f.action_required}</div>
                    {f.fix_reason && <div style={{ ...muted, marginTop: '2px' }}>Why it needs you: {f.fix_reason}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <button className="btn btn-secondary" disabled={busy === `f${f.id}`} onClick={() => onFixTonight(f)} title="Let the night worker make this change"><Moon size={14} /> Fix tonight</button>
                    <button className="btn btn-secondary" disabled={busy === `i${f.id}`} onClick={() => onIgnore(f)} title="Ignore this recommendation"><EyeOff size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {client.failed.length > 0 && (
            <div style={section}>
              <div style={{ ...label, color: '#f87171' }}>Failed ({client.failed.length})</div>
              {client.failed.map(f => (
                <div key={f.id} style={{ ...item, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 400px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{f.metric}</div>
                    <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '2px', overflowWrap: 'anywhere' }}>{f.fix_error}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <button className="btn btn-secondary" disabled={busy === `f${f.id}`} onClick={() => onFixTonight(f)}><Moon size={14} /> Try again tonight</button>
                    <button className="btn btn-secondary" disabled={busy === `i${f.id}`} onClick={() => onIgnore(f)} title="Ignore"><EyeOff size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {b?.log && (
            <details style={section}>
              <summary style={muted}>Deploy log</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.72rem' }}>{b.log}</pre>
            </details>
          )}

          {!b && client.needs_007.length === 0 && <p style={muted}>No night fixes yet for this client.</p>}
        </div>
      </aside>
    </div>
  );
}
