import React, { useState, useEffect, useRef } from 'react';
import { Play, Terminal, CheckCircle2, AlertTriangle, HelpCircle, Loader2, ChevronUp, ChevronDown, XCircle, Users, Check, X } from 'lucide-react';
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
// The server decides availability and sends it as `unavailableReason` on each
// agent's status. This copy is the fallback for a stale cached response that
// predates that field — not a second source of truth.
//
// It used to be the full mirror of UNAVAILABLE_SKILLS in src/routes/seo.js,
// with "keep the two in sync" on both. They did not stay in sync: image_gen sat
// greyed out reading "nanobanana is not configured" after the server it needs
// was connected, because unblocking it meant remembering to edit three files.
// Anything whose availability can change is now decided in one place.
const UNAVAILABLE_SKILLS = new Map([
  ['image_gen', 'Requires the nanobanana MCP image tool, which is not configured'],
  // drift is decided per client by the server now — a baseline belongs to a
  // site, so one client having one says nothing about another. Kept here as the
  // conservative fallback for a cached response with no `unavailableReason`:
  // blocked is the safe direction, since running drift without a baseline
  // reports every element as changed rather than failing.
  ['drift', 'Needs a stored baseline first — capture one before comparing'],
]);

/**
 * Whether a card is blocked, by the server's verdict where it has one.
 *
 * Used by the run-all button as well as the card, so it cannot queue a skill
 * the trigger route is about to reject with a 400.
 */
function isAgentUnavailable(agent) {
  if (agent?.unavailableReason !== undefined) return !!agent.unavailableReason;
  return UNAVAILABLE_SKILLS.has(agent?.agentType);
}

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
  'local_score', 'sxo_score', 'audit_score',
];

