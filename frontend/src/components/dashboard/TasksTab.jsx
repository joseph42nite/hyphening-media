import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { API_BASE } from '../../api.js';

export default function TasksTab({
  auth,
  activeTab,
  clients,
  staffUsers,
  tasks,
  fetchTasks,
  showToast,
  openContentModal,
  calendarMarketingContent,
  gigs,
  calendarClientFilter,
  setCalendarClientFilter,
  formatDateStr,
  fetchCalendarMarketingContent
}) {
  const isAdmin = ['admin', 'super_admin'].includes(auth?.role);
  const isSMM = auth?.role === 'ops_social_media_manager';

  // Calendar states
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toLocaleDateString('en-CA'));

  // Task modal states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskFormData, setTaskFormData] = useState({
    title: '', description: '', client_id: '', priority: 'medium',
    task_type: 'video', assigned_to: '', due_date: '', drive_link: ''
  });

  // Task CRUD handlers
  const openTaskModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setTaskFormData({
        title: task.title,
        description: task.description || '',
        client_id: task.client_id || '',
        priority: task.priority || 'medium',
        task_type: task.task_type || 'video',
        assigned_to: task.assigned_to || '',
        due_date: task.due_date || '',
        drive_link: task.drive_link || ''
      });
    } else {
      setEditingTask(null);
      setTaskFormData({
        title: '', description: '', client_id: '', priority: 'medium',
        task_type: 'video', assigned_to: '', due_date: '', drive_link: ''
      });
    }
    setShowTaskModal(true);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    const url = editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks';
    const method = editingTask ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskFormData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Task ${editingTask ? 'updated' : 'created'} successfully`, 'success');
      setShowTaskModal(false);
      fetchTasks();
      fetchCalendarMarketingContent?.();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Calendar Helpers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const getMonthName = (monthIdx) => {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][monthIdx];
  };

  const getCalendarCells = () => {
    const cells = [];
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    // Previous month cells
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const day = prevMonthDays - i;
      const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      cells.push({
        dayNum: day,
        dateStr,
        isCurrentMonth: false,
        events: []
      });
    }

    // Current month cells
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dateEvents = [];

      // Add tasks
      tasks.forEach(t => {
        if (t.due_date === dateStr) {
          if (!calendarClientFilter || String(t.client_id) === calendarClientFilter) {
            // Synced tasks are already represented by 'content' events, exclude to prevent duplication
            if (!t.content_id) {
              dateEvents.push({
                type: 'task',
                title: t.title,
                clientName: t.client_name,
                priority: t.priority,
                status: t.status,
                originalItem: t
              });
            }
          }
        }
      });

      // Add curation gigs
      gigs.forEach(g => {
        if (g.gig_date === dateStr) {
          if (!calendarClientFilter || String(g.client_id) === calendarClientFilter) {
            dateEvents.push({
              type: 'gig',
              title: `${g.artist_name || 'Artist'} at ${g.venue_name || 'Venue'}`,
              clientName: g.client_name,
              status: g.status,
              originalItem: g
            });
          }
        }
      });

      // Add marketing content
      calendarMarketingContent.forEach(item => {
        if (item.date === dateStr) {
          if (!calendarClientFilter || String(item.client_id) === calendarClientFilter) {
            dateEvents.push({
              type: 'content',
              title: `[${item.post_type}] ${item.title || 'Untitled'}`,
              clientName: item.clientName || 'Client',
              status: item.status,
              originalItem: item
            });
          }
        }
      });

      cells.push({
        dayNum: i,
        dateStr,
        isCurrentMonth: true,
        events: dateEvents
      });
    }

    // Next month cells
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

      cells.push({
        dayNum: i,
        dateStr,
        isCurrentMonth: false,
        events: []
      });
    }

    return cells;
  };

  const getSelectedDateEvents = () => {
    const selectedEvents = [];
    tasks.forEach(t => {
      if (t.due_date === selectedDateStr) {
        if (!calendarClientFilter || String(t.client_id) === calendarClientFilter) {
          if (!t.content_id) {
            selectedEvents.push({
              type: 'task',
              title: t.title,
              clientName: t.client_name,
              priority: t.priority,
              status: t.status,
              originalItem: t
            });
          }
        }
      }
    });

    gigs.forEach(g => {
      if (g.gig_date === selectedDateStr) {
        if (!calendarClientFilter || String(g.client_id) === calendarClientFilter) {
          selectedEvents.push({
            type: 'gig',
            title: `${g.artist_name || 'Artist'} at ${g.venue_name || 'Venue'}`,
            clientName: g.client_name,
            status: g.status,
            originalItem: g
          });
        }
      }
    });

    calendarMarketingContent.forEach(item => {
      if (item.date === selectedDateStr) {
        if (!calendarClientFilter || String(item.client_id) === calendarClientFilter) {
          selectedEvents.push({
            type: 'content',
            title: `[${item.post_type}] ${item.title || 'Untitled'}`,
            clientName: item.clientName || 'Client',
            status: item.status,
            originalItem: item
          });
        }
      }
    });

    return selectedEvents;
  };

  return (
    <>
      {activeTab === 'calendar' && (
        <div style={{ textAlign: 'left' }}>
          <div className="calendar-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            <div className="calendar-month-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={handlePrevMonth} style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                &larr; Prev
              </button>
              <h3 style={{ margin: 0, textAlign: 'center', fontSize: '1.15rem', fontWeight: 800 }}>
                {getMonthName(currentMonth)} {currentYear}
              </h3>
              <button className="btn btn-secondary" onClick={handleNextMonth} style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                Next &rarr;
              </button>
            </div>

            <div className="calendar-client-filter" style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
              <label className="form-label" style={{ margin: 0, flexShrink: 0, fontWeight: 'bold' }}>Filter Client:</label>
              <select
                className="form-control"
                value={calendarClientFilter}
                onChange={(e) => setCalendarClientFilter(e.target.value)}
                style={{ width: '100%', flexGrow: 1, fontWeight: 'bold' }}
              >
                <option value="">All Clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="calendar-layout">
            <div className="glass calendar-grid-card" style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '12px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{day}</div>
                ))}
              </div>

              <div className="calendar-grid">
                {getCalendarCells().map((cell, idx) => {
                  const isSelected = cell.dateStr === selectedDateStr;
                  const today = new Date();
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const isToday = cell.dateStr === todayStr;
                  return (
                    <div
                      key={idx}
                      onClick={() => cell.isCurrentMonth && setSelectedDateStr(cell.dateStr)}
                      className={`calendar-cell ${!cell.isCurrentMonth ? 'outside-month' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    >
                      <div className="calendar-day-num">
                        {cell.dayNum}
                      </div>

                      <div className="calendar-cell-events">
                        {/* Desktop View: Text Tags */}
                        <div className="calendar-events-desktop">
                          {cell.events.slice(0, 2).map((ev, eIdx) => (
                            <div
                              key={eIdx}
                              className={`calendar-event-tag ${
                                ev.type === 'task' ? 'calendar-event-task' :
                                ev.type === 'gig' ? 'calendar-event-gig' : 'calendar-event-content'
                              }`}
                              title={ev.title}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {cell.events.length > 2 && (
                            <div style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--text-muted)', textAlign: 'left' }}>
                              +{cell.events.length - 2} more
                            </div>
                          )}
                        </div>

                        {/* Mobile View: Compact Event Dots */}
                        <div className="calendar-events-mobile">
                          {cell.events.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexWrap: 'wrap' }}>
                              {cell.events.slice(0, 3).map((ev, eIdx) => (
                                <span
                                  key={eIdx}
                                  style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: ev.type === 'task' ? '#2563eb' : ev.type === 'gig' ? '#d97706' : '#9333ea',
                                    display: 'inline-block'
                                  }}
                                  title={ev.title}
                                />
                              ))}
                              {cell.events.length > 3 && (
                                <span style={{ fontSize: '0.55rem', fontWeight: '800', color: '#000' }}>
                                  +{cell.events.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: 0 }}>
                <h3 style={{ margin: 0 }}>
                  Agenda: {selectedDateStr ? formatDateStr(selectedDateStr) : 'Select a date'}
                </h3>
                {(isAdmin || isSMM) && calendarClientFilter && selectedDateStr && (
                  <button
                    onClick={() => openContentModal(null, selectedDateStr)}
                    className="btn btn-primary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={12} /> Content
                  </button>
                )}
              </div>

              <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {getSelectedDateEvents().length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '60px', fontSize: '0.9rem' }}>
                    No tasks, gigs, or content scheduled for this day.
                  </div>
                ) : (
                  getSelectedDateEvents().map((ev, eIdx) => (
                    <div
                      key={eIdx}
                      style={{
                        padding: '12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        background: 'rgba(14, 18, 26, 0.9)',
                        boxShadow: 'var(--shadow-sm)',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span className={`badge ${
                          ev.type === 'task' ? 'badge-info' :
                          ev.type === 'gig' ? 'badge-warning' : 'badge-success'
                        }`}>
                          {ev.type.toUpperCase()}
                        </span>
                        {ev.priority && (
                          <span className={`badge badge-${ev.priority === 'urgent' || ev.priority === 'high' ? 'danger' : 'muted'}`}>
                            {ev.priority}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '0.9rem', margin: '4px 0', textTransform: 'none', letterSpacing: 'normal' }}>{ev.title}</h4>
                      {ev.clientName && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                          Client: {ev.clientName}
                        </div>
                      )}
                      {ev.status && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Status: <span style={{ textTransform: 'capitalize' }}>{ev.status === 'todo' ? 'To - Do - Today' : ev.status.replace('_', ' ')}</span>
                        </div>
                      )}
                      {ev.type === 'content' && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {ev.originalItem.script_title ? (
                            <div>Linked Script: <strong style={{ color: 'var(--accent)' }}>{ev.originalItem.script_title}</strong></div>
                          ) : (
                            ['Reel', 'Youtube', 'Short'].includes(ev.originalItem.post_type) && (
                              <div style={{ color: 'var(--text-danger)', fontWeight: 'bold' }}>
                                ⚠️ No script linked!
                              </div>
                            )
                          )}
                        </div>
                      )}
                      {ev.type === 'task' && isAdmin && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem', marginTop: '8px', width: '100%' }}
                          onClick={() => openTaskModal(ev.originalItem)}
                        >
                          Edit Task
                        </button>
                      )}
                      {ev.type === 'content' && (isAdmin || isSMM) && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem', marginTop: '8px', width: '100%' }}
                          onClick={() => openContentModal(ev.originalItem)}
                        >
                          Edit Content Row
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingTask ? 'Edit Task' : 'Create Task'}</h2>
            <form onSubmit={handleTaskSubmit} style={{ marginTop: '20px' }}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={taskFormData.title}
                  onChange={e => setTaskFormData({...taskFormData, title: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={taskFormData.description}
                  onChange={e => setTaskFormData({...taskFormData, description: e.target.value})}
                />
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Client</label>
                  <select
                    className="form-control"
                    value={taskFormData.client_id}
                    onChange={e => setTaskFormData({...taskFormData, client_id: e.target.value})}
                  >
                    <option value="">Select Client</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assignee (Staff)</label>
                  <select
                    className="form-control"
                    value={taskFormData.assigned_to}
                    onChange={e => setTaskFormData({...taskFormData, assigned_to: e.target.value})}
                  >
                    <option value="">Select Staff</option>
                    {staffUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role.replace('ops_', '').replace('_', ' ')})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Task Type</label>
                  <select
                    className="form-control"
                    value={taskFormData.task_type}
                    onChange={e => setTaskFormData({...taskFormData, task_type: e.target.value})}
                    required
                  >
                    <option value="video">Video</option>
                    <option value="script">Script</option>
                    <option value="graphic">Graphic</option>
                    <option value="social">Social</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-control"
                    value={taskFormData.priority}
                    onChange={e => setTaskFormData({...taskFormData, priority: e.target.value})}
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
                    value={taskFormData.due_date}
                    onChange={e => setTaskFormData({...taskFormData, due_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Drive Link (Video Review)</label>
                <input
                  type="url"
                  className="form-control"
                  placeholder="https://drive.google.com/..."
                  value={taskFormData.drive_link}
                  onChange={e => setTaskFormData({...taskFormData, drive_link: e.target.value})}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
