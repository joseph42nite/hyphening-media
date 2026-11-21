import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../api.js';

/**
 * Reel Lab: viral reels in, five scored hooks and a script out.
 * The writing happens on the Mac (scripts/ig_worker.mjs); this queues the
 * run, shows its progress, and saves the chosen hook as a Draft script (or,
 * for "Improve hooks", back into the script it came from). Nothing is posted.
 */

const EMPTY_REF = { url: '', notes: '' };
const POLL_MS = 4000;

const verdictBadge = (v) => (v === 'STRONG' || v === 'PASS' || v === 'READY' ? 'success' : v === 'WEAK' || v === 'FLAGGED' || v === 'FAIL' ? 'danger' : 'warning');
const statusBadge = { PASS: 'success', WARN: 'warning', FAIL: 'danger' };
const fmt = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};

const box = { padding: '14px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.12)' };
const small = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
const label = { fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' };

export default function ReelLabModal({ client, month, script = null, onClose, onSaved, showToast }) {
  const mode = script ? 'improve' : 'new';
  const [view, setView] = useState('loading'); // loading | form | run
  const [refs, setRefs] = useState([{ ...EMPTY_REF }]);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState(null);
  const [connector, setConnector] = useState(null);
  const [earlier, setEarlier] = useState([]);
  const [hookIndex, setHookIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };

  const showRun = (r) => {
    setRun(r);
    setView('run');
    if (r?.result) {
      setHookIndex(0);
      setTitle(mode === 'improve' ? (script?.title || r.result.title) : r.result.title);
    }
  };

  const poll = (id) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch(`/api/reel-lab/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the run');
        setConnector(data.connector);
        if (!['queued', 'running'].includes(data.run.status)) {
          stopPolling();
          showRun(data.run);
        } else {
          setRun(data.run);
        }
      } catch (err) {
        stopPolling();
        showToast?.(err.message, 'error');
      }
    }, POLL_MS);
  };

  // On open, pick up a run already in flight (or waiting to be saved) for this client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/reel-lab?client_id=${client.id}&limit=8`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load Reel Lab');
        if (cancelled) return;
        setConnector(data.connector);
        const mine = (data.runs || []).filter((r) => (mode === 'improve' ? r.script_id === script.id : r.mode === 'new'));
        setEarlier(mine);
        const open = mine.find((r) => ['queued', 'running', 'ready'].includes(r.status));
        if (open) {
          showRun(open);
          if (['queued', 'running'].includes(open.status)) poll(open.id);
        } else {
          setView('form');
        }
      } catch (err) {
        showToast?.(err.message, 'error');
        setView('form');
      }
    })();
    return () => { cancelled = true; stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, script?.id]);

  const start = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await authFetch('/api/reel-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id, mode, script_id: script?.id || null, month,
          topic, notes, references: refs.filter((r) => r.url.trim() || r.notes.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start Reel Lab');
      if (!data.connector_online) showToast?.('The Mac is offline. The run will start when it reconnects.', 'info');
      setConnector((c) => ({ ...(c || {}), online: !!data.connector_online }));
      showRun(data.run);
      poll(data.run.id);
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/reel-lab/${run.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook_index: hookIndex, title, month: run.month }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      showToast?.(mode === 'improve' ? 'Script updated with the new hook' : 'Saved as a Draft script', 'success');
      onSaved?.(data.script_id);
      onClose();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const retry = () => {
    if (run) {
      setRefs(run.references?.length ? run.references.map((r) => ({ url: r.url || '', notes: r.notes || '' })) : [{ ...EMPTY_REF }]);
      setTopic(run.topic || '');
      setNotes(run.notes || '');
    }
    setRun(null);
    setView('form');
  };

  const setRef = (i, field, value) => setRefs(refs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const heading = mode === 'improve' ? `Improve hooks: ${script.title}` : `Reel Lab: ${client.name}`;
  const result = run?.result;
  const hook = result?.hooks?.[hookIndex];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}
        style={{ textAlign: 'left', width: '100%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>✨ {heading}</h2>
            <p style={{ ...small, margin: '6px 0 0' }}>
              {mode === 'improve'
                ? 'Five new hooks for this script, scored, with the body tightened to fit. Saving replaces the script text.'
                : 'Paste the viral reels you found. You get five scored hooks, a timed script, on-screen text and a checked caption. Saving makes a Draft script the client cannot see yet.'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '6px 12px' }}>Close</button>
        </div>

        {connector && !connector.online && (
          <div className="badge badge-warning" style={{ display: 'block', marginTop: '14px', padding: '8px 12px', whiteSpace: 'normal', textTransform: 'none' }}>
            The Mac connector is offline. Runs wait in the queue and start when it reconnects.
          </div>
        )}

        {view === 'loading' && <p style={{ ...small, marginTop: '20px' }}>Loading...</p>}

        {view === 'form' && (
          <form onSubmit={start} style={{ marginTop: '20px' }}>
            {mode === 'new' && (
              <>
                <div style={label}>Viral reels (up to 3)</div>
                <p style={{ ...small, marginTop: 0 }}>
                  The bot can't watch videos, so tell it what happens: the hook line, what's on screen, how it pays off.
                  A pasted caption or transcript is even better.
                </p>
                {refs.map((r, i) => (
                  <div key={i} style={{ ...box, marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input type="url" className="form-control" placeholder="https://www.instagram.com/reel/..." value={r.url}
                        onChange={(e) => setRef(i, 'url', e.target.value)} style={{ flexGrow: 1 }} />
                      {refs.length > 1 && (
                        <button type="button" className="btn btn-secondary" onClick={() => setRefs(refs.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>Remove</button>
                      )}
                    </div>
                    <textarea className="form-control" rows="3" value={r.notes} onChange={(e) => setRef(i, 'notes', e.target.value)}
                      placeholder={'Opens on: "Nobody tells you your first IVF cycle..."\nOn screen: big number 35, doctor walking\nPays off with: one test to ask for'} />
                  </div>
                ))}
                {refs.length < 3 && (
                  <button type="button" className="btn btn-secondary" onClick={() => setRefs([...refs, { ...EMPTY_REF }])} style={{ padding: '4px 10px', fontSize: '0.8rem', marginBottom: '16px' }}>
                    + Another reel
                  </button>
                )}
              </>
            )}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Topic {mode === 'new' ? '(optional if you described a reel)' : '(optional)'}</label>
              <input type="text" className="form-control" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Why IVF odds change after 35" />
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Notes for the writer (optional)</label>
              <textarea className="form-control" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Facts it can use, who is on camera, what to avoid" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={small}>Takes about 2 to 4 minutes. Goes into {month}.</span>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Starting...' : mode === 'improve' ? 'Write new hooks' : 'Write hooks and script'}
              </button>
            </div>
            {earlier.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={label}>Earlier runs</div>
                {earlier.slice(0, 5).map((r) => (
                  <button key={r.id} type="button" className="btn btn-secondary" onClick={() => showRun(r)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '6px', padding: '6px 10px', fontSize: '0.8rem' }}>
                    #{r.id} · {r.status} · {r.result?.title || r.topic || r.references?.[0]?.url || 'run'} · {r.created_at?.slice(0, 16)}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        {view === 'run' && run && ['queued', 'running'].includes(run.status) && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-info">{run.status === 'queued' ? 'Waiting for the Mac' : 'Writing'}</span>
              <span style={small}>Run #{run.id}. You can close this; the result waits here when you come back.</span>
            </div>
            <div style={{ ...box, marginTop: '12px', fontFamily: 'monospace', fontSize: '0.8rem', minHeight: '60px' }}>
              {(run.log || []).length ? run.log.map((l, i) => <div key={i}>{l}</div>) : <div style={small}>No progress yet.</div>}
            </div>
          </div>
        )}

        {view === 'run' && run?.status === 'failed' && (
          <div style={{ marginTop: '20px' }}>
            <div className="badge badge-danger" style={{ display: 'block', padding: '10px 12px', whiteSpace: 'normal', textTransform: 'none' }}>
              Run #{run.id} failed: {run.error}
            </div>
            <button type="button" className="btn btn-primary" onClick={retry} style={{ marginTop: '12px' }}>Try again</button>
          </div>
        )}

        {view === 'run' && run?.status === 'saved' && (
          <div style={{ marginTop: '20px' }}>
            <p>Run #{run.id} was already saved {mode === 'improve' ? 'into this script' : `as script #${run.saved_script_id}`}.</p>
            <button type="button" className="btn btn-primary" onClick={retry}>Start a new run</button>
          </div>
        )}

        {view === 'run' && run?.status === 'ready' && result && hook && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {(result.angle || result.reference_lessons?.length > 0) && (
              <div style={box}>
                {result.angle && <div><strong>The idea:</strong> {result.angle}</div>}
                {result.reference_lessons?.map((l, i) => <div key={i} style={{ ...small, marginTop: '6px' }}>Why reel {i + 1} worked: {l}</div>)}
              </div>
            )}

            <div>
              <div style={label}>Pick a hook (scored by hookscore.py, best first)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {result.hooks.map((h, i) => (
                  <label key={i} style={{ ...box, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start',
                    borderColor: i === hookIndex ? 'var(--accent, #8b5cf6)' : box.border, borderWidth: i === hookIndex ? '2px' : '1px' }}>
                    <input type="radio" name="hook" checked={i === hookIndex} onChange={() => setHookIndex(i)} style={{ marginTop: '4px' }} />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`badge badge-${verdictBadge(h.verdict)}`}>{h.score ?? '?'} {h.verdict}</span>
                        <span style={small}>{h.formula_id ? `#${h.formula_id} ` : ''}{h.formula_name}</span>
                        {h.weakest && <span style={small}>· weakest: {h.weakest}</span>}
                        {h.total_seconds != null && <span style={small}>· {Math.round(h.total_seconds)} s</span>}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '6px' }}>"{h.spoken}"</div>
                      {h.on_screen && <div style={small}>On screen: {h.on_screen}</div>}
                      {h.why && <div style={{ ...small, marginTop: '4px' }}>{h.why}</div>}
                      {h.flags?.map((f, j) => <div key={j} style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '4px' }}>⚠ {f}</div>)}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={label}>Beat sheet with this hook (beats.py)</div>
              <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <tbody>
                    {(hook.beats?.length ? hook.beats : [hook.spoken, ...result.body].map((text) => ({ text }))).map((b, i) => {
                      const cards = result.on_screen.filter((c) => c.line === i);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', verticalAlign: 'top' }}>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{b.start != null ? fmt(b.start) : ''}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap', ...small }}>{b.dur ? `${b.dur.toFixed(1)}s` : ''} {b.label}</td>
                          <td style={{ padding: '8px', width: '100%', overflowWrap: 'anywhere' }}>
                            {b.text}
                            {cards.map((c, j) => (
                              <div key={j} className="badge badge-info"
                                style={{ display: 'inline-block', marginTop: '4px', marginRight: '4px', whiteSpace: 'normal', maxWidth: '100%', textAlign: 'left' }}>
                                ON SCREEN: {c.text}
                              </div>
                            ))}
                            {b.flags?.map((f, j) => <div key={j} style={{ fontSize: '0.75rem', color: '#dc2626' }}>⚠ {f}</div>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hook.beat_notes?.map((n, i) => <div key={i} style={{ ...small, marginTop: '6px' }}>• {n}</div>)}
            </div>

            {result.caption?.text && (
              <div>
                <div style={label}>Caption (caption.py)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  <div>
                    <div style={small}>What the feed shows before "more":</div>
                    <div style={{ ...box, whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                      {result.caption.visible || result.caption.text.slice(0, 125)}{result.caption.truncated && <span style={small}> ... more</span>}
                    </div>
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ ...small, cursor: 'pointer' }}>Full caption</summary>
                      <div style={{ ...box, whiteSpace: 'pre-wrap', marginTop: '4px' }}>{result.caption.text}</div>
                    </details>
                  </div>
                  <div>
                    {result.caption.checks.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '0.8rem' }}>
                        <span className={`badge badge-${statusBadge[c.status] || 'info'}`} style={{ minWidth: '44px', textAlign: 'center' }}>{c.status}</span>
                        <span><strong>{c.check}</strong> {c.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {result.human && (
              <div>
                <div style={label}>Human score (detect.py, after humanize.py)</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`badge badge-${verdictBadge(result.human.verdict)}`}>{result.human.score} {result.human.verdict}</span>
                  {Object.entries(result.human.checks || {}).map(([k, v]) => (
                    <span key={k} style={small} title={v.detail}>{k} {Math.round(v.score)}</span>
                  ))}
                </div>
                {result.human.cleaned?.length > 0 && <div style={{ ...small, marginTop: '6px' }}>Cleaned automatically: {result.human.cleaned.join('; ')}</div>}
              </div>
            )}

            {result.placeholders?.length > 0 && (
              <div className="badge badge-warning" style={{ display: 'block', padding: '10px 12px', whiteSpace: 'normal', textTransform: 'none' }}>
                Fill these before sending to the client: {result.placeholders.join(', ')}
              </div>
            )}
            {result.notes?.map((n, i) => <div key={i} style={small}>• {n}</div>)}

            <div style={{ ...box, display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {mode === 'new' && (
                <div className="form-group" style={{ flexGrow: 1, margin: 0 }}>
                  <label className="form-label">Script title</label>
                  <input type="text" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={retry}>New run</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                  {saving ? 'Saving...' : mode === 'improve' ? 'Apply this hook to the script' : `Save as Draft (${run.month})`}
                </button>
              </div>
            </div>
            <div style={small}>Run #{run.id} · {run.model} · nothing is posted to Instagram.</div>
          </div>
        )}
      </div>
    </div>
  );
}
