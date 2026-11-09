import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export const TOAST_MS = 5000;
const EXIT_MS = 220;
const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };

/**
 * One toast. Each keeps its own timer, so a re-render of the app never
 * restarts it (the old single Toast took an inline onClose, which reset the
 * 5 s timer on every App render). Hover pauses it; × or Escape closes it.
 */
function ToastItem({ id, message, type, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const left = useRef(TOAST_MS);
  const startedAt = useRef(0);

  const close = () => setLeaving(true);

  useEffect(() => {
    if (leaving) {
      const t = setTimeout(() => onDismiss(id), EXIT_MS);
      return () => clearTimeout(t);
    }
    if (paused) return undefined;
    startedAt.current = Date.now();
    const t = setTimeout(close, left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (Date.now() - startedAt.current));
    };
  }, [leaving, paused, id, onDismiss]);

  const Icon = ICONS[type] || Info;
  return (
    <div
      className={`toast toast-${type}${leaving ? ' toast-leaving' : ''}${paused ? ' toast-paused' : ''}`}
      role={type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon className="toast-icon" size={18} aria-hidden="true" />
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={close} aria-label="Dismiss notification">
        <X size={16} aria-hidden="true" />
      </button>
      <span className="toast-progress" style={{ animationDuration: `${TOAST_MS}ms` }} aria-hidden="true" />
    </div>
  );
}

/** Top-right stack of toasts, newest at the bottom. Escape closes the newest. */
export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(toasts[toasts.length - 1].id); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts, onDismiss]);

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => <ToastItem key={t.id} {...t} onDismiss={onDismiss} />)}
    </div>
  );
}