function getAuditScore(audit) {
  if (!audit) return null;
  const preferred = SCORE_COLUMN_BY_TYPE[audit.audit_type];
  if (preferred && audit[preferred] != null) return audit[preferred];
  if (audit.health_score != null) return audit.health_score;
  // audit_score is the fallback for the ~15 audit types with no dedicated
  // column — sitemap, hreflang, cluster, and others. Without this a real
  // score, correctly extracted from the report, reads as "--" on the card.
  if (audit.audit_score != null) return audit.audit_score;
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

// Extracts the full markdown narrative from report_json or summary
function getAuditReportMarkdown(audit) {
  if (!audit) return null;
  const parsed = parseReportJson(audit.report_json);
  if (!parsed) return audit.summary || null;
  if (typeof parsed === 'string') return parsed;
  if (typeof parsed === 'object') {
    if (typeof parsed.report_markdown === 'string') return parsed.report_markdown;
    if (typeof parsed.markdown === 'string') return parsed.markdown;
    if (typeof parsed.content === 'string') return parsed.content;
    if (typeof parsed.summary === 'string') return parsed.summary;
  }
  return null;
}

// Short preview shown in card or snippets.
function getPreviewText(audit) {
  const md = getAuditReportMarkdown(audit);
  if (md) {
    const clean = md.replace(/[#*`_~[\]()|]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > 220 ? `${clean.slice(0, 220).trim()}…` : clean;
  }
  const parsed = parseReportJson(audit?.report_json);
  if (parsed && typeof parsed === 'string') {
    const trimmed = parsed.trim();
    return trimmed.length > 220 ? `${trimmed.slice(0, 220).trim()}…` : trimmed;
  }
  return audit?.summary || null;
}

// Inline formatting: **bold**, `code`, [text](url). Applied to already-escaped
// text nodes, so nothing here can inject markup.
function renderInline(text, keyPrefix = 'i') {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (tok.startsWith('**')) {
      parts.push(<strong key={key} style={{ color: '#fff', fontWeight: 700 }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      parts.push(
        <code key={key} style={{ background: 'rgba(224, 35, 28, 0.12)', color: '#fca5a5', border: '1px solid rgba(224, 35, 28, 0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.88em', wordBreak: 'break-all' }}>
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/) || [];
      parts.push(
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {label}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Renders the audit narrative as rich, high-contrast dark Kyoto markdown.
 */
function MarkdownBlock({ text }) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Horizontal rule
    if (/^\s*(---+|___+|\*\*\*+|━+)\s*$/.test(line)) {
      blocks.push(<hr key={key++} style={{ border: 0, borderTop: '1px solid rgba(223, 231, 224, 0.12)', margin: '22px 0' }} />);
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const sizes = { 1: '1.38rem', 2: '1.18rem', 3: '1.02rem', 4: '0.95rem', 5: '0.9rem', 6: '0.85rem' };
      const colors = { 1: '#dfe7e0', 2: '#e0231c', 3: '#dfe7e0', 4: 'rgba(223, 231, 224, 0.95)', 5: 'rgba(223, 231, 224, 0.9)', 6: 'rgba(223, 231, 224, 0.85)' };
      blocks.push(
        <div key={key++} style={{
          fontSize: sizes[level], fontWeight: 700, marginTop: level <= 2 ? '22px' : '16px',
          marginBottom: '10px', color: colors[level], lineHeight: 1.35,
          fontFamily: level <= 2 ? 'Space Grotesk, sans-serif' : 'inherit',
          borderBottom: level === 1 ? '1px solid rgba(223, 231, 224, 0.15)' : 'none',
          paddingBottom: level === 1 ? '8px' : 0,
        }}>
          {renderInline(heading[2], `h${key}`)}
        </div>
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid rgba(223, 231, 224, 0.12)', background: 'rgba(5, 7, 10, 0.5)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '100%' }}>
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.05)', textAlign: 'left', fontWeight: 700, color: '#dfe7e0', whiteSpace: 'nowrap' }}>
                    {renderInline(h, `th${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent' }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{ border: '1px solid rgba(223, 231, 224, 0.08)', padding: '8px 12px', verticalAlign: 'top', color: 'rgba(223, 231, 224, 0.88)', wordBreak: 'break-word' }}>
                      {renderInline(c, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Bullet or numbered list
    const isBullet = (l) => /^\s*[-*+]\s+/.test(l);
    const isNumber = (l) => /^\s*\d+\.\s+/.test(l);
    if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const items = [];
      while (i < lines.length && (isBullet(lines[i]) || isNumber(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key++} style={{ margin: '10px 0', paddingLeft: '24px', lineHeight: 1.65, color: 'rgba(223, 231, 224, 0.9)' }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: '5px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {renderInline(it, `li${key}-${ii}`)}
            </li>
          ))}
        </List>
      );
      continue;
    }

    // Paragraph
    const para = [];
    while (
      i < lines.length && lines[i].trim()
      && !/^(#{1,6})\s/.test(lines[i])
      && !lines[i].trim().startsWith('|')
      && !isBullet(lines[i]) && !isNumber(lines[i])
      && !/^\s*(---+|___+|\*\*\*+|━+)\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} style={{ margin: '10px 0', lineHeight: 1.7, color: 'rgba(223, 231, 224, 0.9)', fontSize: '0.88rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {renderInline(para.join(' '), `p${key}`)}
      </p>
    );
  }

  return <div style={{ fontSize: '0.88rem', color: 'rgba(223, 231, 224, 0.9)', lineHeight: 1.7 }}>{blocks}</div>;
}

// Renders an arbitrary report_json object with dark Kyoto styling
function ReportValue({ value, depth = 0 }) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'rgba(223, 231, 224, 0.4)' }}>—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'rgba(223, 231, 224, 0.4)' }}>none</span>;
    return (
      <ul style={{ margin: '6px 0', paddingLeft: '20px', wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'rgba(223, 231, 224, 0.88)' }}>
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
        {Object.entries(value).map(([k, v]) => {
          if (k === 'report_markdown' && typeof v === 'string') {
            return <MarkdownBlock key={k} text={v} />;
          }
          return (
            <div key={k} style={{ marginBottom: '8px', wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'rgba(223, 231, 224, 0.9)' }}>
              <strong style={{ textTransform: 'capitalize', color: '#dfe7e0' }}>{k.replace(/_/g, ' ')}:</strong>{' '}
              {typeof v === 'object' && v !== null ? <ReportValue value={v} depth={depth + 1} /> : String(v)}
            </div>
          );
        })}
      </div>
    );
  }
  return <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'rgba(223, 231, 224, 0.9)' }}>{String(value)}</span>;
}

export default function SeoMonitorTab({ auth, clients, showToast }) {
  const [selectedClientId, setSelectedClientId] = useState(() => localStorage.getItem('seo_monitor_selected_client_id') || '');
  const [agents, setAgents] = useState([]);
  const [audits, setAudits] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');

  // Competitor comparison. `own` holds this client's latest score per skill so
  // the modal can show the gap rather than a bare number — a competitor's 74
  // means nothing without knowing you are at 54.
  // Data sources this client has not been connected to yet. Shown so the gap is
  // visible before someone spends ten minutes on a run that returns an empty
  // section, rather than after.
  const [setupGaps, setSetupGaps] = useState([]);

  const [competitors, setCompetitors] = useState([]);
  // Which approved competitor the backlink_gap card compares against. Held here
  // rather than in the card so the choice survives the status poll re-render.
  const [gapCompetitor, setGapCompetitor] = useState('');
  const [ownScores, setOwnScores] = useState({});
  const [showCompetitorModal, setShowCompetitorModal] = useState(false);
  const [competitorBusy, setCompetitorBusy] = useState(null);
  const [newCompetitorUrl, setNewCompetitorUrl] = useState('');
  
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

  // View mode tab for the selected audit: 'report' (formatted markdown) | 'actions' | 'json'
  const [reportViewTab, setReportViewTab] = useState('report');

  // Assign to SMM modal
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

  const fetchCompetitors = async (clientId) => {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_BASE}/api/clients/${clientId}/seo/competitors`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setCompetitors(data.competitors || []);
      setOwnScores(data.own || {});
    } catch (err) {
      console.error('[SEO TAB] Fetch competitors failed:', err);
    }
  };

  const addCompetitor = async () => {
    const url = newCompetitorUrl.trim();
    if (!url) return;
    setCompetitorBusy('add');
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      setNewCompetitorUrl('');
      showToast(`Added ${data.competitor.domain}`, 'success');
      await fetchCompetitors(selectedClientId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCompetitorBusy(null);
    }
  };

  const setCompetitorStatus = async (competitorId, status) => {
    setCompetitorBusy(competitorId);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/competitors/${competitorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      await fetchCompetitors(selectedClientId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCompetitorBusy(null);
    }
  };

  const auditCompetitor = async (competitorId, agentType) => {
    setCompetitorBusy(competitorId);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/competitors/${competitorId}/audit/${agentType}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      showToast(data.message, 'success');
      await fetchCompetitors(selectedClientId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCompetitorBusy(null);
    }
  };

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
        setSetupGaps(agentData.setupGaps || []);

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
      fetchCompetitors(selectedClientId);
      // Competitors are per client, so a selection made for the previous one is
      // meaningless here and would be silently sent with the next gap run.
      setGapCompetitor('');
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
      // backlink_gap is the one skill that needs a second target: the tracked
      // competitor to compare referring domains against. Read from the card's
      // own selection rather than defaulting to the first approved competitor —
      // a silent default would run a comparison nobody chose and bill for it.
      const competitorDomain = agentType === 'backlink_gap' ? (gapCompetitor || '') : '';
      if (agentType === 'backlink_gap' && !competitorDomain) {
        showToast('Pick a competitor to compare against first.', 'error');
        return;
      }
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/seo/trigger/${agentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, ...(competitorDomain ? { competitor_domain: competitorDomain } : {}) }),
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
    // backlink_gap is excluded on purpose. It needs a competitor chosen per
    // run, and there is no defensible way to pick one on the client's behalf
    // inside a bulk action — running it against whoever sorts first would spend
    // DataForSEO calls on a comparison nobody asked for, and running it against
    // every approved competitor would multiply the cost of this button by the
    // length of that list. It stays a deliberate, single-target run.
    const activeAgents = getFilteredAgents().filter(agent =>
      agent.agentType !== 'full' &&
      agent.agentType !== 'backlink_gap' &&
      !isAgentUnavailable(agent) &&
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

  // Helper to resolve card border & freshness color indicators
  const getFreshnessColor = (freshness) => {
    switch (freshness) {
      case 'fresh': return '#22c55e'; // Green
      case 'stale': return '#eab308'; // Amber
      default: return '#ef4444'; // Red (never run)
    }
  };

  // Filters applicable agents by client type.
  //
  // Only for cases where the skill makes no sense at all for this client type —
  // e-commerce SEO for an artist-curation client is a structural mismatch, not
  // a missing-data gap. Contrast with 'local' below, which is data-dependent
  // and rendered instead, not filtered: a client missing a phone number can add
  // one, so hiding the card outright left no way to discover why it was gone.
  const getFilteredAgents = () => {
    if (!selectedClient) return [];
    return agents.filter(agent => {
      const type = agent.agentType;
      if (type === 'ecommerce' && selectedClient.client_type === 'artist_curation') return false;
      return true;
    });
  };

  // Reason a card is unavailable for the *currently selected client*, as
  // opposed to UNAVAILABLE_SKILLS which is the same for every client. 'local'
  // audits NAP (Name, Address, Phone) consistency, so running one without a
  // phone on file would be auditing incomplete data — but the fix is one CRM
  // field, so this is surfaced on the card rather than hidden.
  const clientUnavailableReason = (agentType) => {
    if (agentType === 'local' && selectedClient?.client_type === 'marketing' && !selectedClient?.contact_phone) {
      return 'Add a contact phone number to unlock local SEO audits.';
    }
    return null;
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
      <div className="card glass-premium" style={{ marginBottom: '20px', padding: '18px 20px', border: '1px solid rgba(223, 231, 224, 0.12)', background: 'rgba(12, 16, 24, 0.85)', backdropFilter: 'blur(20px)', borderRadius: '12px' }}>
        <div className="seo-command-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>SEO &amp; GMB Co-Pilot Command Center</h3>
            <p style={{ margin: '4px 0 0', color: 'rgba(223, 231, 224, 0.65)', fontSize: '0.85rem' }}>Select a workspace client to audit metadata, track freshness cadences, and review live output stream drawers.</p>
          </div>
          <div className="seo-command-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', flexShrink: 0, color: 'var(--text-primary)' }}>Active Client:</span>
              <select
                className="form-control"
                style={{ minWidth: '220px', fontWeight: 600, border: '1px solid rgba(223, 231, 224, 0.2)', background: 'rgba(5, 7, 10, 0.8)', color: 'var(--text-primary)', borderRadius: '6px', flexGrow: 1 }}
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
              <div className="seo-command-buttons" style={{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
                <button
                  onClick={triggerFullAuditMaster}
                  className="btn btn-primary seo-cmd-btn"
                  style={{ border: '1px solid rgba(224, 35, 28, 0.5)', padding: '9px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #e0231c 0%, #b51a14 100%)', color: '#fff', fontWeight: 700, borderRadius: '8px', boxShadow: '0 0 20px rgba(224, 35, 28, 0.35)', flex: '1 1 180px', minWidth: '0' }}
                >
                  🚀 Run Full Audit (Master)
                </button>
                <button
                  onClick={() => setIsTerminalOpen(prev => !prev)}
                  className={`btn ${isTerminalOpen ? 'btn-primary' : 'btn-secondary'} seo-cmd-btn`}
                  style={{ border: '1px solid rgba(223, 231, 224, 0.15)', padding: '9px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, background: isTerminalOpen ? 'rgba(224, 35, 28, 0.18)' : 'rgba(255, 255, 255, 0.05)', color: isTerminalOpen ? '#fca5a5' : 'var(--text-primary)', borderRadius: '8px', flex: '1 1 180px', minWidth: '0' }}
                >
                  <Terminal size={16} /> {isTerminalOpen ? 'Hide Console' : 'Live Console'} ({consoleLogs.length})
                </button>
                <button
                  onClick={() => setShowCompetitorModal(true)}
                  className="btn btn-secondary seo-cmd-btn"
                  style={{ border: '1px solid rgba(223, 231, 224, 0.15)', padding: '9px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', borderRadius: '8px', flex: '1 1 180px', minWidth: '0' }}
                  title="Compare this client's scores against tracked competitors"
                >
                  <Users size={16} /> Competitors ({competitors.filter(c => c.status === 'approved').length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedClientId ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'rgba(12, 16, 24, 0.6)', borderRadius: '12px', border: '1px dashed rgba(223, 231, 224, 0.15)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-muted)' }}>Choose an active workspace client from the dropdown above to load the agent fleet.</p>
        </div>
      ) : (
        <div>
          
          {/* Main Workspace Area */}
          <div>
            {/* Bento Grid Setup Gaps Banner */}
            {setupGaps.length > 0 && (
              <div style={{
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderLeft: `5px solid ${setupGaps.some(g => g.severity === 'blocking') ? '#ef4444' : '#eab308'}`,
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '18px',
                background: 'rgba(234, 179, 8, 0.07)',
                color: 'rgba(223, 231, 224, 0.9)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '8px', color: '#fbbf24' }}>
                  Setup incomplete for {selectedClient?.name} — {setupGaps.length} data source{setupGaps.length === 1 ? '' : 's'} not connected
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {setupGaps.map(gap => (
                    <div key={gap.field} style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
                      <span style={{
                        display: 'inline-block',
                        background: gap.severity === 'blocking' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                        color: gap.severity === 'blocking' ? '#fca5a5' : '#fde047',
                        border: `1px solid ${gap.severity === 'blocking' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        marginRight: '6px',
                      }}>
                        {gap.severity === 'blocking' ? 'BLOCKING' : 'LIMITS DATA'}
                      </span>
                      <strong style={{ color: 'var(--text-primary)' }}>{gap.label}</strong>
                      {' — '}
                      <span style={{ color: 'rgba(223, 231, 224, 0.7)' }}>{gap.detail}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'rgba(223, 231, 224, 0.55)' }}>
                  Audits still run without these, but the affected sections report the source as
                  unavailable rather than guessing at the numbers.
                </div>
              </div>
            )}

            <h3 style={{ marginBottom: '14px', fontWeight: 700, fontSize: '1.15rem', color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
              Agent Fleet Matrix ({getFilteredAgents().length} active)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
              {getFilteredAgents().map(agent => {
                const run = activeRuns[agent.agentType];
                const isRunning = !!run;
                const isPending = !run && !!pendingApprovals[agent.agentType];
                const unavailableReason = (agent.unavailableReason !== undefined
                  ? agent.unavailableReason
                  : UNAVAILABLE_SKILLS.get(agent.agentType))
                  || clientUnavailableReason(agent.agentType);
                const isUnavailable = !!unavailableReason;

                return (
                  <div
                    key={agent.agentType}
                    className="card"
                    onClick={() => { if (!isUnavailable) focusCardAudits(agent.agentType); }}
                    style={{
                      border: focusedAgentType === agent.agentType ? '1px solid #e0231c' : '1px solid rgba(223, 231, 224, 0.1)',
                      borderTop: `4px solid ${getFreshnessColor(agent.freshness)}`,
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: activeConsoleAgent === agent.agentType 
                        ? 'rgba(224, 35, 28, 0.14)' 
                        : (focusedAgentType === agent.agentType ? 'rgba(224, 35, 28, 0.08)' : 'rgba(12, 16, 24, 0.85)'),
                      backdropFilter: 'blur(16px)',
                      borderRadius: '10px',
                      boxShadow: focusedAgentType === agent.agentType 
                        ? '0 0 20px rgba(224, 35, 28, 0.25)' 
                        : '0 8px 24px rgba(0, 0, 0, 0.35)',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      opacity: isUnavailable ? 0.55 : 1,
                      cursor: isUnavailable ? 'not-allowed' : 'pointer'
                    }}
                    title={unavailableReason || 'Click to view this agent\'s audit history'}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', wordBreak: 'break-word', minWidth: 0, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
                          {agent.agentType}
                        </span>
                        <span 
                          className="badge" 
                          style={{ 
                            background: `${getFreshnessColor(agent.freshness)}1a`, 
                            border: `1px solid ${getFreshnessColor(agent.freshness)}66`,
                            color: getFreshnessColor(agent.freshness), 
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase'
                          }}
                        >
                          {agent.freshness.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div style={{ margin: '10px 0', fontSize: '0.78rem', color: 'rgba(223, 231, 224, 0.65)', lineHeight: 1.5 }}>
                        <div>Cadence: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.staleAfterDays} days</span></div>
                        <div>Last Run: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : 'Never'}</span></div>
                        {agent.dataGap && (
                          <div style={{ marginTop: '6px', color: '#fbbf24', fontWeight: 600, lineHeight: 1.35, background: 'rgba(234, 179, 8, 0.1)', padding: '3px 6px', borderRadius: '4px', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
                            ⚠ {agent.dataGap}
                          </div>
                        )}
                        {agent.agentType === 'backlink_gap' && !isUnavailable && (
                          <div onClick={e => e.stopPropagation()} style={{ marginTop: '8px' }}>
                            <select
                              value={gapCompetitor}
                              onChange={e => setGapCompetitor(e.target.value)}
                              disabled={isRunning}
                              style={{ width: '100%', padding: '4px 8px', border: '1px solid rgba(223, 231, 224, 0.18)', borderRadius: '6px', fontSize: '0.72rem', background: 'rgba(5, 7, 10, 0.85)', color: 'var(--text-primary)' }}
                              title="Which tracked competitor to compare referring domains against"
                            >
                              <option value="">compare vs…</option>
                              {competitors.filter(c => c.status === 'approved').map(c => (
                                <option key={c.id} value={c.domain}>{c.label || c.domain}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(223, 231, 224, 0.08)' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: agent.score !== null ? (agent.score >= 80 ? '#22c55e' : agent.score >= 60 ? '#38bdf8' : '#e0231c') : 'var(--text-muted)' }}>
                        {agent.score !== null ? `${agent.score}%` : '--'}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveConsoleAgent(agent.agentType);
                            setIsTerminalOpen(true);

                            const latest = run || [...queue.active, ...queue.recent]
                              .filter(r => r.agent_type === agent.agentType
                                && String(r.client_id) === String(selectedClientId))
                              .sort((a, b) => b.id - a.id)[0];

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
                          style={{ padding: '5px 8px', border: '1px solid rgba(223, 231, 224, 0.15)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', borderRadius: '6px' }}
                          title="Open logs terminal drawer"
                        >
                          <Terminal size={13} />
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
                              style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(234, 179, 8, 0.4)', background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                            >
                              <Loader2 size={12} className="animate-spin" />
                              {run.status === 'queued' ? 'Queued' : 'Running'} {formatElapsed(run.startedAt || run.createdAt, now)}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); cancelRun(run.id, agent.agentType); }}
                              disabled={cancellingRunIds.includes(run.id)}
                              title="Free slot"
                              style={{ padding: '5px 7px', border: '1px solid rgba(224, 35, 28, 0.4)', background: 'rgba(224, 35, 28, 0.15)', color: '#f87171', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <XCircle size={13} />
                            </button>
                          </>
                        ) : isPending ? (
                          <div style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '5px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                            Pending
                          </div>
                        ) : isUnavailable ? (
                          <div style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(223, 231, 224, 0.4)', border: '1px solid rgba(223, 231, 224, 0.08)', padding: '5px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600 }} title={unavailableReason}>
                            Unavailable
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerAgent(agent.agentType); }}
                            className="btn btn-primary"
                            style={{ padding: '5px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', background: 'linear-gradient(135deg, #e0231c 0%, #b51a14 100%)', border: '1px solid rgba(224, 35, 28, 0.4)', color: '#fff', borderRadius: '6px', fontWeight: 700 }}
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
            <div className="card glass-premium" style={{ border: '1px solid rgba(223, 231, 224, 0.12)', background: 'rgba(12, 16, 24, 0.85)', backdropFilter: 'blur(20px)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
                      Audit Recommendations &amp; Findings
                    </h3>
                    {currentAudit && (
                      <span className="badge" style={{ background: 'rgba(224, 35, 28, 0.15)', border: '1px solid rgba(224, 35, 28, 0.35)', color: '#fca5a5', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '3px 8px', borderRadius: '6px' }}>
                        {currentAudit.audit_type}
                      </span>
                    )}
                  </div>

                  {currentAudit && (
                    <div style={{ fontSize: '0.82rem', color: 'rgba(223, 231, 224, 0.7)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>
                        <strong style={{ color: 'var(--text-primary)' }}>Audited URL Tree:</strong>{' '}
                        <a href={currentAudit.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: '#38bdf8' }}>{currentAudit.url}</a>
                      </span>
                      {currentAudit.page_url && currentAudit.page_url !== currentAudit.url && (
                        <span>
                          — <strong style={{ color: 'var(--text-primary)' }}>Page:</strong>{' '}
                          <a href={currentAudit.page_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: '#38bdf8' }}>{currentAudit.page_url}</a>
                        </span>
                      )}
                      <span style={{ color: 'rgba(223, 231, 224, 0.4)' }}>•</span>
                      <span>{new Date(currentAudit.created_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {currentAudit && (
                    <div 
                      style={{ 
                        border: '1px solid rgba(223, 231, 224, 0.15)', 
                        background: 'rgba(5, 7, 10, 0.6)', 
                        padding: '6px 14px', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Score:</span>
                      <span style={{ 
                        fontSize: '1.15rem', 
                        fontWeight: 800, 
                        color: getAuditScore(currentAudit) >= 80 ? '#22c55e' : getAuditScore(currentAudit) >= 60 ? '#38bdf8' : '#e0231c',
                        fontFamily: 'var(--font-mono)' 
                      }}>
                        {getAuditScore(currentAudit) ?? '--'}%
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(223, 231, 224, 0.8)' }}>
                      Audit{focusedAgentType ? ` (${focusedAgentType})` : ''}:
                    </span>
                    <select
                      className="form-control"
                      style={{ 
                        border: '1px solid rgba(223, 231, 224, 0.2)', 
                        background: 'rgba(5, 7, 10, 0.8)', 
                        color: 'var(--text-primary)', 
                        padding: '5px 10px', 
                        fontSize: '0.82rem', 
                        height: '34px',
                        borderRadius: '6px'
                      }}
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
                            {new Date(a.created_at).toLocaleDateString()} {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {a.audit_type}{pagePath ? ` - ${pagePath}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {focusedAgentType && (
                      <button
                        onClick={() => setFocusedAgentType(null)}
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.75rem', border: '1px solid rgba(223, 231, 224, 0.15)', borderRadius: '6px' }}
                        title="Show audits from every agent again"
                      >
                        Show All
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* View Mode Navigation Tabs */}
              {currentAudit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(223, 231, 224, 0.12)', paddingBottom: '10px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setReportViewTab('report')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: reportViewTab === 'report' ? '1px solid rgba(224, 35, 28, 0.5)' : '1px solid transparent',
                        background: reportViewTab === 'report' ? 'rgba(224, 35, 28, 0.15)' : 'transparent',
                        color: reportViewTab === 'report' ? '#fff' : 'rgba(223, 231, 224, 0.65)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📄 Formatted Narrative Report
                    </button>
                    <button
                      onClick={() => setReportViewTab('actions')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: reportViewTab === 'actions' ? '1px solid rgba(224, 35, 28, 0.5)' : '1px solid transparent',
                        background: reportViewTab === 'actions' ? 'rgba(224, 35, 28, 0.15)' : 'transparent',
                        color: reportViewTab === 'actions' ? '#fff' : 'rgba(223, 231, 224, 0.65)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📋 Action Items ({recommendations.length})
                    </button>
                    <button
                      onClick={() => setReportViewTab('json')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: reportViewTab === 'json' ? '1px solid rgba(224, 35, 28, 0.5)' : '1px solid transparent',
                        background: reportViewTab === 'json' ? 'rgba(224, 35, 28, 0.15)' : 'transparent',
                        color: reportViewTab === 'json' ? '#fff' : 'rgba(223, 231, 224, 0.65)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🔍 Raw Payload
                    </button>
                  </div>

                  <button
                    onClick={() => setShowReportModal(true)}
                    className="btn btn-secondary"
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.78rem',
                      border: '1px solid rgba(223, 231, 224, 0.15)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>Open Modal View ↗</span>
                  </button>
                </div>
              )}

              {/* Tab Views Content */}
              {focusedAgentType && dropdownAudits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'rgba(5, 7, 10, 0.4)', border: '1px dashed rgba(223, 231, 224, 0.15)', borderRadius: '8px' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>No '{focusedAgentType}' audits yet.</p>
                  <p style={{ margin: '8px 0 0', color: 'rgba(223, 231, 224, 0.65)', fontSize: '0.85rem' }}>
                    Run this agent from the matrix above to generate an audit report, or choose Show All to view audits from every agent.
                  </p>
                </div>
              ) : !currentAudit ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'rgba(5, 7, 10, 0.4)', borderRadius: '8px', border: '1px dashed rgba(223, 231, 224, 0.12)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>No audit selected. Run an agent audit above to populate recommendations and report findings.</p>
                </div>
              ) : reportViewTab === 'report' ? (
                <div>
                  {(() => {
                    const md = getAuditReportMarkdown(currentAudit);
                    if (md) {
                      return (
                        <div style={{
                          background: 'rgba(5, 7, 10, 0.65)',
                          border: '1px solid rgba(223, 231, 224, 0.1)',
                          borderRadius: '10px',
                          padding: '24px',
                          maxHeight: '680px',
                          overflowY: 'auto',
                          boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere'
                        }}>
                          <MarkdownBlock text={md} />
                        </div>
                      );
                    }
                    const parsed = parseReportJson(currentAudit.report_json);
                    if (parsed) {
                      return (
                        <div style={{
                          background: 'rgba(5, 7, 10, 0.65)',
                          border: '1px solid rgba(223, 231, 224, 0.1)',
                          borderRadius: '10px',
                          padding: '24px',
                          maxHeight: '680px',
                          overflowY: 'auto',
                          boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere'
                        }}>
                          {typeof parsed === 'string'
                            ? <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(223, 231, 224, 0.9)', lineHeight: 1.7 }}>{parsed}</div>
                            : <ReportValue value={parsed} />}
                        </div>
                      );
                    }
                    return (
                      <div style={{ textAlign: 'center', padding: '32px', background: 'rgba(5, 7, 10, 0.4)', borderRadius: '8px' }}>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>No narrative report text recorded for this audit run.</p>
                      </div>
                    );
                  })()}
                </div>
              ) : reportViewTab === 'actions' ? (
                <div>
                  {recommendations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 20px', background: 'rgba(5, 7, 10, 0.4)', border: '1px dashed rgba(223, 231, 224, 0.15)', borderRadius: '8px' }}>
                      <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.95rem' }}>No individual action items registered in the database for this run.</p>
                      <p style={{ margin: '8px 0 0', color: 'rgba(223, 231, 224, 0.65)', fontSize: '0.85rem' }}>
                        All analysis, findings, and technical recommendations are available directly in the <strong>Formatted Narrative Report</strong> tab.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {recommendations.map(rec => (
                        <div 
                          key={rec.id} 
                          className="recommendation-card" 
                          style={{ 
                            border: rec.priority === 'Critical' 
                              ? '1px solid rgba(224, 35, 28, 0.45)' 
                              : rec.priority === 'High' 
                                ? '1px solid rgba(234, 179, 8, 0.45)' 
                                : '1px solid rgba(223, 231, 224, 0.12)', 
                            padding: '16px', 
                            borderRadius: '8px',
                            background: rec.priority === 'Critical' 
                              ? 'rgba(224, 35, 28, 0.08)' 
                              : rec.priority === 'High' 
                                ? 'rgba(234, 179, 8, 0.08)' 
                                : 'rgba(12, 16, 24, 0.8)',
                            backdropFilter: 'blur(12px)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span className={`badge badge-${rec.priority === 'Critical' ? 'danger' : rec.priority === 'High' ? 'warning' : 'info'}`}>
                                {rec.priority}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{rec.metric}</span>
                            </div>
                            <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(223, 231, 224, 0.12)', color: 'rgba(223, 231, 224, 0.85)', textTransform: 'capitalize' }}>
                              Status: {rec.status}
                            </span>
                          </div>
                          
                          <div style={{ fontSize: '0.82rem', color: 'rgba(223, 231, 224, 0.65)', marginBottom: '8px', textAlign: 'left', wordBreak: 'break-all' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Target URL Path:</strong> <a href={rec.page_url || currentAudit?.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: '#38bdf8' }}>{rec.page_url || currentAudit?.url}</a>
                          </div>
                          
                          <div style={{ fontSize: '0.88rem', marginBottom: '8px', color: 'var(--text-primary)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            <strong style={{ color: 'rgba(223, 231, 224, 0.7)' }}>Issue:</strong> {rec.issue}
                          </div>
                          <div style={{ fontSize: '0.88rem', marginBottom: '14px', color: 'rgba(223, 231, 224, 0.9)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            <strong style={{ color: 'rgba(223, 231, 224, 0.7)' }}>Required Action:</strong> {rec.action_required}
                          </div>

                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                            <button
                              onClick={() => toggleRecStatus(rec.id, rec.status)}
                              className="btn"
                              style={{
                                padding: '5px 14px',
                                fontSize: '0.78rem',
                                border: '1px solid rgba(223, 231, 224, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                width: 'fit-content',
                                borderRadius: '6px',
                                background: rec.status === 'completed' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(34, 197, 94, 0.2)',
                                color: rec.status === 'completed' ? 'rgba(223, 231, 224, 0.8)' : '#4ade80',
                                fontWeight: 700
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
              ) : (
                <div>
                  <pre style={{
                    background: 'rgba(5, 7, 10, 0.85)',
                    border: '1px solid rgba(223, 231, 224, 0.1)',
                    borderRadius: '8px',
                    padding: '18px',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#7dd3fc',
                    overflowX: 'auto',
                    maxHeight: '550px',
                    margin: 0,
                    lineHeight: 1.5
                  }}>
                    {JSON.stringify(parseReportJson(currentAudit?.report_json), null, 2)}
                  </pre>
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
                  <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>Live Console & Webhooks</span>
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
      {showCompetitorModal && (
        <div className="modal-overlay" onClick={() => setShowCompetitorModal(false)}>
          <div
            className="modal-content glass-premium"
            onClick={e => e.stopPropagation()}
            style={{ border: '1px solid rgba(223, 231, 224, 0.18)', background: 'rgba(10, 14, 20, 0.96)', backdropFilter: 'blur(24px)', maxWidth: '900px', width: '95%', maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box', padding: '24px', borderRadius: '12px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>Competitors — {selectedClient?.name}</h3>
              <button onClick={() => setShowCompetitorModal(false)} className="btn btn-secondary" style={{ border: '1px solid rgba(223, 231, 224, 0.15)', padding: '5px 12px', borderRadius: '6px' }}>Close</button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'rgba(223, 231, 224, 0.65)' }}>
              Auditing a competitor runs the same skills against their site. Search Console and GA4 are
              unavailable for domains you don't own, so the <code>google</code> skill is not offered here.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <input
                value={newCompetitorUrl}
                onChange={e => setNewCompetitorUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCompetitor(); }}
                placeholder="competitor.com"
                style={{ flex: '1 1 240px', padding: '8px 12px', border: '1px solid rgba(223, 231, 224, 0.18)', background: 'rgba(5, 7, 10, 0.8)', color: 'var(--text-primary)', borderRadius: '6px', fontSize: '0.85rem' }}
              />
              <button
                onClick={addCompetitor}
                disabled={competitorBusy === 'add' || !newCompetitorUrl.trim()}
                className="btn btn-primary"
                style={{ border: '1px solid rgba(224, 35, 28, 0.4)', background: 'linear-gradient(135deg, #e0231c 0%, #b51a14 100%)', padding: '8px 18px', fontWeight: 700, borderRadius: '6px' }}
              >
                {competitorBusy === 'add' ? 'Adding…' : 'Add Competitor'}
              </button>
            </div>

            {competitors.length === 0 ? (
              <div style={{ padding: '24px', background: 'rgba(5, 7, 10, 0.4)', borderRadius: '8px', textAlign: 'center', border: '1px dashed rgba(223, 231, 224, 0.15)' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  No competitors tracked yet. Add one above.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {competitors.map(comp => {
                  const isApproved = comp.status === 'approved';
                  const isRejected = comp.status === 'rejected';
                  const busy = competitorBusy === comp.id;
                  const comparable = Object.keys(ownScores).filter(t => t !== 'google');

                  return (
                    <div
                      key={comp.id}
                      style={{
                        border: '1px solid rgba(223, 231, 224, 0.12)',
                        borderLeft: `5px solid ${isApproved ? '#22c55e' : isRejected ? '#64748b' : '#eab308'}`,
                        borderRadius: '8px',
                        padding: '14px',
                        background: 'rgba(12, 16, 24, 0.75)',
                        opacity: isRejected ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                            {comp.label || comp.domain}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(223, 231, 224, 0.6)' }}>
                            {comp.domain}
                            {comp.discovered_for_query && (
                              <> · found at #{comp.discovered_position ?? '?'} for “{comp.discovered_for_query}”</>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className="badge" style={{
                            background: isApproved ? 'rgba(34, 197, 94, 0.2)' : isRejected ? 'rgba(100, 116, 139, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                            color: isApproved ? '#4ade80' : isRejected ? '#94a3b8' : '#fbbf24',
                            fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: '9999px',
                            border: `1px solid ${isApproved ? 'rgba(34, 197, 94, 0.4)' : isRejected ? 'rgba(100, 116, 139, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`
                          }}>
                            {comp.status}
                          </span>
                          {!isApproved && (
                            <button onClick={() => setCompetitorStatus(comp.id, 'approved')} disabled={busy}
                              className="btn" title="Approve — allows auditing"
                              style={{ padding: '4px 8px', border: '1px solid rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <Check size={13} />
                            </button>
                          )}
                          {!isRejected && (
                            <button onClick={() => setCompetitorStatus(comp.id, 'rejected')} disabled={busy}
                              className="btn" title="Reject — keeps discovery from re-proposing it"
                              style={{ padding: '4px 8px', border: '1px solid rgba(224, 35, 28, 0.4)', background: 'rgba(224, 35, 28, 0.2)', color: '#f87171', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {isApproved && (
                        <div style={{ marginTop: '14px', overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(223, 231, 224, 0.1)' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '100%', background: 'rgba(5, 7, 10, 0.4)' }}>
                            <thead>
                              <tr>
                                <th style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', color: '#dfe7e0', textAlign: 'left' }}>Skill</th>
                                <th style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', color: '#dfe7e0', textAlign: 'center' }}>Them</th>
                                <th style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', color: '#dfe7e0', textAlign: 'center' }}>You</th>
                                <th style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', color: '#dfe7e0', textAlign: 'center' }}>Gap</th>
                                <th style={{ border: '1px solid rgba(223, 231, 224, 0.1)', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {comparable.map(type => {
                                const theirs = comp.scores?.[type]?.score ?? null;
                                const mine = ownScores[type]?.score ?? null;
                                const gap = (theirs !== null && mine !== null) ? mine - theirs : null;
                                return (
                                  <tr key={type}>
                                    <td style={{ border: '1px solid rgba(223, 231, 224, 0.08)', padding: '6px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>{type}</td>
                                    <td style={{ border: '1px solid rgba(223, 231, 224, 0.08)', padding: '6px 10px', textAlign: 'center', color: 'rgba(223, 231, 224, 0.85)' }}>
                                      {theirs ?? '—'}
                                    </td>
                                    <td style={{ border: '1px solid rgba(223, 231, 224, 0.08)', padding: '6px 10px', textAlign: 'center', color: 'rgba(223, 231, 224, 0.85)' }}>
                                      {mine ?? '—'}
                                    </td>
                                    <td style={{
                                      border: '1px solid rgba(223, 231, 224, 0.08)', padding: '6px 10px', textAlign: 'center', fontWeight: 700,
                                      color: gap === null ? 'var(--text-muted)' : gap >= 0 ? '#4ade80' : '#f87171',
                                    }}>
                                      {gap === null ? '—' : gap > 0 ? `+${gap}` : gap}
                                    </td>
                                    <td style={{ border: '1px solid rgba(223, 231, 224, 0.08)', padding: '6px 10px', textAlign: 'center' }}>
                                      <button
                                        onClick={() => auditCompetitor(comp.id, type)}
                                        disabled={busy}
                                        className="btn btn-secondary"
                                        style={{ padding: '3px 10px', fontSize: '0.72rem', border: '1px solid rgba(223, 231, 224, 0.15)', borderRadius: '4px' }}
                                        title={`Run '${type}' against ${comp.domain}`}
                                      >
                                        {theirs === null ? 'Run' : 'Re-run'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showReportModal && currentAudit?.report_json && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ border: '1px solid rgba(223, 231, 224, 0.18)', background: 'rgba(10, 14, 20, 0.96)', backdropFilter: 'blur(24px)', maxWidth: '850px', width: '92%', maxHeight: '88vh', overflowY: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere', boxSizing: 'border-box', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid rgba(223, 231, 224, 0.1)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>Full Audit Report</h3>
                <div style={{ fontSize: '0.8rem', color: 'rgba(223, 231, 224, 0.65)', marginTop: '4px', wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{currentAudit.audit_type}</span> — {currentAudit.page_url || currentAudit.url}
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(223, 231, 224, 0.15)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold', padding: '4px 10px', borderRadius: '6px', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.7', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {(() => {
                const md = getAuditReportMarkdown(currentAudit);
                if (md) return <MarkdownBlock text={md} />;
                const parsed = parseReportJson(currentAudit.report_json);
                return typeof parsed === 'string'
                  ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', color: 'rgba(223, 231, 224, 0.9)', lineHeight: 1.7 }}>{parsed}</div>
                  : <ReportValue value={parsed} />;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Freshness Confirmation Warning Dialog */}
      {showFreshModal && (
        <div className="modal-overlay" onClick={() => setShowFreshModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ border: '1px solid rgba(223, 231, 224, 0.18)', background: 'rgba(10, 14, 20, 0.96)', backdropFilter: 'blur(24px)', maxWidth: '450px', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--accent)' }}>
              <AlertTriangle size={22} />
              <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Agent Audit Still Fresh</h3>
            </div>
            <p style={{ fontSize: '0.88rem', lineHeight: '1.5', margin: '0 0 20px', color: 'rgba(223, 231, 224, 0.8)' }}>
              This check was run recently and has not exceeded its stale limit period. Running it again will consume API tokens unnecessarily. Do you still want to proceed?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ border: '1px solid rgba(223, 231, 224, 0.15)', borderRadius: '6px' }}
                onClick={() => setShowFreshModal(false)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ background: 'linear-gradient(135deg, #e0231c 0%, #b51a14 100%)', border: '1px solid rgba(224, 35, 28, 0.4)', borderRadius: '6px' }}
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

    </div>
  );
}
