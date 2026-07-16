import React, { useState, useEffect } from 'react';
import { Plus, AlertTriangle, Calendar as CalendarIcon, CheckSquare, Search } from 'lucide-react';
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

  // Kanban filters/search
  const [taskSearch, setTaskSearch] = useState('');
  const [taskClientFilter, setTaskClientFilter] = useState('');
  const [taskFormatFilter, setTaskFormatFilter] = useState('');

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

  const columns = ['backlog', 'todo', 'in_progress', 'delivered'];

  // Helper functions
  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'delivered') return false;
    const todayStr = new Date().toLocaleDateString('en-CA');
    return task.due_date < todayStr;
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

  const getTasksByStatus = (status) => {
    const filteredTasks = tasks.filter(t => {
      if (taskClientFilter && String(t.client_id) !== taskClientFilter) return false;
      if (taskFormatFilter) {
        const desc = (t.description || '').toLowerCase();
        if (taskFormatFilter === 'reel' && !desc.includes('post type: reel')) return false;
        if (taskFormatFilter === 'carousel' && !desc.includes('post type: carousel')) return false;
        if (taskFormatFilter === 'long_format' && !(desc.includes('post type: youtube') || desc.includes('post type: long_format'))) return false;
      }
      if (taskSearch) {
        const matchTitle = t.title.toLowerCase().includes(taskSearch.toLowerCase());
        const matchClient = t.client_name && t.client_name.toLowerCase().includes(taskSearch.toLowerCase());
        const matchDesc = t.description && t.description.toLowerCase().includes(taskSearch.toLowerCase());
        if (!matchTitle && !matchClient && !matchDesc) return false;
      }
      return true;
    });

    const localTodayStr = new Date().toLocaleDateString('en-CA');

    if (status === 'todo') {
      // TO - DO - TODAY: pending tasks due today or explicitly status 'todo' with no due date
      return filteredTasks.filter(t => 
        t.status !== 'delivered' && 
        t.status !== 'in_progress' && 
        (t.due_date === localTodayStr || (t.status === 'todo' && !t.due_date))
      );
    }
    if (status === 'backlog') {
      // BACKLOG: pending tasks that are not due today (overdue, future, or explicitly backlog)
      const list = filteredTasks.filter(t => 
        t.status !== 'delivered' && 
        t.status !== 'in_progress' && 
        t.due_date !== localTodayStr &&
        !(t.status === 'todo' && !t.due_date)
      );
      return list.sort((a, b) => {
        const isOverdueA = a.due_date && a.due_date < localTodayStr;
        const isOverdueB = b.due_date && b.due_date < localTodayStr;
        
        if (isOverdueA && !isOverdueB) return -1;
        if (!isOverdueA && isOverdueB) return 1;
        
        if (a.due_date && b.due_date) {
          return a.due_date.localeCompare(b.due_date);
        }
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
      });
    }
    if (status === 'in_progress') {
      return filteredTasks.filter(t => t.status === 'in_progress');
    }
    if (status === 'delivered') {
      const deliveredTasks = filteredTasks.filter(t => t.status === 'delivered');
      // Sort: most recently completed/updated first, limit to 10
      return deliveredTasks.sort((a, b) => {
        const timeA = new Date(a.completed_at || a.updated_at || 0).getTime();
        const timeB = new Date(b.completed_at || b.updated_at || 0).getTime();
        return timeB - timeA;
      }).slice(0, 10);
    }
    return [];
  };

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
      fetchCalendarMarketingContent?.();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleKanbanCardClick = (task) => {
    if (task.content_id) {
      if (isAdmin || isSMM) {
        // We will define content detail fetching in TasksTab too
        fetchContentAndOpenModal(task.client_id, task.content_id);
      }
    } else {
      if (isAdmin) {
        openTaskModal(task);
      }
    }
  };

  const fetchContentAndOpenModal = async (clientId, contentId) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${clientId}/marketing/content/${contentId}`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch content details');
      }
      const contentData = await res.json();
      openContentModal(contentData);
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
      {activeTab === 'tasks' && (
        <div style={{ textAlign: 'left' }}>
          <div className="dashboard-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search tasks or client..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                style={{ width: '260px' }}
              />
              <select
                className="form-control"
                value={taskClientFilter}
                onChange={(e) => setTaskClientFilter(e.target.value)}
                style={{ width: '200px' }}
              >
                <option value="">All Clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              <select
                className="form-control"
                value={taskFormatFilter}
                onChange={(e) => setTaskFormatFilter(e.target.value)}
                style={{ width: '160px' }}
              >
                <option value="">All Formats</option>
                <option value="reel">Reel</option>
                <option value="carousel">Carousel</option>
                <option value="long_format">Long Form</option>
              </select>
            </div>
            {isAdmin && (
              <button onClick={() => openTaskModal()} className="btn btn-primary" style={{ flexShrink: 0 }}>
                <Plus size={16} /> Create Task
              </button>
            )}
          </div>

          <div className="kanban-board">
            {columns.map(col => {
              const columnTasks = getTasksByStatus(col);
              return (
                <div key={col} className="kanban-column">
                  <div className="kanban-column-header">
                    <span className="kanban-column-title">
                      {col === 'todo' ? 'TO - DO - TODAY' : col.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="kanban-column-count">{columnTasks.length}</span>
                  </div>

                  <div className="kanban-cards">
                    {columnTasks.map(task => (
                      <div
                        key={task.id}
                        className={`kanban-card ${isOverdue(task) ? 'kanban-card-overdue' : ''}`}
                        onClick={() => handleKanbanCardClick(task)}
                        style={{ cursor: ((task.content_id && (isAdmin || isSMM)) || (!task.content_id && isAdmin)) ? 'pointer' : 'default' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span className="badge badge-muted" style={{ fontSize: '0.62rem', padding: '2px 5px', borderWidth: '1.5px' }}>{task.task_type}</span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {isOverdue(task) && (
                              <span className="badge" style={{ fontSize: '0.62rem', background: '#fee2e2', color: '#991b1b', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 5px', borderWidth: '1.5px' }}>
                                <AlertTriangle size={9} /> OVERDUE
                              </span>
                            )}
                            <span className={`badge badge-${getPriorityBadgeClass(getTaskPriority(task))}`} style={{ fontSize: '0.62rem', padding: '2px 5px', borderWidth: '1.5px' }}>
                              {getTaskPriority(task)}
                            </span>
                          </div>
                        </div>
                        <div className="kanban-card-title">{task.title}</div>
                        {task.client_name && (
                          <div style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '3px' }}>
                            Client: {task.client_name}
                          </div>
                        )}
                        {task.due_date && (
                          <div style={{
                            fontSize: '0.7rem',
                            color: isOverdue(task) ? 'var(--danger)' : 'var(--text-muted)',
                            fontWeight: isOverdue(task) ? 'bold' : 'normal',
                            marginTop: '1px'
                          }}>
                            {formatDateStr(task.due_date)} {isOverdue(task) && '⚠️'}
                          </div>
                        )}
                        {task.freelancer_name && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px', fontWeight: 'bold' }}>
                            Assigned: {task.freelancer_name}
                          </div>
                        )}

                        <div className="kanban-card-footer" style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                          <select
                            className="form-control"
                            value={col}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                            style={{ padding: '2px 6px', fontSize: '0.68rem', width: 'auto', background: 'var(--bg-input)', borderWidth: '1.5px', height: '24px', borderRadius: '4px' }}
                          >
                            {columns.map(status => (
                              <option key={status} value={status}>{status === 'todo' ? 'To - Do - Today' : status.replace('_', ' ')}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div style={{ textAlign: 'left' }}>
          <div className="dashboard-toolbar" style={{ flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={handlePrevMonth} style={{ padding: '8px 12px' }}>
                &larr; Prev
              </button>
              <h3 style={{ margin: 0, minWidth: '160px', textAlign: 'center' }}>
                {getMonthName(currentMonth)} {currentYear}
              </h3>
              <button className="btn btn-secondary" onClick={handleNextMonth} style={{ padding: '8px 12px' }}>
                Next &rarr;
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexGrow: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <label className="form-label" style={{ margin: 0 }}>Filter Client:</label>
              <select
                className="form-control"
                value={calendarClientFilter}
                onChange={(e) => setCalendarClientFilter(e.target.value)}
                style={{ width: 'auto', minWidth: '180px' }}
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
            <div className="glass" style={{ padding: '16px' }}>
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
                        border: '2px solid #000',
                        borderRadius: '8px',
                        background: '#fff',
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
