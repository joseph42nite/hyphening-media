import React, { useState, useEffect, useRef } from 'react';
import { Play, Terminal, CheckCircle2, AlertTriangle, HelpCircle, Loader2, ArrowRight, ChevronUp, ChevronDown, ListOrdered, XCircle } from 'lucide-react';
import { API_BASE } from '../../api.js';

const IN_FLIGHT_STATUSES = ['queued', 'running'];

// "4m 12s" — runs are minutes-long, so a live elapsed counter is the clearest
// signal that a card is genuinely working rather than stuck.
function formatElapsed(sinceIso, now) {
  if (!sinceIso) return '';
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC with no zone
  // marker; without normalising, the browser reads it as local time and the
  // counter starts hours off.
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(sinceIso) ? sinceIso : `${sinceIso.replace(' ', 'T')}Z`;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return '';
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Display copy only. The trigger route enforces this list server-side as of
// 2026-08-03 — this map exists so a blocked skill reads as blocked before the
// click, not so the block itself depends on the browser.
//
// Verified against OpenClaw's installed skill directory 2026-08-03. The three
// with no SKILL.md are not merely useless: OpenClaw confirmed that a run with
// no matching skill answers from training knowledge and POSTs a
// create_seo_audit anyway, producing a fabricated audit row.
//
// 'full' was listed here as having no skill. It does — OpenClaw calls it
// seo-audit, which is exactly what our trigger message already asks for, and
// it is unblocked as of 2026-08-03.
//
// Mirrors UNAVAILABLE_SKILLS in src/routes/seo.js; keep the two in sync.
const UNAVAILABLE_SKILLS = new Map([
  // No skill directory exists on OpenClaw — these fabricate results.
  ['competitor_pages', 'No skill exists on OpenClaw'],
  ['dataforseo', 'No skill exists on OpenClaw — DataForSEO MCP not installed'],
  ['maps', 'No skill exists on OpenClaw — requires DataForSEO, which is not installed'],
  // Present but missing the credentials or tools it depends on.
  // 'google' was here until its Google API credentials went live (2026-07-28).
  ['image_gen', 'Requires the nanobanana MCP image tool, which is not installed'],
  // Works, but by design is not triggered by hand.
  ['drift', 'Automatic weekly check — not manually triggered'],
]);

// seo_audits carries ten score columns and each skill fills a different one.
// Reading a hardcoded few means a real score renders as "--": a 'content'
// audit writes content_score, which the old health/technical/local chain
// never looked at. Prefer the column matching the audit type, then the
// generic health_score, then whatever is actually populated.
const SCORE_COLUMN_BY_TYPE = {
  technical: 'technical_score',
  content: 'content_score',
  content_brief: 'content_score',
  schema: 'schema_score',
  geo: 'geo_score',
  local: 'local_score',
  backlinks: 'backlinks_score',
  sxo: 'sxo_score',
  full: 'health_score',
};

const ALL_SCORE_COLUMNS = [
  'health_score', 'technical_score', 'content_score', 'on_page_score',
  'schema_score', 'performance_score', 'geo_score', 'backlinks_score',
  'local_score', 'sxo_score',
];

function getAuditScore(audit) {
  if (!audit) return null;
  const preferred = SCORE_COLUMN_BY_TYPE[audit.audit_type];
  if (preferred && audit[preferred] != null) return audit[preferred];
  if (audit.health_score != null) return audit.health_score;
  for (const col of ALL_SCORE_COLUMNS) {
    if (audit[col] != null) return audit[col];
  }
  return null;
}

// report_json is stored as a JSON-stringified column; it may itself be plain
// text (not an object) if OpenClaw sent a long-form text report instead of
// structured JSON — both are valid, so this never throws.
function parseReportJson(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Short preview shown in the quote box. Always derived from report_json
// (the exact same content "View Full Report" shows, just truncated) so the
// preview and the full report can never say different things. summary is
// only used as a last resort for old audits that predate report_json.
function getPreviewText(audit) {
  const parsed = parseReportJson(audit.report_json);
  if (parsed != null) {
    const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    const trimmed = text.trim();
    if (trimmed) {
      return trimmed.length > 280 ? `${trimmed.slice(0, 280).trim()}…` : trimmed;
    }
  }
  return audit.summary || null;
}

// Renders an arbitrary report_json object as readable nested key/value
// text instead of a raw JSON dump — OpenClaw's report shape varies by skill.
function ReportValue({ value, depth = 0 }) {
  if (value === null || value === undefined) {
    return <span style={{ color: '#94a3b8' }}>—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: '#94a3b8' }}>none</span>;
    return (
      <ul style={{ margin: '4px 0', paddingLeft: '20px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {value.map((item, i) => (
          <li key={i} style={{ marginBottom: '4px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {typeof item === 'object' && item !== null ? <ReportValue value={item} depth={depth + 1} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <div style={{ marginLeft: depth > 0 ? '14px' : 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ marginBottom: '6px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            <strong style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</strong>{' '}
            {typeof v === 'object' && v !== null ? <ReportValue value={v} depth={depth + 1} /> : String(v)}
          </div>
        ))}
      </div>
    );
  }
  return <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{String(value)}</span>;
}

export default function SeoMonitorTab({ auth, clients, showToast }) {
  const [selectedClientId, setSelectedClientId] = useState(() => localStorage.getItem('seo_monitor_selected_client_id') || '');
  const [agents, setAgents] = useState([]);
  const [audits, setAudits] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');
  
  // Default to first active client if stored is missing or invalid
  useEffect(() => {
    const activeClients = clients.filter(c => c.client_type !== 'artist_curation');
    if (activeClients.length > 0) {
      const stored = localStorage.getItem('seo_monitor_selected_client_id');
      const isValidStored = activeClients.some(c => String(c.id) === String(stored));
      if (isValidStored) {
        setSelectedClientId(String(stored));
      } else {
        const firstId = String(activeClients[0].id);
        setSelectedClientId(firstId);
        localStorage.setItem('seo_monitor_selected_client_id', firstId);
      }
    }
  }, [clients]);
  
  // Which card's audits the "View Audit" dropdown is filtered to (null = show all)
  const [focusedAgentType, setFocusedAgentType] = useState(null);

  // Real-time terminal log stream state
  const [activeConsoleAgent, setActiveConsoleAgent] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const terminalEndRef = useRef(null);

  // In-flight runs for the selected client, keyed by agent type. Seeded from
  // the server on every load (agents[].activeRun) rather than from local
  // clicks, so a refresh mid-run still shows "Running" instead of handing
  // back a Run button that would queue — and bill — the same job twice.
  const [activeRuns, setActiveRuns] = useState({});
  const [pendingApprovals, setPendingApprovals] = useState({}); // agentType -> true, for non-admin staged runs

  // Global queue across all clients
  // abortSupported flips once OpenClaw exposes a real abort route — the cancel
  // wording depends on it, since without one cancelling saves nothing.
  const [queue, setQueue] = useState({ active: [], recent: [], abortSupported: false });
  const [showQueue, setShowQueue] = useState(false);
  const [cancellingRunIds, setCancellingRunIds] = useState([]);

  // Terminal is one drawer with a tab per run ('all' = merged stream)
  const [terminalTab, setTerminalTab] = useState('all');
  const [runMeta, setRunMeta] = useState({}); // runId -> { agentType, clientId, status, startedAt }

  // Ticks only while something is in flight, to drive the elapsed counters.
  const [now, setNow] = useState(() => Date.now());
  const hasInFlight = Object.keys(activeRuns).length > 0 || queue.active.length > 0;
  useEffect(() => {
    if (!hasInFlight) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasInFlight]);

  // Terminal drag-to-resize and collapse/expand controls
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [isDraggingTerminal, setIsDraggingTerminal] = useState(false);

  const startResizeTerminal = (e) => {
    setIsDraggingTerminal(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingTerminal) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 100 && newHeight <= window.innerHeight - 80) {
        setTerminalHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingTerminal(false);
    };

    if (isDraggingTerminal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTerminal]);

  // Freshness confirmation modal
  const [showFreshModal, setShowFreshModal] = useState(false);
  const [freshModalAgent, setFreshModalAgent] = useState(null);

  // Full report modal (report_json behind "View Full Report")
  const [showReportModal, setShowReportModal] = useState(false);

  // Assign to SMM modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningRec, setAssigningRec] = useState(null);
  const [freelancers, setFreelancers] = useState([]);
  const [assignForm, setAssignForm] = useState({
    assigned_to: '',
    priority: 'medium',
    due_date: ''
  });

  const selectedClient = clients.find(c => String(c.id) === String(selectedClientId));
  const currentAudit = audits.find(a => String(a.id) === String(selectedAuditId));
  const dropdownAudits = focusedAgentType ? audits.filter(a => a.audit_type === focusedAgentType) : audits;

  // Clicking a card focuses the "View Audit" dropdown to that agent's history
  // and jumps to its most recent result (audits are already newest-first).
  const focusCardAudits = (agentType) => {
    setFocusedAgentType(agentType);
    const latest = audits.find(a => a.audit_type === agentType);
    setSelectedAuditId(latest ? latest.id : '');
    if (!latest) setRecommendations([]);
  };

  // Helper to get status color for terminal logs
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'accepted':
        return 'text-green-400';
      case 'running':
      case 'queued':
      case 'in_progress':
        return 'text-blue-400';
      case 'error':
      case 'failed':
      case 'rejected':
      case 'timed_out':
        return 'text-red-400';
      case 'cancelled':
        return 'text-orange-400';
      case 'pending':
      case 'pending_approval':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  // Fetch freelancers for the assignment modal
  useEffect(() => {
    fetch(`${API_BASE}/api/freelancers`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setFreelancers(data))
      .catch(err => console.error('[SEO TAB] Fetch freelancers failed:', err));
  }, []);

  // Fetch agent status & recommendations on client change
  const fetchClientData = async (clientId) => {
    if (!clientId) return;
    try {
      // 1. Fetch agent freshness states
      const agentRes = await fetch(`${API_BASE}/api/clients/${clientId}/seo/agents/status`, { credentials: 'include' });
      const agentData = await agentRes.json();
      if (agentRes.ok) {
        const list = agentData.agents || [];
        setAgents(list);

        // The server is the authority on what is in flight — this is what
        // survives a refresh, a re-login, or a different browser.
        const running = {};
        for (const agent of list) {
          if (agent.activeRun) running[agent.agentType] = agent.activeRun;
        }
        setActiveRuns(running);
        setRunMeta(prev => {
          const next = { ...prev };
          for (const agent of list) {
            if (agent.activeRun) {
              next[agent.activeRun.id] = {
                id: agent.activeRun.id,
                clientId: Number(clientId),
                agentType: agent.agentType,
                status: agent.activeRun.status,
                startedAt: agent.activeRun.startedAt || agent.activeRun.createdAt
              };
            }
          }
          return next;
        });
      }

      // 2. Fetch past audits
      const auditRes = await fetch(`${API_BASE}/api/clients/${clientId}/seo/audits`, { credentials: 'include' });
      const auditData = await auditRes.json();
      if (auditRes.ok) {
        setAudits(auditData.audits || []);
        if (auditData.audits?.length > 0) {
          setSelectedAuditId(auditData.audits[0].id);
        } else {
          setSelectedAuditId('');
          setRecommendations([]);
        }
      }
    } catch (err) {
      showToast('Failed to load SEO client metrics', 'error');
    }
  };

  // The queue is global (all clients), so it is fetched independently of the
  // selected client — the whole point is to see work you'd otherwise forget
  // about because you're looking at a different client's tab.
  const fetchQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/seo/queue`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setQueue({ active: data.active || [], recent: data.recent || [], abortSupported: !!data.abortSupported });
    } catch (err) {
      console.error('[SEO TAB] Queue fetch failed:', err);
    }
  };

  useEffect(() => {
    if (selectedClientId) {
      fetchClientData(selectedClientId);
    }
  }, [selectedClientId]);

  useEffect(() => {
    fetchQueue();
    // Safety net for a missed SSE frame — the queue must never quietly show a
    // finished job as still running, or you'd wait forever instead of re-running.
    const t = setInterval(fetchQueue, 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch recommendations when selected audit changes
  useEffect(() => {
    if (selectedClientId && selectedAuditId) {
      fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/audits/${selectedAuditId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setRecommendations(data.recommendations || []);
        })
        .catch(err => console.error('[SEO TAB] Recommendations fetch failed:', err));
    }
  }, [selectedAuditId, selectedClientId]);

  // Fetch initial activity log history on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/openclaw/activity?limit=30`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.logs && Array.isArray(data.logs)) {
          const historicalLogs = data.logs.reverse().map(l => ({
            type: 'agent_activity_log',
            data: { action: l.action, status: l.status, summary: l.summary, client: l.client, details: l.details },
            timestamp: new Date(l.created_at)
          }));
          setConsoleLogs(prev => [...historicalLogs, ...prev]);
        }
      })
      .catch(err => console.error('[SEO TAB] Activity log prefetch error:', err));
  }, []);

  // Set up SSE EventSource for real-time console log streaming
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });

    eventSource.addEventListener('seo_agent_log', (e) => {
      const data = JSON.parse(e.data);
      if (!selectedClientId || String(data.clientId) === String(selectedClientId)) {
        setConsoleLogs(prev => [...prev, { type: 'seo_agent_log', data, runId: data.runId, timestamp: new Date() }]);
      }
    });

    eventSource.addEventListener('openclaw_webhook', (e) => {
      const data = JSON.parse(e.data);
      setConsoleLogs(prev => [...prev, { type: 'openclaw_webhook', data, timestamp: new Date() }]);
    });

    eventSource.addEventListener('seo_agent_status', (e) => {
      const data = JSON.parse(e.data);
      const inFlight = IN_FLIGHT_STATUSES.includes(data.status);

      // Run metadata is tracked for every client, not just the selected one,
      // so the queue panel and terminal tabs stay honest when you switch tabs.
      if (data.runId) {
        setRunMeta(prev => ({
          ...prev,
          [data.runId]: {
            ...prev[data.runId],
            id: data.runId,
            clientId: data.clientId,
            agentType: data.agentType,
            status: data.status,
            startedAt: prev[data.runId]?.startedAt || new Date().toISOString()
          }
        }));
      }
      fetchQueue();

      if (String(data.clientId) === String(selectedClientId)) {
        setActiveRuns(prev => {
          const next = { ...prev };
          if (inFlight) {
            next[data.agentType] = {
              id: data.runId,
              status: data.status,
              startedAt: next[data.agentType]?.startedAt || new Date().toISOString()
            };
          } else {
            delete next[data.agentType];
          }
          return next;
        });

        if (!inFlight) {
          setPendingApprovals(prev => {
            const next = { ...prev };
            delete next[data.agentType];
            return next;
          });
        }

          setConsoleLogs(prev => [...prev, { type: 'seo_agent_status', data, runId: data.runId, timestamp: new Date() }]);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'timed_out') {
          showToast(`Agent '${data.agentType}' audit ${data.status.replace('_', ' ')}!`, data.status === 'completed' ? 'success' : 'error');
          // Refresh dashboard scores
          fetchClientData(selectedClientId);
        }
      }
    });

    eventSource.addEventListener('pending_action_created', (e) => {
      const data = JSON.parse(e.data);
      showToast(`New trigger approval request queued for ${data.agentType}!`, 'info');
      fetchClientData(selectedClientId);
    });

    eventSource.addEventListener('agent_activity_log', (e) => {
      const data = JSON.parse(e.data);
      setConsoleLogs(prev => [...prev, { type: 'agent_activity_log', data, timestamp: new Date() }]);
    });

    eventSource.addEventListener('seo_audit_created', (e) => {
      const data = JSON.parse(e.data);
      if (String(data.clientId) === String(selectedClientId)) {
        showToast('New SEO audit received, refreshing list...', 'info');
        fetchClientData(selectedClientId);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [selectedClientId]);

  // Auto-scroll terminal drawer to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Trigger agent execution
  const triggerAgent = async (agentType, force = false, autoOpenConsole = true) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/trigger/${agentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
        credentials: 'include'
      });
      const data = await res.json();

      // 409: the server refused to queue a duplicate. Nothing was spent —
      // re-sync so the card stops offering a Run button it shouldn't.
      if (res.status === 409 && data.error === 'already_running') {
        showToast(data.message, 'info');
        setActiveRuns(prev => ({
          ...prev,
          [agentType]: { id: data.runId, status: data.status, startedAt: data.startedAt }
        }));
        fetchQueue();
        return;
      }

      if (!res.ok) throw new Error(data.message || data.error);

      if (data.requiresConfirmation) {
        setFreshModalAgent(agentType);
        setShowFreshModal(true);
        return;
      }

      showToast(data.message, 'success');

      if (data.status === 'auto_approved') {
        setActiveRuns(prev => ({
          ...prev,
          [agentType]: { id: data.runId, status: 'queued', startedAt: new Date().toISOString() }
        }));
        if (data.runId) {
          setRunMeta(prev => ({
            ...prev,
            [data.runId]: { id: data.runId, clientId: Number(selectedClientId), agentType, status: 'queued', startedAt: new Date().toISOString() }
          }));
        }
        // Open log drawer for queued runs immediately
        if (autoOpenConsole) {
          setActiveConsoleAgent(agentType);
          if (data.runId) setTerminalTab(String(data.runId));
          setConsoleLogs(prev => [...prev, {
            type: 'system_message',
            data: { log: `[SYSTEM] Trigger approved. Placing '${agentType}' in queue (run #${data.runId})...` },
            runId: data.runId,
            timestamp: new Date()
          }]);
        }
      } else {
        setPendingApprovals(prev => ({ ...prev, [agentType]: true }));
      }
      fetchQueue();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Releases our queue slot only. OpenClaw confirmed it exposes no abort, so
  // the job keeps running and keeps spending — the UI says so rather than
  // implying a cancel saves anything.
  const cancelRun = async (runId, agentType) => {
    setCancellingRunIds(prev => [...prev, runId]);
    try {
      const res = await fetch(`${API_BASE}/api/seo/runs/${runId}/cancel`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);

      showToast(data.message || `Run #${runId} cancelled.`, data.aborted ? 'success' : 'info');
      setActiveRuns(prev => {
        const next = { ...prev };
        if (agentType) delete next[agentType];
        return next;
      });
      fetchQueue();
      if (selectedClientId) fetchClientData(selectedClientId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCancellingRunIds(prev => prev.filter(id => id !== runId));
    }
  };

  // Toggle Recommendation Status directly
  const toggleRecStatus = async (recId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/recommendations/${recId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Recommendation marked as ${newStatus === 'completed' ? 'Done' : 'Not Done'}!`, 'success');
      
      // Refresh recommendations list
      if (selectedAuditId) {
        const detailRes = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/audits/${selectedAuditId}`, { credentials: 'include' });
        const detailData = await detailRes.json();
        if (detailRes.ok) setRecommendations(detailData.recommendations || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Trigger Master Audit for all agents sequentially
  const triggerFullAuditMaster = async () => {
    // Skip 'full' itself, skills that are blocked/excluded, and anything
    // already fresh — forcing a re-run of a skill that doesn't need one
    // wastes tokens on every single click of this button.
    // Anything already queued or running is skipped too — the server would
    // reject it with a 409 anyway, and this keeps the toast count honest.
    const activeAgents = getFilteredAgents().filter(agent =>
      agent.agentType !== 'full' &&
      !UNAVAILABLE_SKILLS.has(agent.agentType) &&
      agent.freshness !== 'fresh' &&
      !activeRuns[agent.agentType]
    );

    if (activeAgents.length === 0) {
      showToast('Nothing to run — every available agent is either fresh or already in the queue.', 'info');
      return;
    }

    showToast(`Starting Master Audit: Queuing ${activeAgents.length} agents...`, 'info');

    for (const agent of activeAgents) {
      try {
        await triggerAgent(agent.agentType, false, false);
        // Short delay to avoid SQLite database locking
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error(`[MASTER AUDIT] Failed to trigger ${agent.agentType}:`, err);
      }
    }
    showToast('All agents queued successfully!', 'success');
  };

  // Convert Recommendation to Kanban Task
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/recommendations/${assigningRec.id}/convert-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Assigned to SMM & linked to Kanban board!', 'success');
      setShowAssignModal(false);
      
      // Refresh recommendations list
      if (selectedAuditId) {
        const detailRes = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/audits/${selectedAuditId}`, { credentials: 'include' });
        const detailData = await detailRes.json();
        if (detailRes.ok) setRecommendations(detailData.recommendations || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Helper to resolve card border & freshness color indicators
  const getFreshnessColor = (freshness) => {
    switch (freshness) {
      case 'fresh': return '#22c55e'; // Green
      case 'stale': return '#eab308'; // Amber
      default: return '#ef4444'; // Red (never run)
    }
  };

  // Filters applicable agents by client type
  const getFilteredAgents = () => {
    if (!selectedClient) return [];
    return agents.filter(agent => {
      const type = agent.agentType;
      if (type === 'ecommerce' && selectedClient.client_type === 'artist_curation') return false;
      if (type === 'local' && selectedClient.client_type === 'marketing' && !selectedClient.contact_phone) return false;
      return true;
    });
  };

  const calculatedPadding = activeConsoleAgent
    ? (isTerminalCollapsed ? '56px' : `${terminalHeight + 20}px`)
    : '0px';

  // One tab per run rather than one drawer per run: the drawer is a fixed
  // bottom strip, so stacking several would just fight over the same space.
  // Tab order follows first appearance in the log so it stays stable.
  const runTabIds = (() => {
    const seen = new Set();
    const ids = [];
    for (const entry of consoleLogs) {
      if (entry.runId != null && !seen.has(entry.runId)) {
        seen.add(entry.runId);
        ids.push(entry.runId);
      }
    }
    for (const run of Object.values(activeRuns)) {
      if (run?.id != null && !seen.has(run.id)) {
        seen.add(run.id);
        ids.push(run.id);
      }
    }
    return ids;
  })();

  // A tab whose logs were dismissed shouldn't leave the drawer showing nothing.
  const effectiveTerminalTab = terminalTab !== 'all' && !runTabIds.some(id => String(id) === terminalTab)
    ? 'all'
    : terminalTab;

  const visibleLogs = effectiveTerminalTab === 'all'
    ? consoleLogs
    : consoleLogs.filter(entry => String(entry.runId) === effectiveTerminalTab);

  const runTabLabel = (id) => {
    const meta = runMeta[id];
    return meta?.agentType ? `${meta.agentType} #${id}` : `run #${id}`;
  };

  const runTabColor = (id) => {
    const status = runMeta[id]?.status;
    if (IN_FLIGHT_STATUSES.includes(status)) return '#fbbf24';
    if (status === 'completed') return '#4ade80';
    if (status === 'cancelled') return '#fb923c';
    if (status === 'failed' || status === 'timed_out') return '#f87171';
    return '#64748b';
  };

  return (
    <div style={{ textAlign: 'left', paddingBottom: calculatedPadding, transition: 'padding 0.3s ease' }} className="seo-monitor-container">
      {/* Dropdown selector panel */}
      <div className="card glass-premium" style={{ marginBottom: '20px', padding: '16px', border: '2px solid #000' }}>
        <div className="seo-command-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 'bold' }}>SEO &amp; GMB Co-Pilot Command Center</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a workspace client to audit metadata, track freshness cadences, and review live output stream drawers.</p>
          </div>
          <div className="seo-command-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem', flexShrink: 0 }}>Active Client:</span>
              <select
                className="form-control"
                style={{ minWidth: '200px', fontWeight: 'bold', border: '2px solid #000', flexGrow: 1 }}
                value={selectedClientId}
                onChange={e => {
                  const newId = e.target.value;
                  setSelectedClientId(newId);
                  localStorage.setItem('seo_monitor_selected_client_id', newId);
                  setActiveConsoleAgent(null);
                  setConsoleLogs([]);
                  setFocusedAgentType(null);
                  setShowReportModal(false);
                  setTerminalTab('all');
                  // Card state belongs to the client it was fetched for —
                  // carrying it over would show the new client's agents as
                  // running when it's the previous client's job that is live.
                  setActiveRuns({});
                  setPendingApprovals({});
                }}
              >
                {clients.filter(c => c.client_type !== 'artist_curation').map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>
                ))}
              </select>
            </div>
            {selectedClientId && (
              <div className="seo-command-buttons" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                <button
                  onClick={triggerFullAuditMaster}
                  className="btn btn-primary seo-cmd-btn"
                  style={{ border: '2px solid #000', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--accent)', color: '#fff', fontWeight: 'bold', flex: '1 1 180px', minWidth: '0' }}
                >
                  🚀 Run Full Audit (Master)
                </button>
                <button
                  onClick={() => setIsTerminalOpen(prev => !prev)}
                  className={`btn ${isTerminalOpen ? 'btn-primary' : 'btn-secondary'} seo-cmd-btn`}
                  style={{ border: '2px solid #000', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', flex: '1 1 180px', minWidth: '0' }}
                >
                  <Terminal size={16} /> {isTerminalOpen ? 'Hide Console Stream' : 'Live OpenClaw Console & Webhooks'} ({consoleLogs.length})
                </button>
                <button
                  onClick={() => setShowQueue(prev => !prev)}
                  className={`btn ${showQueue ? 'btn-primary' : 'btn-secondary'} seo-cmd-btn`}
                  style={{ border: '2px solid #000', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', flex: '1 1 180px', minWidth: '0' }}
                  title="Every SEO job currently queued or running on OpenClaw, across all clients"
                >
                  <ListOrdered size={16} /> OpenClaw Queue ({queue.active.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedClientId ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f4f4f5', borderRadius: '4px', border: '2px dashed #000' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--text-muted)' }}>Choose an active workspace client from the dropdown above to load the agent fleet.</p>
        </div>
      ) : (
        <div>
          
          {/* Global OpenClaw job queue — spans every client, because the job
              you're about to re-trigger may have been started from another
              client's tab (or by another admin) and you'd never see it here. */}
          {showQueue && (
            <div className="card" style={{ border: '2px solid #000', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontWeight: 'bold' }}>OpenClaw Job Queue</h3>
                <button
                  onClick={fetchQueue}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', border: '1px solid #000' }}
                >
                  Refresh
                </button>
              </div>

              {queue.active.length === 0 ? (
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '4px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nothing queued or running. Every agent is idle.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {queue.active.map(run => (
                    <div
                      key={run.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: '2px solid #000',
                        borderLeft: `6px solid ${run.status === 'running' ? '#3b82f6' : '#eab308'}`,
                        borderRadius: '4px',
                        padding: '10px 12px',
                        background: '#fff',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <Loader2 size={14} className="animate-spin" style={{ color: run.status === 'running' ? '#3b82f6' : '#eab308' }} />
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{run.agent_type}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{run.client_name || `Client #${run.client_id}`}</span>
                        <span className="badge" style={{ background: run.status === 'running' ? '#dbeafe' : '#fef3c7', border: '1px solid #000', fontSize: '0.68rem', fontWeight: 'bold' }}>
                          {run.status} · {formatElapsed(run.started_at || run.created_at, now)}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          run #{run.id}{run.openclaw_run_id ? ` · openclaw ${run.openclaw_run_id.slice(0, 8)}` : ''}
                          {run.requested_by ? ` · ${run.requested_by}` : ''}
                        </span>
                        {/* Only shown when a skill is deliberately pinned to a
                            non-default model. By default we name no model and the
                            agent's own primary decides, so there is nothing to claim. */}
                        {run.agent_id && (
                          <span
                            style={{ fontSize: '0.68rem', fontWeight: 'bold', border: '1px solid #94a3b8', borderRadius: '3px', padding: '1px 5px', color: '#475569' }}
                            title="This skill is pinned to a specific model, requested via the chat-model-switch plugin. Check actual_model in Recent Runs for what OpenClaw reports actually ran."
                          >
                            requested: {run.agent_id}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setIsTerminalOpen(true);
                            setTerminalTab(String(run.id));
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.72rem', border: '1px solid #000', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Terminal size={12} /> Logs
                        </button>
                        <button
                          onClick={() => cancelRun(run.id, String(run.client_id) === String(selectedClientId) ? run.agent_type : null)}
                          disabled={cancellingRunIds.includes(run.id)}
                          style={{ padding: '4px 10px', fontSize: '0.72rem', border: '2px solid #000', background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title="Frees the slot so this agent can be run again. Does NOT stop the job inside OpenClaw or save tokens — it keeps running until it finishes on its own."
                        >
                          <XCircle size={12} /> {cancellingRunIds.includes(run.id) ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '10px 0 0' }}>
                {queue.abortSupported ? (
                  <>Cancel aborts the run inside OpenClaw and stops token spend. Any partial results are discarded.</>
                ) : (
                  <><strong>Cancel does not save tokens.</strong> OpenClaw exposes no abort endpoint, so a cancelled job keeps running and keeps spending until it finishes on its own. Cancel only frees the slot here so the agent can be triggered again — use it when a run looks stuck, not to stop a run you regret starting.</>
                )}
              </p>

              {queue.recent.length > 0 && (
                <details style={{ marginTop: '14px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Recent finished runs ({queue.recent.length})</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                    {queue.recent.map(run => {
                      // OpenClaw's reported model disagreeing with the one we
                      // recorded means one of: a fallback fired, the agent
                      // default changed, or OpenClaw is reporting a hardcoded
                      // value rather than the model that served the request
                      // (which was the case on 2026-07-28). Worth surfacing in
                      // every one of those cases — but it is a mismatch, not
                      // proof of a fallback, so the label says only that.
                      const modelMismatch = run.actual_model && run.model && run.actual_model !== run.model;
                      return (
                        <div key={run.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', padding: '4px 0', flexWrap: 'wrap' }}>
                          <span className={getStatusColor(run.status)} style={{ fontWeight: 'bold', minWidth: '78px' }}>{run.status}</span>
                          <span style={{ fontWeight: 'bold' }}>{run.agent_type}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{run.client_name || `Client #${run.client_id}`}</span>
                          <span style={{ color: '#94a3b8' }}>{run.finished_at || run.created_at}</span>
                          {run.agent_id && (
                            <span style={{ color: '#64748b' }} title="This skill is pinned to a specific model via the chat-model-switch phrase in the trigger message.">
                              requested: {run.agent_id}
                            </span>
                          )}
                          {modelMismatch && (
                            <span
                              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #92400e', borderRadius: '3px', padding: '1px 6px', fontWeight: 'bold', fontSize: '0.7rem' }}
                              title={`We recorded: ${run.model}\nOpenClaw reported: ${run.actual_model}\n\nThese disagree. Either a fallback fired, the agent default changed, or OpenClaw is reporting a hardcoded value instead of the model that served the request. Check OpenRouter's Activity page for the truth.`}
                            >
                              model mismatch: reported {run.actual_model}
                            </span>
                          )}
                          {run.error && <span style={{ color: '#ef4444' }}>{run.error}</span>}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Main Workspace Area */}
          <div>
            {/* 25-Agent Bento Grid */}
            <h3 style={{ marginBottom: '12px', fontWeight: 'bold' }}>Agent Fleet Matrix ({getFilteredAgents().length} active)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {getFilteredAgents().map(agent => {
                const run = activeRuns[agent.agentType];
                const isRunning = !!run;
                const isPending = !run && !!pendingApprovals[agent.agentType];
                const unavailableReason = UNAVAILABLE_SKILLS.get(agent.agentType);
                const isUnavailable = !!unavailableReason;

                return (
                  <div
                    key={agent.agentType}
                    className="card"
                    onClick={() => { if (!isUnavailable) focusCardAudits(agent.agentType); }}
                    style={{
                      border: focusedAgentType === agent.agentType ? '2px solid #7c3aed' : '2px solid #000',
                      borderTop: `6px solid ${getFreshnessColor(agent.freshness)}`,
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: activeConsoleAgent === agent.agentType ? '#faf5ff' : (focusedAgentType === agent.agentType ? '#f5f3ff' : '#fff'),
                      position: 'relative',
                      transition: 'opacity 0.2s ease, border-color 0.2s ease, background 0.2s ease',
                      opacity: isUnavailable ? 0.5 : 1,
                      cursor: isUnavailable ? 'not-allowed' : 'pointer'
                    }}
                    title={unavailableReason || 'Click to view this agent\'s audit history'}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', wordBreak: 'break-word', minWidth: 0 }}>{agent.agentType}</span>
                        <span 
                          className="badge" 
                          style={{ 
                            background: getFreshnessColor(agent.freshness), 
                            color: '#fff', 
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            flexShrink: 0,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {agent.freshness.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div style={{ margin: '8px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <div>Cadence: {agent.staleAfterDays} days</div>
                        <div>Last Run: {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : 'Never'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {agent.score !== null ? `${agent.score}%` : '--'}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveConsoleAgent(agent.agentType);
                            setIsTerminalOpen(true);

                            // Open the run this card is about, not the merged
                            // stream. Previously this only considered a live
                            // run, so the moment one finished the button fell
                            // back to 'all' and showed every agent's output.
                            // (It also used to push a bare string into
                            // consoleLogs and wipe the history — every entry is
                            // a {type,data,timestamp} object.)
                            const latest = run || [...queue.active, ...queue.recent]
                              .filter(r => r.agent_type === agent.agentType
                                && String(r.client_id) === String(selectedClientId))
                              .sort((a, b) => b.id - a.id)[0];

                            // Runner output is streamed over SSE and never
                            // stored, so a run from before this page loaded has
                            // no logs to show. Say so rather than silently
                            // swapping to the merged view.
                            const hasLogs = latest && consoleLogs.some(l => String(l.runId) === String(latest.id));
                            setTerminalTab(hasLogs ? String(latest.id) : 'all');

                            const note = !latest
                              ? `[SYSTEM] '${agent.agentType}' has no runs yet. Showing the merged stream.`
                              : hasLogs
                                ? `[SYSTEM] Subscribed to logs for '${agent.agentType}' agent (run #${latest.id}).`
                                : `[SYSTEM] Run #${latest.id} ('${agent.agentType}', ${latest.status}) has no retained logs — runner output is streamed live and not stored, so it is gone after a refresh. Showing the merged stream.`;

                            setConsoleLogs(prev => [...prev, {
                              type: 'system_message',
                              data: { log: note },
                              runId: hasLogs ? latest.id : undefined,
                              timestamp: new Date()
                            }]);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 6px', border: '1px solid #000' }}
                          title="Open logs terminal drawer"
                        >
                          <Terminal size={14} />
                        </button>

                        {isRunning ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveConsoleAgent(agent.agentType);
                                setTerminalTab(String(run.id));
                                setIsTerminalOpen(true);
                              }}
                              title={`Run #${run.id} — ${run.status}. Click to open this job's log tab.`}
                              style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', border: '2px solid #000', background: '#fbbf24', color: '#000', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <Loader2 size={12} className="animate-spin" />
                              {run.status === 'queued' ? 'Queued' : 'Running'} {formatElapsed(run.startedAt || run.createdAt, now)}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); cancelRun(run.id, agent.agentType); }}
                              disabled={cancellingRunIds.includes(run.id)}
                              title="Free the slot so this agent can be triggered again. Does NOT stop the job inside OpenClaw or save any tokens — it keeps running until it finishes on its own."
                              style={{ padding: '4px 6px', border: '2px solid #000', background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <XCircle size={13} />
                            </button>
                          </>
                        ) : isPending ? (
                          <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }} title="Waiting for admin approval">
                            Pending
                          </div>
                        ) : isUnavailable ? (
                          <div style={{ background: '#e5e7eb', color: '#6b7280', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }} title={unavailableReason}>
                            Unavailable
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerAgent(agent.agentType); }}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', border: '2px solid #000' }}
                          >
                            <Play size={12} fill="currentColor" /> Run
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations & Audit logs */}
            <div className="card" style={{ border: '2px solid #000', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 'bold' }}>Audit Recommendations &amp; Findings</h3>
                  {currentAudit && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <strong>Audited URL Tree:</strong> <a href={currentAudit.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{currentAudit.url}</a>
                      {currentAudit.page_url && currentAudit.page_url !== currentAudit.url && (
                        <span> — <strong>Page:</strong> <a href={currentAudit.page_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{currentAudit.page_url}</a></span>
                      )}
                    </div>
                  )}
                  {currentAudit && (getPreviewText(currentAudit) || currentAudit.report_json) && (
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#334155',
                      marginTop: '8px',
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderLeft: '3px solid #7c3aed',
                      borderRadius: '2px',
                      maxWidth: '100%',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      boxSizing: 'border-box'
                    }}>
                      {getPreviewText(currentAudit)}
                      {currentAudit.report_json && (
                        <div style={{ marginTop: '6px' }}>
                          <button
                            onClick={() => setShowReportModal(true)}
                            style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 'bold', fontSize: '0.78rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            View Full Report →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {currentAudit && (
                    <div 
                      style={{ 
                        border: '2px solid #000', 
                        background: '#f8fafc', 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '6px',
                        height: '32px'
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-muted)' }}>Score:</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#22c55e' }}>
                        {getAuditScore(currentAudit) ?? '--'}%
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                      View Audit{focusedAgentType ? ` (${focusedAgentType})` : ''}:
                    </span>
                    <select
                      className="form-control"
                      style={{ border: '2px solid #000', padding: '4px 8px', fontSize: '0.85rem', height: '32px' }}
                      value={selectedAuditId}
                      onChange={e => setSelectedAuditId(e.target.value)}
                      disabled={dropdownAudits.length === 0}
                    >
                      {dropdownAudits.map(a => {
                        let pagePath = '';
                        if (a.page_url) {
                          try {
                            const parsed = new URL(a.page_url);
                            pagePath = parsed.pathname === '/' ? '/' : parsed.pathname;
                          } catch {
                            pagePath = a.page_url;
                          }
                        }
                        return (
                          <option key={a.id} value={a.id}>
                            {new Date(a.created_at).toLocaleString()} - {a.audit_type}{pagePath ? ` - ${pagePath}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {focusedAgentType && (
                      <button
                        onClick={() => setFocusedAgentType(null)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', border: '1px solid #000' }}
                        title="Show audits from every agent again"
                      >
                        Show All
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Focusing an agent with no audits used to blank this whole
                  panel: dropdownAudits emptied, selectedAuditId stopped
                  resolving, and every currentAudit-guarded section rendered
                  nothing at all — reading as a broken page rather than an
                  agent that has not run. */}
              {focusedAgentType && dropdownAudits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', border: '2px solid #000', borderRadius: '4px' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>No '{focusedAgentType}' audits yet.</p>
                  <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Run this agent to generate one, or choose Show All to see audits from every agent.
                  </p>
                </div>
              ) : recommendations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '4px' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>No recommendations loaded. Run an agent audit above to populate recommendations.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recommendations.map(rec => (
                    <div 
                      key={rec.id} 
                      className="recommendation-card" 
                      style={{ 
                        border: '2px solid #000', 
                        padding: '14px', 
                        borderRadius: '4px',
                        background: rec.priority === 'Critical' ? '#fff1f2' : rec.priority === 'High' ? '#fffbeb' : '#fff'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge badge-${rec.priority === 'Critical' ? 'danger' : rec.priority === 'High' ? 'warning' : 'info'}`} style={{ border: '1px solid #000' }}>
                            {rec.priority}
                          </span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{rec.metric}</span>
                        </div>
                        <span className="badge" style={{ background: '#f1f5f9', border: '1px solid #000', textTransform: 'capitalize' }}>
                          Status: {rec.status}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'left', wordBreak: 'break-all' }}>
                        <strong>Target URL Path:</strong> <a href={rec.page_url || currentAudit?.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)', wordBreak: 'break-all' }}>{rec.page_url || currentAudit?.url}</a>
                      </div>
                      
                      <div style={{ fontSize: '0.85rem', marginBottom: '8px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        <strong>Issue:</strong> {rec.issue}
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '12px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        <strong>Required Action:</strong> {rec.action_required}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {rec.status === 'open' && (
                          <button
                            onClick={() => {
                              setAssigningRec(rec);
                              setShowAssignModal(true);
                            }}
                            className="btn btn-primary"
                            style={{
                              padding: '4px 12px',
                              fontSize: '0.75rem',
                              border: '2px solid #000',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              width: 'fit-content'
                            }}
                          >
                            Assign to SMM / Convert Task <ArrowRight size={12} />
                          </button>
                        )}
                        
                        <button
                          onClick={() => toggleRecStatus(rec.id, rec.status)}
                          className="btn"
                          style={{
                            padding: '4px 12px',
                            fontSize: '0.75rem',
                            border: '2px solid #000',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            width: 'fit-content',
                            background: rec.status === 'completed' ? '#f1f5f9' : '#22c55e',
                            color: rec.status === 'completed' ? '#000' : '#fff',
                            fontWeight: 'bold'
                          }}
                        >
                          {rec.status === 'completed' ? '↩ Mark as Not Done' : '✅ Mark as Done'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Real-time SSE Terminal Console Drawer */}
          {(activeConsoleAgent || isTerminalOpen) && (
            <div 
              className="seo-terminal-drawer"
              style={{
                borderTop: '3px solid #000',
                background: '#090d16',
                color: '#22c55e',
                padding: isTerminalCollapsed ? '6px 14px 0' : '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                height: isTerminalCollapsed ? '36px' : `${terminalHeight}px`,
                maxHeight: '45vh',
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1050,
                boxShadow: '0 -4px 10px rgba(0,0,0,0.15)',
                transition: isDraggingTerminal ? 'none' : 'height 0.2s ease, padding 0.2s ease',
                overflow: 'hidden'
              }}
            >
              {/* Resize Handle (only active when not collapsed) */}
              {!isTerminalCollapsed && (
                <div 
                  onMouseDown={startResizeTerminal}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '6px',
                    cursor: 'row-resize',
                    background: '#1e293b',
                    zIndex: 1060
                  }}
                  title="Drag to resize terminal height"
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isTerminalCollapsed ? 'none' : '1px solid #1e293b', paddingBottom: isTerminalCollapsed ? '0' : '6px', marginBottom: isTerminalCollapsed ? '0' : '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={14} style={{ color: '#22c55e' }} />
                  <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>Live OpenClaw Console & Webhook Stream</span>
                  {activeConsoleAgent && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({activeConsoleAgent})</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button 
                    onClick={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '14px', padding: 0 }}
                    title={isTerminalCollapsed ? "Expand Console" : "Collapse Console"}
                  >
                    {isTerminalCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button 
                    onClick={() => { setActiveConsoleAgent(null); setIsTerminalOpen(false); }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.25rem', fontWeight: 'bold', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Close Console Drawer"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Per-job tabs. Two runs of the same skill used to interleave
                  into one unreadable stream; each tab is now exactly one job. */}
              {!isTerminalCollapsed && runTabIds.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '4px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
                  <button
                    onClick={() => setTerminalTab('all')}
                    style={{
                      background: effectiveTerminalTab === 'all' ? '#1e293b' : 'transparent',
                      color: effectiveTerminalTab === 'all' ? '#fff' : '#64748b',
                      border: '1px solid #1e293b',
                      borderRadius: '3px',
                      padding: '3px 10px',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    All ({consoleLogs.length})
                  </button>
                  {runTabIds.map(id => {
                    const isActive = effectiveTerminalTab === String(id);
                    const count = consoleLogs.filter(entry => String(entry.runId) === String(id)).length;
                    return (
                      <span
                        key={id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isActive ? '#1e293b' : 'transparent',
                          border: '1px solid #1e293b',
                          borderRadius: '3px',
                          padding: '3px 6px 3px 10px',
                          flexShrink: 0
                        }}
                      >
                        <button
                          onClick={() => setTerminalTab(String(id))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isActive ? '#fff' : '#64748b',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title={runMeta[id]?.status ? `Status: ${runMeta[id].status}` : 'Run log'}
                        >
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: runTabColor(id), flexShrink: 0 }} />
                          {runTabLabel(id)} ({count})
                        </button>
                        <button
                          onClick={() => {
                            setConsoleLogs(prev => prev.filter(entry => String(entry.runId) !== String(id)));
                            if (isActive) setTerminalTab('all');
                          }}
                          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 0 }}
                          title="Dismiss this job's log tab"
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {!isTerminalCollapsed && (
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    fontFamily: 'monospace', 
                    fontSize: '0.75rem',
                    lineHeight: '1.4',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    textAlign: 'left',
                    marginTop: '4px'
                  }}
                >
                  {visibleLogs.map((logEntry, idx) => (
                    <div key={idx} style={{ marginBottom: '2px', wordBreak: 'break-word' }}>
                      <span style={{ color: '#64748b' }}>{new Date(logEntry.timestamp).toLocaleTimeString()}</span>{' '}
                      {logEntry.type === 'openclaw_webhook' && (
                        <span>
                          <span style={{ color: '#c084fc', fontWeight: 'bold' }}>[WEBHOOK INGESTED]</span>{' '}
                          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{logEntry.data.event_type}</span>{' '}
                          <span style={{ color: logEntry.data.success ? '#4ade80' : '#f87171' }}>
                            ({logEntry.data.success ? 'EXECUTED' : 'FAILED'})
                          </span>{' '}
                          <span style={{ color: '#e2e8f0' }}>{logEntry.data.summary}</span>
                        </span>
                      )}
                      {logEntry.type === 'seo_agent_log' && (
                        <span className={getStatusColor(logEntry.data.log.includes('[ERROR]') ? 'error' : 'running')} style={{ wordBreak: 'break-word' }}>
                          {logEntry.data.log}
                        </span>
                      )}
                                {logEntry.type === 'seo_agent_status' && (
                                  <span className={getStatusColor(logEntry.data.status)}>
                                    [AGENT {logEntry.data.agentType.toUpperCase()}{logEntry.data.runId ? ` #${logEntry.data.runId}` : ''}] Status: {logEntry.data.status}
                                  </span>
                                )}
                                {logEntry.type === 'agent_activity_log' && (
                                  <>
                                    <span className={getStatusColor(logEntry.data.status)}>[{logEntry.data.status.toUpperCase()}]</span>{' '}
                                    <span className="text-cyan-400">{logEntry.data.action}</span>{' '}
                                    <span>{logEntry.data.summary}</span>
                                    {logEntry.data.client && <span className="text-purple-400"> (Client: {logEntry.data.client})</span>}
                                    {logEntry.data.details && (() => {
                                      const parsedDetails = JSON.parse(logEntry.data.details);
                                      return (
                                        <>
                                          {parsedDetails.urls && parsedDetails.urls.length > 0 && (
                                            <div className="mt-1 ml-4 text-gray-400" style={{ wordBreak: 'break-all' }}>
                                              {parsedDetails.urls.map((url, urlIdx) => (
                                                <a key={urlIdx} href={url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline" style={{ wordBreak: 'break-all' }}>{url}</a>
                                              ))}
                                            </div>
                                          )}
                                          {Object.keys(parsedDetails).filter(key => key !== 'urls').length > 0 && (
                                            <pre className="text-xs text-gray-400 mt-1 ml-4 bg-gray-800 p-2 rounded" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto', maxWidth: '100%' }}>
                                              {JSON.stringify(parsedDetails, null, 2)}
                                            </pre>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </>
                                )}
                                {logEntry.type === 'system_message' && (
                                  <span className="text-gray-500" style={{ wordBreak: 'break-word' }}>{logEntry.data.log}</span>
                                )}
                              </div>
                            ))}
                            <div ref={terminalEndRef} />
                          </div>
                        )}
                      </div>
                    )}
        </div>
      )}

      {/* Full Report Modal */}
      {showReportModal && currentAudit?.report_json && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ border: '2px solid #000', maxWidth: '700px', width: '90%', maxHeight: '85vh', overflowY: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontWeight: 'bold' }}>Full Audit Report</h3>
              <button
                onClick={() => setShowReportModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.4rem', fontWeight: 'bold', padding: 0, lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px', wordBreak: 'break-all' }}>
              {currentAudit.audit_type} — {currentAudit.page_url || currentAudit.url}
            </div>
            <div style={{ fontSize: '0.85rem', lineHeight: '1.6', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {(() => {
                const parsed = parseReportJson(currentAudit.report_json);
                // A plain-text report renders with line breaks preserved rather
                // than collapsing onto one line via the object/array renderer.
                return typeof parsed === 'string'
                  ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{parsed}</div>
                  : <ReportValue value={parsed} />;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Freshness Confirmation Warning Dialog */}
      {showFreshModal && (
        <div className="modal-overlay" onClick={() => setShowFreshModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ border: '2px solid #000', maxWidth: '450px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--accent)' }}>
              <AlertTriangle size={20} />
              <h3 style={{ margin: 0, fontWeight: 'bold' }}>Agent Audit Still Fresh</h3>
            </div>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.4', margin: '0 0 20px' }}>
              This check was run recently and has not exceeded its stale limit period. Running it again will consume API tokens unnecessarily. Do you still want to proceed?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowFreshModal(false)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ border: '2px solid #000' }}
                onClick={() => {
                  triggerAgent(freshModalAgent, true);
                  setShowFreshModal(false);
                }}
              >
                Force Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to SMM / Kanban conversion popover */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ border: '2px solid #000', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 14px', fontWeight: 'bold' }}>Assign to SMM / Convert Task</h3>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label">Assignee</label>
                <select 
                  className="form-control" 
                  value={assignForm.assigned_to} 
                  onChange={e => setAssignForm({ ...assignForm, assigned_to: e.target.value })}
                  required
                >
                  <option value="">-- Select SMM / Team Member --</option>
                  {freelancers.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.role || 'Freelancer'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select 
                    className="form-control" 
                    value={assignForm.priority} 
                    onChange={e => setAssignForm({ ...assignForm, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={assignForm.due_date} 
                    onChange={e => setAssignForm({ ...assignForm, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ border: '2px solid #000' }}>Confirm Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
