import React, { useState, useEffect } from 'react';
import { DollarSign, Cpu, Users, BarChart3, AlertCircle, Save } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function TokenUsageTab({ clients, showToast }) {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [summaryLogs, setSummaryLogs] = useState([]);
  const [budgetData, setBudgetData] = useState(null);
  
  // Budget Editor Form State
  const [budgetForm, setBudgetForm] = useState({
    monthly_budget_usd: 50.0,
    alert_threshold_pct: 80,
    hard_stop: 0
  });

  // Filters
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStaff, setFilterStaff] = useState('');

  // Fetch usage aggregates
  const fetchSummary = async () => {
    try {
      let url = `${API_BASE}/api/usage/summary?`;
      if (selectedClientId) url += `client_id=${selectedClientId}&`;
      if (filterAgent) url += `agent_type=${filterAgent}&`;
      if (filterStaff) url += `triggered_by=${filterStaff}&`;

      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setSummaryLogs(data.summary || []);
      }
    } catch (err) {
      console.error('[USAGE TAB] Summary fetch failed:', err);
    }
  };

  // Fetch client budget details
  const fetchBudget = async (clientId) => {
    if (!clientId) {
      setBudgetData(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/usage/budget/${clientId}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setBudgetData(data);
        setBudgetForm({
          monthly_budget_usd: data.budget.monthly_budget_usd,
          alert_threshold_pct: data.budget.alert_threshold_pct,
          hard_stop: data.budget.hard_stop
        });
      }
    } catch (err) {
      console.error('[USAGE TAB] Budget fetch failed:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
    if (selectedClientId) {
      fetchBudget(selectedClientId);
    }
  }, [selectedClientId, filterAgent, filterStaff]);

  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/usage/budget/${selectedClientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetForm),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to update client budget cap');
      
      showToast('Client token budget limits updated successfully.', 'success');
      fetchBudget(selectedClientId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cost Aggregations for visual breakdowns
  const totalLLMCost = summaryLogs.reduce((acc, row) => acc + row.estimated_cost_usd, 0);
  const totalAPICost = summaryLogs.reduce((acc, row) => acc + row.external_api_cost_usd, 0);
  const grandTotalCost = totalLLMCost + totalAPICost;

  // Group by Staff attribution
  const staffAttribution = summaryLogs.reduce((acc, row) => {
    const key = row.triggered_by;
    if (!acc[key]) acc[key] = 0;
    acc[key] += row.estimated_cost_usd + row.external_api_cost_usd;
    return acc;
  }, {});

  // Group by Model split
  const modelSplit = summaryLogs.reduce((acc, row) => {
    const key = row.model;
    if (!acc[key]) acc[key] = { cost: 0, runs: 0 };
    acc[key].cost += row.estimated_cost_usd;
    acc[key].runs += row.run_count;
    return acc;
  }, {});

  // Progress bar calculation
  const budgetLimit = budgetData?.budget?.monthly_budget_usd || 50.0;
  const spentCost = budgetData?.spent?.total_cost_usd || 0;
  const progressPct = Math.min((spentCost / budgetLimit) * 100, 100);
  const alertThreshold = budgetData?.budget?.alert_threshold_pct || 80;
  const isOverAlert = progressPct >= alertThreshold;
  const isOverLimit = spentCost >= budgetLimit;

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="card glass-premium" style={{ marginBottom: '20px', padding: '16px', border: '2px solid #000' }}>
        <h3 style={{ margin: 0, fontWeight: 'bold' }}>Token Consumption &amp; Budget Tracker</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Track API costs, monitor model performance splits, and set hard budget thresholds per client.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* Client Budget Cap Editor */}
        <div className="card" style={{ border: '2px solid #000', padding: '16px' }}>
          <h4 style={{ fontWeight: 'bold', margin: '0 0 16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Client Budget Settings</h4>
          
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Client Workspace</label>
            <select
              className="form-control"
              style={{ border: '2px solid #000', fontWeight: 'bold' }}
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
            >
              <option value="">-- Choose Client --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedClientId && budgetData ? (
            <form onSubmit={handleBudgetSubmit}>
              {/* Progress bar visual */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>
                  <span>Monthly Spend Progress:</span>
                  <span style={{ color: isOverLimit ? 'var(--accent)' : isOverAlert ? '#eab308' : '#22c55e' }}>
                    ${spentCost.toFixed(2)} / ${budgetLimit.toFixed(2)} ({progressPct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '14px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', border: '1px solid #000' }}>
                  <div 
                    style={{ 
                      width: `${progressPct}%`, 
                      height: '100%', 
                      background: isOverLimit ? 'var(--accent)' : isOverAlert ? '#eab308' : '#22c55e',
                      transition: 'width 0.4s ease'
                    }} 
                  />
                </div>
                {isOverAlert && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isOverLimit ? 'var(--accent)' : '#b45309', fontSize: '0.75rem', marginTop: '6px', fontWeight: 'bold' }}>
                    <AlertCircle size={14} />
                    {isOverLimit ? 'CRITICAL: Hard budget limit reached. Runs are blocked!' : 'WARNING: Client is approaching their spend threshold alert limit.'}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Monthly Limit (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={budgetForm.monthly_budget_usd}
                    onChange={e => setBudgetForm({ ...budgetForm, monthly_budget_usd: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Alert Threshold (%)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={budgetForm.alert_threshold_pct}
                    onChange={e => setBudgetForm({ ...budgetForm, alert_threshold_pct: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={budgetForm.hard_stop === 1}
                    onChange={e => setBudgetForm({ ...budgetForm, hard_stop: e.target.checked ? 1 : 0 })}
                  />
                  Enable Hard Stop (Block further crawls once limit is reached)
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Save size={16} /> Save Budget Settings
              </button>
            </form>
          ) : (
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '4px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Select a client above to manage budget limits and review progress trackers.</p>
            </div>
          )}
        </div>

        {/* Aggregate Stats Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Summary Overview */}
          <div className="card" style={{ border: '2px solid #000', padding: '16px', background: '#fff' }}>
            <h4 style={{ fontWeight: 'bold', margin: '0 0 12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Cost Breakdown</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>LLM Model Cost (USD)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}><DollarSign size={16} /> {totalLLMCost.toFixed(4)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ext. API cost (DataForSEO)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}><DollarSign size={16} /> {totalAPICost.toFixed(2)}</div>
              </div>
            </div>
            <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: '#166534' }}>Total Accumulated Spend:</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#166534' }}>${grandTotalCost.toFixed(4)}</span>
            </div>
          </div>

          {/* Model Split Table */}
          <div className="card" style={{ border: '2px solid #000', padding: '16px', flex: 1 }}>
            <h4 style={{ fontWeight: 'bold', margin: '0 0 12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Model Split Analysis</h4>
            <table style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Model</th>
                  <th style={{ textAlign: 'center', paddingBottom: '6px' }}>Runs</th>
                  <th style={{ textAlign: 'right', paddingBottom: '6px' }}>Accumulated Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(modelSplit).length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)' }}>No logs compiled.</td></tr>
                ) : (
                  Object.entries(modelSplit).map(([mod, data]) => (
                    <tr key={mod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 0', fontWeight: 'bold' }}>{mod}</td>
                      <td style={{ padding: '6px 0', textAlign: 'center' }}>{data.runs}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 'bold' }}>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        
        {/* Full usage log database view */}
        <div className="card" style={{ border: '2px solid #000', padding: '16px' }}>
          <h4 style={{ fontWeight: 'bold', margin: '0 0 16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Detailed Usage Logs</h4>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Filter by agent (e.g. technical)..."
              className="form-control"
              style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '0.85rem' }}
              value={filterAgent}
              onChange={e => setFilterAgent(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filter by staff trigger email..."
              className="form-control"
              style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '0.85rem' }}
              value={filterStaff}
              onChange={e => setFilterStaff(e.target.value)}
            />
          </div>

          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000' }}>
                  <th>Client</th>
                  <th>Agent</th>
                  <th>Model</th>
                  <th>Input/Output Tokens</th>
                  <th>LLM Cost</th>
                  <th>Ext. Cost</th>
                  <th>Triggered By</th>
                </tr>
              </thead>
              <tbody>
                {summaryLogs.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No usage data matching criteria found.</td></tr>
                ) : (
                  summaryLogs.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td><strong>{row.client_name || 'Global'}</strong></td>
                      <td><span className="badge badge-info">{row.agent_type}</span></td>
                      <td><span className="badge badge-secondary">{row.model}</span></td>
                      <td>{row.input_tokens} / {row.output_tokens}</td>
                      <td>${row.estimated_cost_usd.toFixed(4)}</td>
                      <td>${row.external_api_cost_usd.toFixed(2)}</td>
                      <td>{row.triggered_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Staff attribution sidebar card */}
        <div className="card" style={{ border: '2px solid #000', padding: '16px' }}>
          <h4 style={{ fontWeight: 'bold', margin: '0 0 16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>Staff Attribution</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.keys(staffAttribution).length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>No staff attribution metrics recorded.</p>
            ) : (
              Object.entries(staffAttribution).map(([email, spent]) => (
                <div key={email} style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', wordBreak: 'break-all' }}>{email}</div>
                  </div>
                  <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.9rem' }}>${spent.toFixed(3)}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
