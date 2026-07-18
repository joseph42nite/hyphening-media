import React, { useState, useEffect, useRef } from 'react';
import { Play, Terminal, CheckCircle2, AlertTriangle, HelpCircle, Loader2, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react';
import { API_BASE } from '../../api.js';

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
  
  // Real-time terminal log stream state
  const [activeConsoleAgent, setActiveConsoleAgent] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [agentRunningStates, setAgentRunningStates] = useState({}); // e.g. { technical: 'running' }
  const terminalEndRef = useRef(null);

  // Terminal drag-to-resize and collapse/expand controls
  const [terminalHeight, setTerminalHeight] = useState(240);
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
        return 'text-red-400';
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
      if (agentRes.ok) setAgents(agentData.agents || []);

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

  useEffect(() => {
    if (selectedClientId) {
      fetchClientData(selectedClientId);
    }
  }, [selectedClientId]);

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

  // Set up SSE EventSource for real-time console log streaming
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });

    eventSource.addEventListener('seo_agent_log', (e) => {
      const data = JSON.parse(e.data);
      if (String(data.clientId) === String(selectedClientId) && data.agentType === activeConsoleAgent) {
        setConsoleLogs(prev => [...prev, { type: 'seo_agent_log', data, timestamp: new Date() }]);
      }
    });

    eventSource.addEventListener('seo_agent_status', (e) => {
      const data = JSON.parse(e.data);
      if (String(data.clientId) === String(selectedClientId)) {
        setAgentRunningStates(prev => ({
          ...prev,
          [data.agentType]: data.status // 'queued' | 'running' | 'completed' | 'failed'
        }));
        
        setConsoleLogs(prev => [...prev, { type: 'seo_agent_status', data, timestamp: new Date() }]);

        if (data.status === 'completed' || data.status === 'failed') {
          showToast(`Agent '${data.agentType}' audit ${data.status}!`, data.status === 'completed' ? 'success' : 'error');
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
      // Display all activity logs, not filtered by activeConsoleAgent
      setConsoleLogs(prev => [...prev, { type: 'agent_activity_log', data, timestamp: new Date() }]);
    });

    return () => {
      eventSource.close();
    };
  }, [selectedClientId, activeConsoleAgent]);

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

      if (!res.ok) throw new Error(data.message || data.error);

      if (data.requiresConfirmation) {
        setFreshModalAgent(agentType);
        setShowFreshModal(true);
        return;
      }

      showToast(data.message, 'success');
      
      // Update local running state indicator
      setAgentRunningStates(prev => ({
        ...prev,
        [agentType]: data.status === 'auto_approved' ? 'queued' : 'pending_approval'
      }));

      // Open log drawer for queued runs immediately
      if (data.status === 'auto_approved' && autoOpenConsole) {
        setActiveConsoleAgent(agentType);
        setConsoleLogs(prev => [...prev, { type: 'system_message', data: { log: `[SYSTEM] Trigger approved. Placing '${agentType}' in queue...` }, timestamp: new Date() }]);
      }
    } catch (err) {
      showToast(err.message, 'error');
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
    const activeAgents = getFilteredAgents();
    showToast(`Starting Master Audit: Queuing ${activeAgents.length} agents...`, 'info');
    
    for (const agent of activeAgents) {
      if (agent.agentType === 'full') continue;
      
      try {
        await triggerAgent(agent.agentType, true, false);
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

  return (
    <div style={{ textAlign: 'left', paddingBottom: calculatedPadding, transition: 'padding 0.3s ease' }} className="seo-monitor-container">
      {/* Dropdown selector panel */}
      <div className="card glass-premium" style={{ marginBottom: '20px', padding: '16px', border: '2px solid #000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 'bold' }}>SEO &amp; GMB Co-Pilot Command Center</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a workspace client to audit metadata, track freshness cadences, and review live output stream drawers.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Active Client:</span>
              <select
                className="form-control"
                style={{ minWidth: '220px', fontWeight: 'bold', border: '2px solid #000' }}
                value={selectedClientId}
                onChange={e => {
                  const newId = e.target.value;
                  setSelectedClientId(newId);
                  localStorage.setItem('seo_monitor_selected_client_id', newId);
                  setActiveConsoleAgent(null);
                  setConsoleLogs([]);
                }}
              >
                {clients.filter(c => c.client_type !== 'artist_curation').map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>
                ))}
              </select>
            </div>
            {selectedClientId && (
              <button
                onClick={triggerFullAuditMaster}
                className="btn btn-primary"
                style={{ border: '2px solid #000', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent)', color: '#fff', fontWeight: 'bold' }}
              >
                🚀 Run Full Audit (Master)
              </button>
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
          
          {/* Main Workspace Area */}
          <div>
            {/* 25-Agent Bento Grid */}
            <h3 style={{ marginBottom: '12px', fontWeight: 'bold' }}>Agent Fleet Matrix ({getFilteredAgents().length} active)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {getFilteredAgents().map(agent => {
                const isRunning = agentRunningStates[agent.agentType] === 'running' || agentRunningStates[agent.agentType] === 'queued';
                const isPending = agentRunningStates[agent.agentType] === 'pending_approval';
                
                return (
                  <div 
                    key={agent.agentType}
                    className="card"
                    style={{
                      border: '2px solid #000',
                      borderTop: `6px solid ${getFreshnessColor(agent.freshness)}`,
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: activeConsoleAgent === agent.agentType ? '#faf5ff' : '#fff',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{agent.agentType}</span>
                        <span 
                          className="badge" 
                          style={{ 
                            background: getFreshnessColor(agent.freshness), 
                            color: '#fff', 
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            padding: '2px 6px'
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
                          onClick={() => {
                            setActiveConsoleAgent(agent.agentType);
                            setConsoleLogs([`[SYSTEM] Subscribed to logs for '${agent.agentType}' agent.`]);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 6px', border: '1px solid #000' }}
                          title="Open logs terminal drawer"
                        >
                          <Terminal size={14} />
                        </button>
                        
                        {isRunning ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#dbeafe', color: '#1e40af', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            <Loader2 size={12} className="animate-spin" /> {agentRunningStates[agent.agentType]}
                          </div>
                        ) : isPending ? (
                          <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }} title="Waiting for admin approval">
                            Pending
                          </div>
                        ) : (
                          <button
                            onClick={() => triggerAgent(agent.agentType)}
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
                        {currentAudit.health_score ?? currentAudit.technical_score ?? currentAudit.local_score ?? '--'}%
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>View Audit:</span>
                    <select
                      className="form-control"
                      style={{ border: '2px solid #000', padding: '4px 8px', fontSize: '0.85rem', height: '32px' }}
                      value={selectedAuditId}
                      onChange={e => setSelectedAuditId(e.target.value)}
                      disabled={audits.length === 0}
                    >
                      {audits.map(a => (
                        <option key={a.id} value={a.id}>
                          {new Date(a.created_at).toLocaleString()} - {a.audit_type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {recommendations.length === 0 ? (
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
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'left' }}>
                        <strong>Target URL Path:</strong> <a href={rec.page_url || currentAudit?.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{rec.page_url || currentAudit?.url}</a>
                      </div>
                      
                      <div style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                        <strong>Issue:</strong> {rec.issue}
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '12px' }}>
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
                    {true && ( // Always show the terminal drawer
                      <div 
                        style={{
                          borderTop: '3px solid #000',
                          background: '#090d16',
                          color: '#22c55e',
                          padding: isTerminalCollapsed ? '6px 20px 0' : '12px 20px',
                          display: 'flex',
                          flexDirection: 'column',
                          height: isTerminalCollapsed ? '36px' : `${terminalHeight}px`,
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
                            <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>Live Console Stream</span>
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
                              onClick={() => setActiveConsoleAgent(null)} // This will clear the agent-specific filter
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.25rem', fontWeight: 'bold', padding: 0, display: 'flex', alignItems: 'center' }}
                              title="Clear Agent Filter"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
          
                        {!isTerminalCollapsed && (
                          <div 
                            style={{ 
                              flex: 1, 
                              overflowY: 'auto', 
                              fontFamily: 'monospace', 
                              fontSize: '0.75rem',
                              lineHeight: '1.4',
                              whiteSpace: 'pre-wrap',
                              textAlign: 'left',
                              marginTop: '4px'
                            }}
                          >
                            {consoleLogs.map((logEntry, idx) => (
                              <div key={idx} style={{ marginBottom: '2px' }}>
                                <span style={{ color: '#64748b' }}>{new Date(logEntry.timestamp).toLocaleTimeString()}</span>{' '}
                                {logEntry.type === 'seo_agent_log' && (
                                  <span className={getStatusColor(logEntry.data.log.includes('[ERROR]') ? 'error' : 'running')}>
                                    {logEntry.data.log}
                                  </span>
                                )}
                                {logEntry.type === 'seo_agent_status' && (
                                  <span className={getStatusColor(logEntry.data.status)}>
                                    [AGENT {logEntry.data.agentType.toUpperCase()}] Status: {logEntry.data.status}
                                  </span>
                                )}
                                {logEntry.type === 'agent_activity_log' && (
                                  <>
                                    <span className={getStatusColor(logEntry.data.status)}>[{logEntry.data.status.toUpperCase()}]</span>{' '}
                                    <span className="text-cyan-400">{logEntry.data.action}</span>{' '}
                                    <span>{logEntry.data.summary}</span>
                                    {logEntry.data.client && <span className="text-purple-400"> (Client: {logEntry.data.client})</span>}
                                    {logEntry.data.details && <pre className="text-xs text-gray-400 mt-1 ml-4 bg-gray-800 p-2 rounded">{JSON.stringify(JSON.parse(logEntry.data.details), null, 2)}</pre>}
                                  </>
                                )}
                                {logEntry.type === 'system_message' && (
                                  <span className="text-gray-500">{logEntry.data.log}</span>
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
