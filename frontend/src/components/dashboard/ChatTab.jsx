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
  const inputRef = useRef(null);

  // Mention system state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIdx, setMentionStartIdx] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  // Filter clients to only show parent/standalone companies in the sidebar
  const chatClients = React.useMemo(() => {
    return clients.filter(c => !c.parent_id);
  }, [clients]);

  // Aggregate tasks for the selected parent client and all of its children
  const clientTasks = React.useMemo(() => {
    if (!selectedChatClient) return [];
    return tasks.filter(t => {
      if (t.client_id === selectedChatClient.id) return true;
      const taskClient = clients.find(c => c.id === t.client_id);
      if (taskClient && taskClient.parent_id === selectedChatClient.id) return true;
      return false;
    });
  }, [tasks, selectedChatClient, clients]);

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

  // Click outside to close mention dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMentionDropdown && !event.target.closest('.mention-dropdown') && !event.target.closest('.chat-input-field')) {
        setShowMentionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMentionDropdown]);

  // Mention Suggestions list
  const mentionSuggestions = staffUsers.filter(u =>
    u.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewChatMessage(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIdx + 1);
      // Only trigger if there are no spaces between '@' and current cursor position
      if (!textAfterAt.includes(' ')) {
        setMentionQuery(textAfterAt);
        setMentionStartIdx(lastAtIdx);
        setShowMentionDropdown(true);
        setActiveMentionIndex(0);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const handleInputKeyDown = (e) => {
    if (showMentionDropdown && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveMentionIndex(prev => (prev + 1) % mentionSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMentionUser(mentionSuggestions[activeMentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionDropdown(false);
      }
    }
  };

  const selectMentionUser = (user) => {
    const textBeforeAt = newChatMessage.slice(0, mentionStartIdx);
    const textAfterCursor = newChatMessage.slice(inputRef.current?.selectionStart || newChatMessage.length);
    const newText = `${textBeforeAt}@${user.name} ${textAfterCursor}`;
    setNewChatMessage(newText);
    setShowMentionDropdown(false);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = mentionStartIdx + user.name.length + 2; // +2 for @ and trailing space
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Helper to parse message text and render highlighted mentions
  const renderMessageContent = (text) => {
    if (!text) return '';
    const parts = text.split(/(\s+)/);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const match = part.substring(1).match(/^([a-zA-Z0-9_]+)(.*)$/);
        if (match) {
          const candidateName = match[1];
          const punctuation = match[2];
          const matchedUser = staffUsers.find(u => u.name.toLowerCase() === candidateName.toLowerCase());
          if (matchedUser) {
            return (
              <span key={index}>
                <span
                  style={{
                    background: '#fef3c7',
                    color: '#d97706',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    border: '1px solid #f59e0b',
                    fontSize: '0.85rem'
                  }}
                >
                  @{matchedUser.name}
                </span>
                {punctuation}
              </span>
            );
          }
        }
      }
      return part;
    });
  };

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
        setShowMentionDropdown(false);
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
          {chatClients.map(c => (
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
              {(() => {
                let totalUnseen = unseenCounts[c.id] || 0;
                clients.forEach(child => {
                  if (child.parent_id === c.id) {
                    totalUnseen += unseenCounts[child.id] || 0;
                  }
                });
                if (totalUnseen > 0) {
                  return (
                    <span style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '-10px',
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
                      boxShadow: '1px 1px 0px #000',
                      zIndex: 10
                    }}>
                      {totalUnseen}
                    </span>
                  );
                }
                return null;
              })()}
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
                  const messageClient = clients.find(cl => cl.id === msg.client_id);
                  const showBrandName = messageClient && messageClient.id !== selectedChatClient.id;
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
                        {msg.sender_name} {showBrandName && `(${messageClient.name})`} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontWeight: '500', fontSize: '0.9rem', wordBreak: 'break-word', lineHeight: '1.4' }}>
                        {renderMessageContent(msg.message)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input form */}
            <div style={{ position: 'relative' }}>
              {showMentionDropdown && mentionSuggestions.length > 0 && (
                <div
                  className="mention-dropdown"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: '0',
                    width: '280px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    background: '#fff',
                    border: '2px solid #000',
                    boxShadow: '3px 3px 0px #000',
                    borderRadius: '4px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 0'
                  }}
                >
                  <div style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
                    Mention Team Member
                  </div>
                  {mentionSuggestions.map((user, idx) => {
                    const isActive = idx === activeMentionIndex;
                    return (
                      <div
                        key={user.id}
                        onClick={() => selectMentionUser(user)}
                        onMouseEnter={() => setActiveMentionIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isActive ? '#000' : 'transparent',
                          color: isActive ? '#fff' : '#000',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          transition: 'background 0.1s ease, color 0.1s ease'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{user.name}</div>
                        <div style={{ fontSize: '0.7rem', opacity: isActive ? 0.8 : 0.6 }}>
                          {user.role.replace('ops_', '').replace('_', ' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '12px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  className="form-control chat-input-field"
                  placeholder="Type internal chat message..."
                  value={newChatMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  style={{ flexGrow: 1 }}
                  required
                />
                <button type="submit" className="btn btn-primary">
                  Send
                </button>
              </form>
            </div>
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
                        <td style={{ fontWeight: 'bold' }}>
                          {task.title}
                          {task.client_id !== selectedChatClient.id && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'normal', marginTop: '2px' }}>
                              Brand: <span style={{ fontWeight: 'bold' }}>{task.client_name}</span>
                            </div>
                          )}
                        </td>
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
