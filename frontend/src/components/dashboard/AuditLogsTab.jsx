import React from 'react';

export default function AuditLogsTab({
  auth,
  auditLogs,
  totalAuditLogs,
  auditPage,
  setAuditPage,
  auditLimit,
  setAuditLimit,
  formatDateStr
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);

  if (!isAdmin) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      <h3 style={{ marginBottom: '16px' }}>Operational Audit Trails</h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details / Changes</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No audit logs available.
                </td>
              </tr>
            ) : (
              auditLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem' }}>{log.created_at ? formatDateStr(log.created_at.split(' ')[0]) : '-'}</td>
                  <td style={{ fontWeight: '500' }}>{log.actor_email || 'System'}</td>
                  <td><span className="badge badge-info">{log.action}</span></td>
                  <td>{log.entity_type} #{log.entity_id}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{log.diff}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalAuditLogs > 0 && (
        <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
            Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((auditPage - 1) * auditLimit + 1, totalAuditLogs)}</span> to{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(auditPage * auditLimit, totalAuditLogs)}</span> of{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{totalAuditLogs}</span> entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
              <select
                className="form-control"
                value={auditLimit}
                onChange={(e) => {
                  setAuditLimit(parseInt(e.target.value));
                  setAuditPage(1);
                }}
                style={{ width: 'auto', padding: '8px 16px 8px 12px', height: 'auto', fontSize: '0.85rem', borderWidth: '2px', cursor: 'pointer' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={auditPage === 1} onClick={() => setAuditPage(1)}>First</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={auditPage === 1} onClick={() => setAuditPage(auditPage - 1)}>Prev</button>

              {(() => {
                const totalPages = Math.ceil(totalAuditLogs / auditLimit);
                const buttons = [];
                const startPage = Math.max(1, auditPage - 2);
                const endPage = Math.min(totalPages, auditPage + 2);
                for (let i = startPage; i <= endPage; i++) {
                  buttons.push(
                    <button key={i} className={`btn ${auditPage === i ? 'btn-primary' : ''}`} style={{ padding: '8px 12px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: auditPage === i ? 'none' : '2px 2px 0px #000', minWidth: '32px' }} onClick={() => setAuditPage(i)}>
                      {i}
                    </button>
                  );
                }
                return buttons;
              })()}

              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={auditPage >= Math.ceil(totalAuditLogs / auditLimit)} onClick={() => setAuditPage(auditPage + 1)}>Next</button>
              <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={auditPage >= Math.ceil(totalAuditLogs / auditLimit)} onClick={() => setAuditPage(Math.ceil(totalAuditLogs / auditLimit))}>Last</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
