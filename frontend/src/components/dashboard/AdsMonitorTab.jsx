import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Terminal, Loader2, XCircle, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Minus, Database, ListChecks, X, ChevronRight, ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { API_BASE } from '../../api.js';

const IN_FLIGHT = ['queued', 'running'];

// ---------------------------------------------------------------------------
// Formatting
//
// Every number on this tab comes from the server's fact pack already computed.
// These functions only decide how it is written — none of them derives a value,
// which is the same rule the agents run under. A percentage assembled in the
// browser would eventually disagree with the report it sits beside.
// ---------------------------------------------------------------------------

/** ₹16,800 — full rupees, Indian digit grouping, never "16.8k". Abbreviating
 *  a spend figure is how two numbers an order of magnitude apart come to look
 *  alike at a glance, which is precisely what this tab exists to prevent. */
function inr(value, { decimals = 0 } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function num(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString('en-IN');
}

function pct(value, dp = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(dp)}%`;
}

/**
 * Direction colouring for a month-on-month change.
 *
 * `lowerIsBetter` exists because half the metrics on this tab invert: spend and
 * leads rising is usually good, cost per lead rising is not. Colouring every
 * increase green would paint a worsening account in the colour of success.
 */
function Delta({ value, lowerIsBetter = false, suffix = '' }) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const flat = Math.abs(v) < 0.5;
  const good = lowerIsBetter ? v < 0 : v > 0;
  const color = flat ? 'rgba(223, 231, 224, 0.45)' : good ? '#4ade80' : '#f87171';
  const Icon = flat ? Minus : v > 0 ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontSize: '0.72rem', fontWeight: 700 }}>
      <Icon size={12} />{v > 0 ? '+' : ''}{v.toFixed(1)}%{suffix}
    </span>
  );
}

function freshnessColor(freshness) {
  if (freshness === 'fresh') return '#4ade80';
  if (freshness === 'stale') return '#eab308';
  return 'rgba(223, 231, 224, 0.25)';
}

/**
 * Score colour, using the SEO monitor's thresholds verbatim.
 *
 * Both tabs show a 0-100 score on a card, and a 72 that is amber on one tab and
 * green on the other is worse than no colour at all — it makes the colour mean
 * "which tab am I on" rather than "how is this doing".
 */
function scoreColor(score) {
  if (score == null) return 'var(--text-muted)';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#38bdf8';
  return '#e0231c';
}

const PRIORITY_STYLE = {
  Critical: { bg: 'rgba(239, 68, 68, 0.18)', fg: '#fca5a5', bd: 'rgba(239, 68, 68, 0.45)' },
  High: { bg: 'rgba(251, 146, 60, 0.16)', fg: '#fdba74', bd: 'rgba(251, 146, 60, 0.4)' },
  Medium: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#fde047', bd: 'rgba(234, 179, 8, 0.35)' },
  Low: { bg: 'rgba(148, 163, 184, 0.14)', fg: '#cbd5e1', bd: 'rgba(148, 163, 184, 0.3)' },
};

/** "4m 12s". SQLite timestamps are UTC with no zone marker; without the Z the
 *  browser reads them as local time and the counter starts hours off. */
function elapsed(sinceIso, now) {
  if (!sinceIso) return '';
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(sinceIso) ? sinceIso : `${sinceIso.replace(' ', 'T')}Z`;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return '';
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return mins < 60 ? `${mins}m ${secs % 60}s` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const panel = {
  background: 'rgba(12, 16, 24, 0.85)',
  border: '1px solid rgba(223, 231, 224, 0.12)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
};

const heading = {
  fontFamily: 'Space Grotesk, sans-serif',
  color: 'var(--text-primary)',
  fontWeight: 700,
};

// ---------------------------------------------------------------------------

export default function AdsMonitorTab({ auth, clients, showToast }) {
  const marketingClients = clients.filter(c => c.client_type === 'marketing');

  const [selectedClientId, setSelectedClientId] = useState(
    () => localStorage.getItem('ads_monitor_selected_client_id') || ''
  );
  const [agents, setAgents] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [dataGaps, setDataGaps] = useState([]);
  const [monthsAvailable, setMonthsAvailable] = useState([]);
  const [focusMonth, setFocusMonth] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [activeRuns, setActiveRuns] = useState({});
  const [overview, setOverview] = useState(null);
  const [facts, setFacts] = useState(null);
  const [openAudit, setOpenAudit] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirmRerun, setConfirmRerun] = useState(null);
  // Collapsed by default. These cards are inventory, not a to-do list: nothing
  // about them changes until somebody decides to run a new platform.
  const [showNotConnected, setShowNotConnected] = useState(false);
  const [googleAds, setGoogleAds] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncPlan, setSyncPlan] = useState(null);

  const consoleEndRef = useRef(null);
  const isAdmin = auth?.role === 'admin' || auth?.role === 'super_admin';

  // A live elapsed counter is what distinguishes a card that is working from a
  // card that is stuck. Ticks only while something is in flight.
  useEffect(() => {
    if (!Object.keys(activeRuns).length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeRuns]);

  useEffect(() => {
    if (isConsoleOpen) consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs, isConsoleOpen]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/overview`, { credentials: 'include' });
      if (res.ok) setOverview(await res.json());
    } catch (err) {
      console.error('[ADS TAB] Overview fetch failed:', err);
    }
  }, []);

  const fetchClient = useCallback(async (clientId, month = null) => {
    if (!clientId) return;
    setLoading(true);
    try {
      const q = month ? `?month=${month}` : '';
      const [statusRes, recsRes] = await Promise.all([
        fetch(`${API_BASE}/api/clients/${clientId}/ads/agents/status${q}`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/clients/${clientId}/ads/recommendations?status=open`, { credentials: 'include' }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setAgents(data.agents || []);
        setSnapshot(data.snapshot || null);
        setDataGaps(data.dataGaps || []);
        setMonthsAvailable(data.monthsAvailable || []);
        setGoogleAds(data.googleAds || null);
        setFocusMonth(data.focusMonth || null);
        // Hydrated from the database, not from this component's memory, so a
        // refresh mid-run shows "Running" rather than offering a second,
        // duplicate Run button.
        const running = {};
        for (const a of data.agents || []) if (a.activeRun) running[a.agentType] = a.activeRun;
        setActiveRuns(running);
      }
      if (recsRes.ok) setRecommendations(await recsRes.json());
    } catch (err) {
      console.error('[ADS TAB] Client fetch failed:', err);
      showToast?.('Could not load the ads fleet for this client.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => { if (selectedClientId) fetchClient(selectedClientId); }, [selectedClientId, fetchClient]);

  // Live updates. Same event contract as the SEO fleet, different event names.
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });

    es.addEventListener('ads_agent_log', (e) => {
      const data = JSON.parse(e.data);
      if (!selectedClientId || String(data.clientId) === String(selectedClientId)) {
        setConsoleLogs(prev => [...prev.slice(-400), { data, at: new Date() }]);
      }
    });

    es.addEventListener('ads_agent_status', (e) => {
      const data = JSON.parse(e.data);
      fetchOverview();
      if (String(data.clientId) !== String(selectedClientId)) return;

      setActiveRuns(prev => {
        const next = { ...prev };
        if (IN_FLIGHT.includes(data.status)) {
          next[data.agentType] = {
            id: data.runId,
            status: data.status,
            startedAt: next[data.agentType]?.startedAt || new Date().toISOString(),
          };
        } else {
          delete next[data.agentType];
        }
        return next;
      });

      if (!IN_FLIGHT.includes(data.status)) {
        showToast?.(
          `Ads agent '${data.agentType}' ${data.status.replace('_', ' ')}.`,
          data.status === 'completed' ? 'success' : 'error'
        );
        fetchClient(selectedClientId, focusMonth);
      }
    });

    es.addEventListener('ads_audit_created', (e) => {
      const data = JSON.parse(e.data);
      if (String(data.clientId) === String(selectedClientId)) fetchClient(selectedClientId, focusMonth);
    });

    return () => es.close();
  }, [selectedClientId, focusMonth, fetchClient, fetchOverview, showToast]);

  const trigger = async (agentType, force = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/trigger/${agentType}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, month: focusMonth }),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === 'still_fresh') {
        // The confirmation carries whether the underlying numbers changed,
        // which is a far better reason to skip a re-run than age alone.
        setConfirmRerun({ agentType, ...data });
        return;
      }
      if (!res.ok) {
        showToast?.(data.message || data.error || 'Could not queue that agent.', 'error');
        return;
      }

      setActiveRuns(prev => ({
        ...prev,
        [agentType]: { id: data.runId, status: 'queued', startedAt: new Date().toISOString() },
      }));
      setConsoleLogs(prev => [...prev, {
        data: { agentType, runId: data.runId, log: `[SYSTEM] ${data.message}` },
        at: new Date(),
      }]);
      setIsConsoleOpen(true);
      showToast?.(data.message, 'success');
    } catch (err) {
      showToast?.(`Trigger failed: ${err.message}`, 'error');
    }
  };

  const cancel = async (runId) => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/runs/${runId}/cancel`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        showToast?.('Run cancelled — the queue slot is free.', 'info');
        fetchClient(selectedClientId, focusMonth);
      }
    } catch (err) {
      showToast?.(`Cancel failed: ${err.message}`, 'error');
    }
  };

  /** Queues every agent that can actually run, skipping the blocked ones so the
   *  server is not asked for something it is about to refuse. */
  const runAll = async () => {
    const runnable = agents.filter(a => !a.blockedReason && a.agentType !== 'audit' && !activeRuns[a.agentType]);
    if (!runnable.length) {
      showToast?.('Nothing to run — every agent is either blocked or already in flight.', 'info');
      return;
    }
    showToast?.(`Queueing ${runnable.length} agents...`, 'info');
    setIsConsoleOpen(true);
    for (const agent of runnable) {
      // Sequential: the trigger route's dedupe is per agent, but firing twelve
      // requests at once only puts them in the same queue a moment sooner.
      await trigger(agent.agentType, true);
    }
  };

  const setRecStatus = async (rec, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/recommendations/${rec.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setRecommendations(prev => prev.filter(r => r.id !== rec.id));
        fetchOverview();
      }
    } catch (err) {
      showToast?.(`Could not update: ${err.message}`, 'error');
    }
  };

  const toTask = async (rec) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/recommendations/${rec.id}/convert-task`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: rec.priority === 'Critical' ? 'high' : 'medium' }),
      });
      if (res.ok) {
        showToast?.('Added to the Kanban board.', 'success');
        setRecommendations(prev => prev.filter(r => r.id !== rec.id));
        fetchOverview();
      }
    } catch (err) {
      showToast?.(`Could not convert: ${err.message}`, 'error');
    }
  };

  /**
   * Pulls campaigns from Google Ads.
   *
   * Dry run by default: the first thing shown is what WOULD be written, with
   * any collision against hand-typed rows and the account's currency. The write
   * is a second, deliberate click. A sync that wrote on the first press would
   * be the one time nobody looked.
   */
  const runSync = async (dryRun = true) => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/sync?dryRun=${dryRun}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthsBack: 3 }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSyncPlan(null);
        showToast?.(data.message || 'Sync failed.', 'error');
        return;
      }

      if (dryRun) {
        setSyncPlan(data);
      } else {
        setSyncPlan(null);
        showToast?.(
          `Synced ${data.account.name}: ${data.toInsert} added, ${data.toUpdate} updated` +
          (data.skippedManual ? `, ${data.skippedManual} left alone (entered by hand)` : ''),
          'success',
        );
        fetchClient(selectedClientId, focusMonth);
        fetchOverview();
      }
    } catch (err) {
      showToast?.(`Sync failed: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const loadFacts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/facts?month=${focusMonth || ''}`, {
        credentials: 'include',
      });
      if (res.ok) setFacts(await res.json());
    } catch (err) {
      showToast?.(`Could not load the fact pack: ${err.message}`, 'error');
    }
  };

  const openAuditDetail = async (auditId) => {
    if (!auditId) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/ads/audits/${auditId}`, {
        credentials: 'include',
      });
      if (res.ok) setOpenAudit(await res.json());
    } catch (err) {
      showToast?.(`Could not load that report: ${err.message}`, 'error');
    }
  };

  // Grouped by what the card asks of you, not by whether it happens to be
  // blocked: "add some campaign rows" and "this agency does not run TikTok" are
  // the same state to the server and completely different to a person.
  const groups = { ready: [], needsData: [], notConnected: [] };
  for (const agent of agents) {
    if (!agent.blockedReason) groups.ready.push(agent);
    else if (agent.blockedPermanently) groups.notConnected.push(agent);
    else groups.needsData.push(agent);
  }

  const selectedClient = marketingClients.find(c => String(c.id) === String(selectedClientId));

  return (
    <div>
      {/* ---------------- All clients: the monitoring surface ---------------- */}
      {overview && (
        <div className="card glass-premium" style={{ ...panel, marginBottom: 20, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <h3 style={{ ...heading, margin: 0, fontSize: '1.25rem' }}>Ads Monitor</h3>
            <span style={{ fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.55)' }}>
              {overview.queue.active.length} run{overview.queue.active.length === 1 ? '' : 's'} in flight · {overview.month}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {overview.clients.map(row => (
              <button
                key={row.clientId}
                onClick={() => {
                  setSelectedClientId(String(row.clientId));
                  localStorage.setItem('ads_monitor_selected_client_id', String(row.clientId));
                }}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  background: String(row.clientId) === String(selectedClientId)
                    ? 'rgba(224, 35, 28, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${row.criticalRecommendations > 0 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(223, 231, 224, 0.1)'}`,
                  borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: '0.9rem' }}>{row.clientName}</strong>
                  {row.inFlight > 0 && <Loader2 size={13} className="spin" style={{ color: '#60a5fa' }} />}
                </div>

                {row.spendInr != null ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.75)' }}>
                    <span>{inr(row.spendInr)} spend</span>
                    <span>{num(row.leads)} leads</span>
                    <span>{inr(row.cplInr)} CPL <Delta value={row.momCplPct} lowerIsBetter /></span>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.45)' }}>
                    No campaign data recorded
                  </div>
                )}

                {/* Stale spend is called out rather than left to be inferred from
                    a month label — a client whose last campaign row is two
                    months old otherwise looks identical to one with none. */}
                {row.spendInr != null && !row.spendCurrent && (
                  <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#fbbf24' }}>
                    Latest spend is {row.focusMonth}, not {overview.month}
                  </div>
                )}

                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {row.criticalRecommendations > 0 && (
                    <Pill tone="critical">{row.criticalRecommendations} critical</Pill>
                  )}
                  {row.openRecommendations > 0 && <Pill>{row.openRecommendations} open</Pill>}
                  {row.agentsDue > 0 && <Pill tone="warn">{row.agentsDue} due</Pill>}
                  {row.agentsBlocked > 0 && <Pill tone="muted">{row.agentsBlocked} blocked</Pill>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Client selector ---------------- */}
      <div className="card glass-premium" style={{ ...panel, marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Active client:</span>
          <select
            className="form-control"
            style={{ minWidth: 220, flexGrow: 1, fontWeight: 600, background: 'rgba(5, 7, 10, 0.8)', color: 'var(--text-primary)', border: '1px solid rgba(223, 231, 224, 0.2)', borderRadius: 6 }}
            value={selectedClientId}
            onChange={e => {
              setSelectedClientId(e.target.value);
              localStorage.setItem('ads_monitor_selected_client_id', e.target.value);
              setConsoleLogs([]);
              setFacts(null);
              setOpenAudit(null);
            }}
          >
            <option value="">Select a client…</option>
            {marketingClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {monthsAvailable.length > 1 && (
            <select
              className="form-control"
              style={{ width: 130, background: 'rgba(5, 7, 10, 0.8)', color: 'var(--text-primary)', border: '1px solid rgba(223, 231, 224, 0.2)', borderRadius: 6 }}
              value={focusMonth || ''}
              onChange={e => { setFocusMonth(e.target.value); fetchClient(selectedClientId, e.target.value); }}
            >
              {monthsAvailable.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          {selectedClientId && (
            <>
              <button onClick={runAll} disabled={!isAdmin} className="btn btn-primary"
                style={{ padding: '9px 16px', fontWeight: 700, borderRadius: 8, border: '1px solid rgba(224, 35, 28, 0.5)', background: 'linear-gradient(135deg, #e0231c 0%, #b51a14 100%)', color: '#fff', opacity: isAdmin ? 1 : 0.5 }}
                title={isAdmin ? 'Queue every agent that has the data to run' : 'Runs cost tokens, so they are limited to admins'}>
                <Play size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Run the fleet
              </button>
              <button onClick={() => setIsConsoleOpen(v => !v)} className="btn btn-secondary"
                style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, background: isConsoleOpen ? 'rgba(224, 35, 28, 0.18)' : 'rgba(255, 255, 255, 0.05)', color: isConsoleOpen ? '#fca5a5' : 'var(--text-primary)', border: '1px solid rgba(223, 231, 224, 0.15)' }}>
                <Terminal size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Console ({consoleLogs.length})
              </button>
              {googleAds?.configured && (
                <button onClick={() => runSync(true)} disabled={syncing || !isAdmin} className="btn btn-secondary"
                  style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, background: 'rgba(96, 165, 250, 0.12)', color: '#93c5fd', border: '1px solid rgba(96, 165, 250, 0.35)', cursor: syncing || !isAdmin ? 'not-allowed' : 'pointer' }}
                  title={googleAds.lastSyncedAt
                    ? `Last synced ${new Date(`${googleAds.lastSyncedAt.replace(' ', 'T')}Z`).toLocaleString()}`
                    : 'Never synced'}>
                  {syncing
                    ? <Loader2 size={15} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />
                    : <RefreshCw size={15} style={{ verticalAlign: -2, marginRight: 6 }} />}
                  Sync Google Ads
                </button>
              )}
              <button onClick={() => (facts ? setFacts(null) : loadFacts())} className="btn btn-secondary"
                style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', border: '1px solid rgba(223, 231, 224, 0.15)' }}
                title="The exact numbers every agent is given. Every figure in every report traces to this.">
                <Database size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Fact pack
              </button>
            </>
          )}
        </div>
      </div>

      {!selectedClientId ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'rgba(12, 16, 24, 0.6)', borderRadius: 12, border: '1px dashed rgba(223, 231, 224, 0.15)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-muted)' }}>
            Pick a client above, or click one of the cards, to load its ads fleet.
          </p>
        </div>
      ) : (
        <>
          {/* ---------------- Snapshot ---------------- */}
          {snapshot && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Stat label={`Spend · ${snapshot.month}`} value={inr(snapshot.spendInr)} delta={<Delta value={snapshot.momSpendPct} />} />
              <Stat label="Leads" value={num(snapshot.leads)} />
              <Stat label="Cost per lead" value={inr(snapshot.cplInr, { decimals: 0 })} delta={<Delta value={snapshot.momCplPct} lowerIsBetter />} />
              <Stat label="Qualified" value={num(snapshot.qualifiedLeads)} />
              <Stat label="Cost per qualified" value={inr(snapshot.costPerQualifiedLeadInr)} />
              <Stat label="CTR" value={pct(snapshot.ctrPct, 2)} />
              {snapshot.roas != null && <Stat label="ROAS" value={`${snapshot.roas}x`} />}
            </div>
          )}

          {googleAds?.lastError && (
            <div style={{ ...panel, padding: '10px 14px', marginBottom: 14, borderLeft: '3px solid #f87171', fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.5 }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              Last Google Ads sync failed: {googleAds.lastError}
            </div>
          )}

          {/* ---------------- Data gaps ----------------

               Phrased as a setup checklist rather than a warning. The content
               is the same either way; a panel headed "N data sources missing"
               in amber reads as something broken, and the honest state for a
               client nobody has entered campaigns for yet is "not set up".

               `spend` is called out separately because it is the one gap that
               blocks most of the fleet, and because its fix is a specific place
               to go rather than a general instruction to add data. */}
          {dataGaps.length > 0 && (
            <div style={{ ...panel, padding: '14px 16px', marginBottom: 18, borderLeft: '3px solid rgba(96, 165, 250, 0.5)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8, color: 'var(--text-primary)' }}>
                Setup for {selectedClient?.name}
              </div>

              {/* Since Google Ads syncs, "type them in" is the wrong instruction
                  for a client whose account is connected — it sends someone to
                  copy numbers a button would fetch. The advice now depends on
                  whether this client has a customer ID. */}
              {dataGaps.some(g => g.section === 'spend') && (
                <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(223, 231, 224, 0.85)', marginBottom: 10 }}>
                  <strong style={{ color: '#93c5fd' }}>No campaign rows yet.</strong>{' '}
                  {googleAds?.configured ? (
                    <>Press <strong>Sync Google Ads</strong> above — it imports this account's campaigns,
                    spend and ad groups. Meta is still entered by hand under{' '}
                    <strong>Marketing Data → Ad Campaigns Performance</strong>.</>
                  ) : (
                    <>Add the <strong>Google Ads Customer ID</strong> on the client record and the Sync
                    button appears — it imports everything automatically. Failing that, enter rows by
                    hand under <strong>Marketing Data → Ad Campaigns Performance</strong>.</>
                  )}
                  {' '}Most of the fleet unblocks on the first campaign.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {dataGaps.filter(g => g.section !== 'spend').map(gap => (
                  <div key={gap.section} style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(223, 231, 224, 0.6)' }}>
                    <code style={{ color: 'rgba(147, 197, 253, 0.8)', fontSize: '0.74rem' }}>{gap.section}</code>
                    {' — '}{gap.reason}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10, fontSize: '0.73rem', color: 'rgba(223, 231, 224, 0.4)', lineHeight: 1.5 }}>
                Cards needing these stay disabled rather than running on nothing — an agent with no
                data does not fail, it writes a plausible answer from training knowledge.
              </div>
            </div>
          )}

          {/* ---------------- Fleet ----------------

               Grouped rather than listed flat. Thirty-three cards of which
               fourteen are blocked reads as a broken page; the same cards in
               three groups read as nineteen things working, two waiting on
               data, and twelve platforms this agency does not run.

               The distinction that earns the grouping is what each blocked card
               ASKS OF YOU. "Waiting on data" is a to-do. "Not connected" is not
               — it is inventory, and it belongs collapsed. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={{ ...heading, fontSize: '1.1rem', margin: 0 }}>
              Agent fleet {loading && <Loader2 size={14} className="spin" style={{ verticalAlign: -2, marginLeft: 6 }} />}
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.5)' }}>
              {groups.ready.length} ready · {groups.needsData.length} waiting on data · {groups.notConnected.length} not connected
            </span>
          </div>

          {groups.ready.length > 0 && (
            <FleetGroup>
              {groups.ready.map(agent => (
                <AgentCard key={agent.agentType} agent={agent} run={activeRuns[agent.agentType]} now={now}
                  isAdmin={isAdmin} onRun={trigger} onCancel={cancel} onOpenAudit={openAuditDetail} />
              ))}
            </FleetGroup>
          )}

          {groups.needsData.length > 0 && (
            <>
              <h4 style={{ ...heading, fontSize: '0.9rem', margin: '4px 0 10px', color: '#fbbf24' }}>
                Waiting on data ({groups.needsData.length})
              </h4>
              <FleetGroup>
                {groups.needsData.map(agent => (
                  <AgentCard key={agent.agentType} agent={agent} run={activeRuns[agent.agentType]} now={now}
                    isAdmin={isAdmin} onRun={trigger} onCancel={cancel} onOpenAudit={openAuditDetail} />
                ))}
              </FleetGroup>
            </>
          )}

          {groups.notConnected.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <button
                onClick={() => setShowNotConnected(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(223, 231, 224, 0.08)',
                  borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
                  color: 'rgba(223, 231, 224, 0.5)', fontSize: '0.8rem', fontWeight: 600, textAlign: 'left',
                }}
              >
                {showNotConnected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Not connected ({groups.notConnected.length})
                <span style={{ fontWeight: 400, color: 'rgba(223, 231, 224, 0.35)' }}>
                  — platforms this agency does not run, and skills needing a key or a deliberate switch
                </span>
              </button>
              {showNotConnected && (
                <div style={{ marginTop: 12 }}>
                  <FleetGroup>
                    {groups.notConnected.map(agent => (
                      <AgentCard key={agent.agentType} agent={agent} run={activeRuns[agent.agentType]} now={now}
                        isAdmin={isAdmin} onRun={trigger} onCancel={cancel} onOpenAudit={openAuditDetail} />
                    ))}
                  </FleetGroup>
                </div>
              )}
            </div>
          )}

          {/* ---------------- Open actions ---------------- */}
          <h3 style={{ ...heading, fontSize: '1.1rem', marginBottom: 12 }}>
            Open actions ({recommendations.length})
          </h3>
          {recommendations.length === 0 ? (
            <div style={{ ...panel, padding: '28px 20px', textAlign: 'center', color: 'rgba(223, 231, 224, 0.5)', fontSize: '0.85rem' }}>
              <CheckCircle2 size={18} style={{ verticalAlign: -3, marginRight: 6, color: '#4ade80' }} />
              Nothing open. Run an agent above, or wait for the scheduled anomaly watch.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {recommendations.map(rec => {
                const tone = PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.Low;
                return (
                  <div key={rec.id} style={{ ...panel, padding: '14px 16px', borderLeft: `4px solid ${tone.bd}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, borderRadius: 4, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                        {rec.priority.toUpperCase()}
                      </span>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{rec.metric}</strong>
                      {rec.platform && <Pill tone="muted">{rec.platform}</Pill>}
                      {rec.campaign_name && (
                        <span style={{ fontSize: '0.72rem', color: 'rgba(223, 231, 224, 0.5)' }}>{rec.campaign_name}</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(223, 231, 224, 0.35)' }}>
                        {rec.agent_type} · {rec.period_month}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.84rem', color: 'rgba(223, 231, 224, 0.85)', lineHeight: 1.5 }}>{rec.issue}</div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 6 }}>
                      <strong style={{ color: '#a3e635' }}>Do:</strong> {rec.action_required}
                    </div>
                    {rec.observation && (
                      <div style={{ fontSize: '0.75rem', color: 'rgba(223, 231, 224, 0.5)', marginTop: 6, fontStyle: 'italic' }}>
                        {rec.observation}
                      </div>
                    )}
                    {rec.expected_impact && (
                      <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: 4 }}>
                        Expected: {rec.expected_impact}
                      </div>
                    )}
                    {/* Shown, not hidden behind a toggle. The condition that
                        would make this advice wrong is the thing most likely
                        to have changed by the time anyone acts on it. */}
                    {rec.failure_check && (
                      <div style={{ fontSize: '0.73rem', color: '#fbbf24', marginTop: 6 }}>
                        Wrong if: {rec.failure_check}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <MiniButton onClick={() => toTask(rec)}>Add to board</MiniButton>
                      <MiniButton onClick={() => setRecStatus(rec, 'completed')}>Done</MiniButton>
                      <MiniButton onClick={() => setRecStatus(rec, 'ignored')} muted>Ignore</MiniButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------- Console ---------------- */}
      {isConsoleOpen && (
        <div style={{ ...panel, padding: 14, marginBottom: 20, background: 'rgba(5, 7, 10, 0.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'monospace' }}>ads-monitor console</strong>
            <button onClick={() => setConsoleLogs([])} style={{ background: 'none', border: 'none', color: 'rgba(223,231,224,0.4)', cursor: 'pointer', fontSize: '0.72rem' }}>clear</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.74rem', lineHeight: 1.6 }}>
            {consoleLogs.length === 0 ? (
              <div style={{ color: 'rgba(223, 231, 224, 0.3)' }}>Waiting for worker output…</div>
            ) : consoleLogs.map((entry, i) => (
              <div key={i} style={{ color: 'rgba(223, 231, 224, 0.75)' }}>
                <span style={{ color: 'rgba(223,231,224,0.3)' }}>{entry.at.toLocaleTimeString()} </span>
                <span style={{ color: '#60a5fa' }}>#{entry.data.runId} {entry.data.agentType} </span>
                {entry.data.log}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}

      {/* ---------------- Sync preview ---------------- */}
      {syncPlan && (
        <Modal title={`Sync preview — ${syncPlan.account.name}`} onClose={() => setSyncPlan(null)}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: 'rgba(223, 231, 224, 0.7)', marginBottom: 14 }}>
            <span>Currency <strong style={{ color: 'var(--text-primary)' }}>{syncPlan.account.currency}</strong></span>
            <span>Time zone <strong style={{ color: 'var(--text-primary)' }}>{syncPlan.account.timeZone}</strong></span>
            <span>Months <strong style={{ color: 'var(--text-primary)' }}>{syncPlan.months.join(', ')}</strong></span>
            <span>Total spend <strong style={{ color: 'var(--text-primary)' }}>{inr(syncPlan.totalSpend)}</strong></span>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 12 }}>
            <strong>{syncPlan.toInsert}</strong> to add · <strong>{syncPlan.toUpdate}</strong> to update
            {syncPlan.skippedManual > 0 && (
              <> · <strong style={{ color: '#fbbf24' }}>{syncPlan.skippedManual}</strong> left alone</>
            )}
            {' · '}{syncPlan.adGroupsSeen} ad groups
          </div>

          {syncPlan.skippedManual > 0 && (
            <div style={{ fontSize: '0.78rem', color: '#fbbf24', marginBottom: 12, lineHeight: 1.5 }}>
              Some months already hold rows entered by hand. Those are never overwritten — delete the
              manual row if you want the platform's figure instead.
            </div>
          )}

          <div style={{ maxHeight: '40vh', overflowY: 'auto', fontSize: '0.78rem' }}>
            {[...syncPlan.plan.insert.map(c => ({ ...c, kind: 'add' })),
              ...syncPlan.plan.update.map(c => ({ ...c, kind: 'update' })),
              ...syncPlan.plan.skippedManual.map(c => ({ ...c, kind: 'skip' }))].map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(223,231,224,0.06)', color: 'rgba(223, 231, 224, 0.8)' }}>
                <span style={{ width: 54, color: c.kind === 'skip' ? '#fbbf24' : c.kind === 'add' ? '#4ade80' : '#93c5fd', fontWeight: 700 }}>
                  {c.kind === 'skip' ? 'keep' : c.kind}
                </span>
                <span style={{ width: 62, color: 'rgba(223,231,224,0.5)' }}>{c.month}</span>
                <span style={{ width: 62 }}>{c.platform}</span>
                <span style={{ width: 78, textAlign: 'right' }}>{inr(Math.round(c.spend))}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <MiniButton onClick={() => runSync(false)}>
              {syncing ? 'Writing…' : 'Write these rows'}
            </MiniButton>
            <MiniButton muted onClick={() => setSyncPlan(null)}>Cancel</MiniButton>
          </div>
        </Modal>
      )}

      {/* ---------------- Fact pack drawer ---------------- */}
      {facts && (
        <Modal title={`Fact pack — ${facts.client.name} · ${facts.focus_month}`} onClose={() => setFacts(null)}>
          <p style={{ fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.6)', marginTop: 0 }}>
            Hash <code style={{ color: '#4ade80' }}>{facts.facts_hash}</code>. This is exactly what the agents
            are given — every figure in every ads report traces back to it, and nothing else is used.
          </p>
          <pre style={{ fontSize: '0.7rem', lineHeight: 1.5, color: 'rgba(223, 231, 224, 0.8)', background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: '58vh' }}>
            {JSON.stringify(facts.sections, null, 2)}
          </pre>
        </Modal>
      )}

      {/* ---------------- Audit report ---------------- */}
      {openAudit && (
        <Modal title={`${openAudit.agent_type} · ${openAudit.period_month || ''}`} onClose={() => setOpenAudit(null)}>
          {openAudit.summary && (
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>{openAudit.summary}</p>
          )}
          {openAudit.recommendations?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {openAudit.recommendations.map(rec => (
                <div key={rec.id} style={{ borderLeft: `3px solid ${(PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.Low).bd}`, padding: '6px 0 6px 10px', marginBottom: 10 }}>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{rec.priority} · {rec.metric}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(223, 231, 224, 0.75)', marginTop: 3 }}>{rec.issue}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(223, 231, 224, 0.9)', marginTop: 3 }}>{rec.action_required}</div>
                </div>
              ))}
            </div>
          )}
          {openAudit.report_json && (
            <pre style={{ fontSize: '0.7rem', color: 'rgba(223, 231, 224, 0.7)', background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: '40vh', marginTop: 14 }}>
              {typeof openAudit.report_json === 'string' ? openAudit.report_json : JSON.stringify(openAudit.report_json, null, 2)}
            </pre>
          )}
        </Modal>
      )}

      {/* ---------------- Re-run confirmation ---------------- */}
      {confirmRerun && (
        <Modal title="Run it again?" onClose={() => setConfirmRerun(null)}>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>{confirmRerun.message}</p>
          {confirmRerun.sameData && (
            <p style={{ fontSize: '0.8rem', color: '#fbbf24' }}>
              The underlying numbers are byte-for-byte identical to the last run, so this will almost
              certainly reach the same conclusions and cost the same tokens.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <MiniButton onClick={() => { const a = confirmRerun.agentType; setConfirmRerun(null); trigger(a, true); }}>
              Run anyway
            </MiniButton>
            <MiniButton muted onClick={() => setConfirmRerun(null)}>Cancel</MiniButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Grid wrapper, so all three groups lay out identically. */
function FleetGroup({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12, marginBottom: 20 }}>
      {children}
    </div>
  );
}

/** One fleet card. Lifted out of the map unchanged when the fleet was grouped,
 *  so grouping could not quietly alter how a card looks. */
function AgentCard({ agent, run, now, isAdmin, onRun, onCancel, onOpenAudit }) {
  const blocked = !!agent.blockedReason;
  return (
                <div key={agent.agentType} className="card"
                  style={{
                    ...panel,
                    borderTop: `4px solid ${blocked ? 'rgba(223, 231, 224, 0.15)' : freshnessColor(agent.freshness)}`,
                    padding: 14, opacity: blocked ? 0.62 : 1,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', wordBreak: 'break-word', minWidth: 0, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {agent.label}
                      </span>
                      <span className="badge" style={{
                        background: `${freshnessColor(agent.freshness)}1a`,
                        border: `1px solid ${freshnessColor(agent.freshness)}66`,
                        color: freshnessColor(agent.freshness),
                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                        padding: '2px 8px', borderRadius: 9999, flexShrink: 0,
                        whiteSpace: 'nowrap', textTransform: 'uppercase',
                      }}>
                        {agent.freshness.replace('_', ' ')}
                      </span>
                    </div>

                    <div style={{ margin: '10px 0', fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.65)', lineHeight: 1.5 }}>
                      <div>Cadence: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.staleAfterDays >= 9999 ? 'on demand' : `${agent.staleAfterDays} days`}</span></div>
                      <div>Last run: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.lastRunAt ? new Date(`${agent.lastRunAt.replace(' ', 'T')}Z`).toLocaleDateString() : 'Never'}</span></div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(223, 231, 224, 0.35)' }}>
                        {agent.skillName}{agent.platform ? ` · ${agent.platform}` : ''}
                      </div>
                    </div>

                    <p style={{ margin: '0 0 8px', fontSize: '0.74rem', lineHeight: 1.45, color: 'rgba(223, 231, 224, 0.55)' }}>
                      {agent.description}
                    </p>

                    {blocked && (
                      // Two colours for two different asks. Amber means "add some
                      // data and this starts working"; grey means "someone has to
                      // configure something on purpose". Painting both amber sends
                      // people off to fix the wrong thing.
                      <div style={{
                        marginTop: 6, fontSize: '0.72rem', lineHeight: 1.4,
                        padding: '3px 6px', borderRadius: 4,
                        color: agent.blockedPermanently ? 'rgba(223, 231, 224, 0.5)' : '#fbbf24',
                        background: agent.blockedPermanently ? 'rgba(148, 163, 184, 0.08)' : 'rgba(234, 179, 8, 0.1)',
                        border: `1px solid ${agent.blockedPermanently ? 'rgba(148, 163, 184, 0.2)' : 'rgba(234, 179, 8, 0.25)'}`,
                      }}>
                        ⚠ {agent.blockedReason}
                      </div>
                    )}

                    {agent.openRecommendations > 0 && (
                      <button onClick={() => onOpenAudit(agent.lastAuditId)}
                        style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: '0.72rem', color: '#fdba74', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ListChecks size={12} />{agent.openRecommendations} open action{agent.openRecommendations === 1 ? '' : 's'}
                        <ChevronRight size={11} />
                      </button>
                    )}
                  </div>

                  {/* Score and action, on one footer row — the same shape as the
                      SEO fleet's cards, so a glance across both tabs reads the
                      same way rather than needing two mental models. */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(223, 231, 224, 0.08)' }}>
                    <div
                      title={agent.score != null
                        ? `Scored ${agent.score} out of 100 by ${agent.skillName}${agent.periodMonth ? ` for ${agent.periodMonth}` : ''}`
                        : 'No score yet — run this card, or the last run could not support one'}
                      style={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1, color: scoreColor(agent.score) }}
                    >
                      {agent.score != null ? `${agent.score}%` : '--'}
                    </div>

                    {run ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.72rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Loader2 size={12} className="spin" />{elapsed(run.startedAt, now)}
                        </span>
                        <button onClick={() => onCancel(run.id)} title="Free the queue slot"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }}>
                          <XCircle size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onRun(agent.agentType)}
                        disabled={blocked || !isAdmin}
                        className="btn"
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                          cursor: blocked || !isAdmin ? 'not-allowed' : 'pointer',
                          background: blocked || !isAdmin ? 'rgba(255,255,255,0.04)' : 'rgba(224, 35, 28, 0.16)',
                          color: blocked || !isAdmin ? 'rgba(223, 231, 224, 0.35)' : '#fca5a5',
                          border: `1px solid ${blocked || !isAdmin ? 'rgba(223,231,224,0.1)' : 'rgba(224, 35, 28, 0.4)'}`,
                        }}
                        title={blocked ? agent.blockedReason : isAdmin ? `Run ${agent.skillName}` : 'Runs cost tokens, so they are limited to admins'}
                      >
                        <Play size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Run
                      </button>
                    )}
                  </div>
                </div>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div style={{ ...panel, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.68rem', color: 'rgba(223, 231, 224, 0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}>{value}</div>
      {delta && <div style={{ marginTop: 2 }}>{delta}</div>}
    </div>
  );
}

function Pill({ children, tone }) {
  const tones = {
    critical: { bg: 'rgba(239, 68, 68, 0.18)', fg: '#fca5a5', bd: 'rgba(239, 68, 68, 0.4)' },
    warn: { bg: 'rgba(234, 179, 8, 0.15)', fg: '#fde047', bd: 'rgba(234, 179, 8, 0.35)' },
    muted: { bg: 'rgba(148, 163, 184, 0.12)', fg: '#cbd5e1', bd: 'rgba(148, 163, 184, 0.25)' },
  };
  const t = tones[tone] || { bg: 'rgba(96, 165, 250, 0.14)', fg: '#93c5fd', bd: 'rgba(96, 165, 250, 0.3)' };
  return (
    <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, borderRadius: 4, padding: '1px 6px', fontSize: '0.66rem', fontWeight: 700 }}>
      {children}
    </span>
  );
}

function MiniButton({ children, onClick, muted }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
      background: muted ? 'rgba(255,255,255,0.04)' : 'rgba(224, 35, 28, 0.15)',
      color: muted ? 'rgba(223, 231, 224, 0.6)' : '#fca5a5',
      border: `1px solid ${muted ? 'rgba(223,231,224,0.12)' : 'rgba(224, 35, 28, 0.35)'}`,
    }}>{children}</button>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...panel, background: 'rgba(12, 16, 24, 0.98)', padding: 20, maxWidth: 860, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ ...heading, margin: 0, fontSize: '1.05rem' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(223,231,224,0.5)' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
