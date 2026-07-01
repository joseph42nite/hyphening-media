import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../../api.js';

export default function ChatTab({
  auth,
  clients,
  selectedChatClient,
  setSelectedChatClient,
  chatMessages,
  setChatMessages,
  fetchChats,
  tasks,
  fetchTasks,
  showToast,
  formatDateStr,
  staffUsers,
  unseenCounts = {}
}) {
  const isVideoEditor = auth?.role === 'ops_video_editor';
  const chatContainerRef = useRef(null);

  // Local state for chat message input
  const [newChatMessage, setNewChatMessage] = useState('');

  // Local pagination states for Job Assignments
  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [assignmentsLimit, setAssignmentsLimit] = useState(5);

  const columns = ['todo', 'in_progress', 'review_pending', 'delivered'];

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedChatClient) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedChatClient.id}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newChatMessage }),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        setNewChatMessage('');
        fetchChats(selectedChatClient.id);
      } else {
        showToast(data.error || 'Failed to send message', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      showToast('Status updated successfully', 'success');
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getTaskPriority = (task) => {
    if (task.task_type === 'social') {
      if (task.due_date) {
        const todayStr = new Date().toLocaleDateString('en-CA');
        if (task.due_date < todayStr) return 'high';
        if (task.due_date === todayStr) return 'medium';
        if (task.due_date > todayStr) return 'low';
      }
      return 'medium';
    }
    return task.priority || 'medium';
  };

  const getPriorityBadgeClass = (priority) => {
    if (priority === 'urgent' || priority === 'high') return 'danger';
    if (priority === 'medium') return 'warning';
    if (priority === 'low') return 'muted';
    return 'muted';
  };

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'delivered') return false;
    const todayStr = new Date().toLocaleDateString('en-CA');
    return task.due_date < todayStr;
  };

  return (
    <div className="workspace-layout">
      {/* Left Bento: Client selector */}
      <div className="glass" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: 'fit-content' }}>
        <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>Clients</h3>
        <div className="workspace-client-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {clients.map(c => (
            <div
              key={c.id}
              onClick={() => {
                setSelectedChatClient(c);
                fetchChats(c.id);
              }}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '2px solid #000',
                cursor: 'pointer',
                background: selectedChatClient?.id === c.id ? '#000' : '#fff',
                color: selectedChatClient?.id === c.id ? '#fff' : '#000',
                fontWeight: 'bold',
                transition: 'all 0.15s ease',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span>{c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}</span>
              {unseenCounts[c.id] > 0 && (
                <span style={{
                  background: 'var(--warning)',
                  color: '#000',
                  border: '2px solid #000',
                  borderRadius: '50%',
                  minWidth: '22px',
                  height: '22px',
                  padding: '2px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '1px 1px 0px #000'
                }}>
                  {unseenCounts[c.id]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Workspaces */}
      {selectedChatClient ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Right Top Bento: Chat */}
          <div className="glass workspace-chat-box" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
              Internal Chat — {selectedChatClient.name}
            </h3>

            {/* Messages container */}
            <div ref={chatContainerRef} style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#f4f4f5', borderRadius: '8px', border: '2px solid #000', marginBottom: '12px' }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '100px' }}>
                  No internal chat messages yet. Start the conversation!
                </div>
              ) : (
                chatMessages.map(msg => {
                  const isMe = msg.sender_id === auth?.id;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '70%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        border: '2px solid #000',
                        background: isMe ? '#000' : '#fff',
                        color: isMe ? '#fff' : '#000',
                        boxShadow: '2px 2px 0px #000'
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isMe ? '#a1a1aa' : 'var(--text-muted)', marginBottom: '2px' }}>
                        {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontWeight: '500', fontSize: '0.9rem', wordBreak: 'break-word' }}>
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input form */}
            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Type internal chat message..."
                value={newChatMessage}
                onChange={e => setNewChatMessage(e.target.value)}
                style={{ flexGrow: 1 }}
                required
              />
              <button type="submit" className="btn btn-primary">
                Send
              </button>
            </form>
          </div>

          {/* Right Bottom Bento: Assignments */}
          <div className="glass">
            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
              Job Assignments — {selectedChatClient.name}
            </h3>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Task / Job</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Due Date</th>
                    {!isVideoEditor && <th>Assignee</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const clientTasks = tasks.filter(t => t.client_id === selectedChatClient.id);
                    if (clientTasks.length === 0) {
                      return (
                        <tr>
                          <td colSpan={isVideoEditor ? 5 : 6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            {isVideoEditor ? 'No video tasks assigned to you for this client.' : 'No tasks assigned to this client.'}
                          </td>
                        </tr>
                      );
                    }
                    const startIndex = (assignmentsPage - 1) * assignmentsLimit;
                    const paginatedTasks = clientTasks.slice(startIndex, startIndex + assignmentsLimit);

                    return paginatedTasks.map(task => (
                      <tr key={task.id}>
                        <td style={{ fontWeight: 'bold' }}>{task.title}</td>
                        <td>
                          <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>{task.task_type}</span>
                        </td>
                        <td>
                          <span className={`badge badge-${getPriorityBadgeClass(getTaskPriority(task))}`}>
                            {getTaskPriority(task)}
                          </span>
                        </td>
                        <td style={{ color: isOverdue(task) ? 'var(--danger)' : 'inherit', fontWeight: isOverdue(task) ? 'bold' : 'normal' }}>
                          {task.due_date ? formatDateStr(task.due_date) : 'No due date'} {isOverdue(task) && '⚠️'}
                        </td>
                        {!isVideoEditor && (
                          <td>
                            <select
                              className="form-control"
                              value={task.assigned_to || ''}
                              onChange={async (e) => {
                                const val = e.target.value ? parseInt(e.target.value) : null;
                                try {
                                  const res = await fetch(`${API_BASE}/api/tasks/${task.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ assigned_to: val }),
                                    credentials: 'include'
                                  });
                                  if (res.ok) {
                                    showToast('Freelancer assigned successfully', 'success');
                                    fetchTasks();
                                  } else {
                                    const data = await res.json();
                                    throw new Error(data.error);
                                  }
                                } catch (err) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              style={{ padding: '6px', fontSize: '0.8rem' }}
                            >
                              <option value="">Unassigned</option>
                              {staffUsers.map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role.replace('ops_', '').replace('_', ' ')})</option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td>
                          <select
                            className="form-control"
                            value={task.status}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                            style={{ padding: '6px', fontSize: '0.8rem' }}
                          >
                            {columns.map(status => (
                              <option key={status} value={status}>{status === 'todo' ? 'To - Do - Today' : status.replace('_', ' ')}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {(() => {
              const clientTasks = tasks.filter(t => t.client_id === selectedChatClient.id);
              if (clientTasks.length === 0) return null;
              return (
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderTop: '2px solid #000', paddingTop: '16px' }}>
                  <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                    Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((assignmentsPage - 1) * assignmentsLimit + 1, clientTasks.length)}</span> to{' '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(assignmentsPage * assignmentsLimit, clientTasks.length)}</span> of{' '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{clientTasks.length}</span> entries
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
                      <select
                        className="form-control"
                        value={assignmentsLimit}
                        onChange={(e) => {
                          setAssignmentsLimit(parseInt(e.target.value));
                          setAssignmentsPage(1);
                        }}
                        style={{ width: 'auto', padding: '8px 16px 8px 12px', height: 'auto', fontSize: '0.85rem', borderWidth: '2px', cursor: 'pointer' }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                      <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={assignmentsPage === 1} onClick={() => setAssignmentsPage(1)}>First</button>
                      <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={assignmentsPage === 1} onClick={() => setAssignmentsPage(assignmentsPage - 1)}>Prev</button>

                      {(() => {
                        const totalPages = Math.ceil(clientTasks.length / assignmentsLimit);
                        const buttons = [];
                        const startPage = Math.max(1, assignmentsPage - 2);
                        const endPage = Math.min(totalPages, assignmentsPage + 2);
                        for (let i = startPage; i <= endPage; i++) {
                          buttons.push(
                            <button key={i} className={`btn ${assignmentsPage === i ? 'btn-primary' : ''}`} style={{ padding: '8px 12px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: assignmentsPage === i ? 'none' : '2px 2px 0px #000', minWidth: '32px' }} onClick={() => setAssignmentsPage(i)}>
                              {i}
                            </button>
                          );
                        }
                        return buttons;
                      })()}

                      <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={assignmentsPage >= Math.ceil(clientTasks.length / assignmentsLimit)} onClick={() => setAssignmentsPage(assignmentsPage + 1)}>Next</button>
                      <button className="btn" style={{ padding: '8px 14px', fontSize: '0.75rem', borderWidth: '2px', boxShadow: '2px 2px 0px #000' }} disabled={assignmentsPage >= Math.ceil(clientTasks.length / assignmentsLimit)} onClick={() => setAssignmentsPage(Math.ceil(clientTasks.length / assignmentsLimit))}>Last</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: 'var(--text-muted)' }}>
          Select a client to view assignments and internal chats.
        </div>
      )}
    </div>
  );
}
