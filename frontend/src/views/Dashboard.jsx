import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api.js';
import logoImg from '../assets/logo.png';
import { 
  Users, Folder, Calendar, DollarSign, Clock, CheckSquare, 
  Layers, Shield, LogOut, RefreshCw, FileSpreadsheet, Plus, 
  Search, Share2, FileDown, Eye, HelpCircle, Check, X, ShieldAlert,
  AlertTriangle, Play, MessageSquare, FileText, Bell, BellOff
} from 'lucide-react';

import TasksTab from '../components/dashboard/TasksTab.jsx';
import FreelancersTab from '../components/dashboard/FreelancersTab.jsx';
import ArtistCurationTab from '../components/dashboard/ArtistCurationTab.jsx';
import ScriptTrackerTab from '../components/dashboard/ScriptTrackerTab.jsx';
import MarketingDataTab from '../components/dashboard/MarketingDataTab.jsx';
import AuditLogsTab from '../components/dashboard/AuditLogsTab.jsx';
import ChatTab from '../components/dashboard/ChatTab.jsx';
import ContentModal from '../components/dashboard/ContentModal.jsx';
import BlogTab from '../components/dashboard/BlogTab.jsx';
import ClientsTab from '../components/dashboard/ClientsTab.jsx';

let isRefreshing = false;
let refreshPromise = null;

export default function Dashboard({ auth, setAuth, showToast }) {
  const navigate = useNavigate();
  
  const formatDateStr = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    const monthName = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ][parseInt(month) - 1];
    return `${parseInt(day)} ${monthName} ${year}`;
  };

  const formatMonthStr = (monthStr) => {
    if (!monthStr) return '-';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const monthName = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][parseInt(month) - 1];
    return `${monthName} ${year}`;
  };

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

  const userRole = auth?.role || 'ops_video_editor';
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const isSuperAdmin = userRole === 'super_admin';
  const isSMM = userRole === 'ops_social_media_manager';
  const isVideoEditor = userRole === 'ops_video_editor';
  
  // Tab states
  const [activeTab, setActiveTab] = useState('tasks');
  
  // Data states
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(25);
  const [totalAuditLogs, setTotalAuditLogs] = useState(0);
  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [assignmentsLimit, setAssignmentsLimit] = useState(5);
  const [artists, setArtists] = useState([]);
  const [venues, setVenues] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  
  // Selected client for marketing reports
  const [selectedClientForReports, setSelectedClientForReports] = useState(null);
  const [marketingContent, setMarketingContent] = useState([]);
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [monthlyReports, setMonthlyReports] = useState([]);
  const [marketingScripts, setMarketingScripts] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);

  // Chat state
  const [selectedChatClient, setSelectedChatClient] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default');
  const [unseenCounts, setUnseenCounts] = useState({});
  const [clientRecencyOrder, setClientRecencyOrder] = useState([]);

  // SSE State
  const [sseConnected, setSseConnected] = useState(false);

  // Search/Filters
  const [clientSearch, setClientSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskClientFilter, setTaskClientFilter] = useState('');

  // Calendar states
  const localTodayStr = new Date().toLocaleDateString('en-CA');
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDateStr, setSelectedDateStr] = useState(localTodayStr);
  const [calendarClientFilter, setCalendarClientFilter] = useState('');
  const [calendarMarketingContent, setCalendarMarketingContent] = useState([]);

  // Modals state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskFormData, setTaskFormData] = useState({
    title: '', description: '', client_id: '', priority: 'medium',
    task_type: 'video', assigned_to: '', due_date: '', drive_link: ''
  });

  const [showContentModal, setShowContentModal] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [contentFormData, setContentFormData] = useState({
    platform: 'instagram',
    date: '',
    post_type: 'Reel',
    title: '',
    script: '',
    script_id: '',
    status: 'Draft',
    link: '',
    time: '',
    caption: '',
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
    follows: '',
    avg_watch_time_pct: '',
    boosted: 'No',
    youtube_views: '',
    youtube_watch_time: '',
    youtube_avg_view_duration: '',
    youtube_ctr: '',
    facebook_post_id: '',
    instagram_media_id: '',
    youtube_video_id: '',
    assigned_to: ''
  });

  // Script Tracker states
  const [selectedScriptClient, setSelectedScriptClient] = useState(null);
  const [scriptMonth, setScriptMonth] = useState(new Date().toISOString().substring(0, 7));

  // Refs to avoid closing EventSource connection when selected client / client list changes
  const selectedClientForReportsRef = useRef(selectedClientForReports);
  selectedClientForReportsRef.current = selectedClientForReports;

  const selectedChatClientRef = useRef(selectedChatClient);
  selectedChatClientRef.current = selectedChatClient;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  const chatContainerRef = useRef(null);

  // Auto-scroll only the chat messages container (not the page)
  useEffect(() => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      container.scrollTop = container.scrollHeight;
      const timer = setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [chatMessages, activeTab, selectedChatClient]);

  // Reset job assignments page and clear unseen counts when active client or active tab changes
  useEffect(() => {
    setAssignmentsPage(1);
    if (selectedChatClient && activeTab === 'client-workspaces') {
      setUnseenCounts(prev => {
        const nextCounts = { ...prev, [selectedChatClient.id]: 0 };
        // Also clear children's unseen counts
        clients.forEach(child => {
          if (child.parent_id === selectedChatClient.id) {
            nextCounts[child.id] = 0;
          }
        });
        return nextCounts;
      });
    }
  }, [selectedChatClient, activeTab, clients]);

  // Auto-refresh fetch wrapper: handles expired JWT tokens transparently
  const authFetch = async (url, options = {}) => {
    let res = await fetch(`${API_BASE}${url}`, { ...options, credentials: 'include' });
    if (res.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
          .then(async (refreshRes) => {
            isRefreshing = false;
            refreshPromise = null;
            if (refreshRes.ok) {
              return true;
            } else {
              localStorage.removeItem('user');
              setAuth(null);
              navigate('/login');
              return false;
            }
          })
          .catch(() => {
            isRefreshing = false;
            refreshPromise = null;
            localStorage.removeItem('user');
            setAuth(null);
            navigate('/login');
            return false;
          });
      }

      const success = await refreshPromise;
      if (success) {
        // Retry the original request with the new cookie
        res = await fetch(`${API_BASE}${url}`, { ...options, credentials: 'include' });
      } else {
        throw new Error('Session expired. Please log in again.');
      }
    }
    return res;
  };


  // Request Notification Permissions on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Helper to play synthesized notification chime
  const playNotificationSound = (force = false, isMention = false) => {
    if (!soundEnabled && !force) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02); // quick smooth fade-in
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // smooth decay
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      if (isMention) {
        // Special mention chime: rising triad chord G5 (783.99 Hz), C6 (1046.50 Hz), E6 (1318.51 Hz)
        playTone(783.99, now, 0.15);
        playTone(1046.50, now + 0.1, 0.15);
        playTone(1318.51, now + 0.2, 0.4);
      } else {
        // Soft, premium chime: G5 (783.99 Hz) then C6 (1046.50 Hz)
        playTone(783.99, now, 0.35);
        playTone(1046.50, now + 0.08, 0.45);
      }
    } catch (err) {
      console.warn('AudioContext playback failed. Requires user interaction first.', err);
    }
  };

  // Helper to trigger system Notification
  const triggerSystemNotification = (title, body) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (err) {
        console.error('Failed to trigger system notification:', err);
      }
    }
  };

  // Helper to handle manual notification permission request
  const handleRequestPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          showToast('System notifications enabled!', 'success');
          playNotificationSound(true);
        } else if (permission === 'denied') {
          showToast('System notifications blocked. Please enable them in browser settings.', 'warning');
        }
      });
    }
  };

  // Helper to toggle sound chime mute/unmute
  const toggleSound = () => {
    setSoundEnabled(prev => {
      const newVal = !prev;
      showToast(newVal ? 'Chime sound enabled' : 'Chime sound muted', 'info');
      if (newVal) {
        playNotificationSound(true);
      }
      return newVal;
    });
  };

  // 1. Initial Data Fetch Hook
  useEffect(() => {
    if (!auth) {
      navigate('/login');
      return;
    }
    
    fetchTasks();
    fetchStaffUsers();
    fetchClients();
    if (isAdmin) {
      fetchFreelancers();
      fetchCurationData();
    }
    if (isAdmin || isSMM) {
      fetchReviewQueue();
    }
  }, [auth]);

  // 1b. Audit Logs Fetch Hook
  useEffect(() => {
    if (auth && isAdmin && activeTab === 'audit') {
      fetchAuditLogs(auditPage, auditLimit);
    }
  }, [auth, isAdmin, activeTab, auditPage, auditLimit]);

  // 2. SSE Connection Hook
  useEffect(() => {
    if (!auth) return;

    const es = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    
    es.addEventListener('task_updated', (e) => {
      const data = JSON.parse(e.data);
      showToast(`Task "${data.title}" updated to ${data.status}`, 'info');
      fetchTasks();
    });

    es.addEventListener('content_approved', (e) => {
      const data = JSON.parse(e.data);
      showToast(`Content approved by client!`, 'success');
      if (selectedClientForReportsRef.current) {
        fetchMarketingData(selectedClientForReportsRef.current.id);
      }
      fetchCalendarMarketingContent();
    });

    es.addEventListener('client_feedback', (e) => {
      const data = JSON.parse(e.data);
      showToast(`New client request: "${data.message}"`, 'warning');
    });

    es.addEventListener('chat_message', (e) => {
      const data = JSON.parse(e.data);
      
      // Map child client_id to parent client_id if applicable
      const targetClient = (clientsRef.current || []).find(c => c.id === data.client_id);
      const effectiveClientId = (targetClient && targetClient.parent_id) ? targetClient.parent_id : data.client_id;

      // Do not notify if the message is from ourselves
      if (auth && data.message.sender_id === auth.id) {
        if (selectedChatClientRef.current && selectedChatClientRef.current.id === effectiveClientId) {
          setChatMessages(prev => [...prev, data.message]);
        }
        // Move to the top of recency list
        setClientRecencyOrder(prev => {
          const filtered = prev.filter(id => id !== effectiveClientId);
          return [effectiveClientId, ...filtered];
        });
        return;
      }

      // Move to the top of recency list
      setClientRecencyOrder(prev => {
        const filtered = prev.filter(id => id !== effectiveClientId);
        return [effectiveClientId, ...filtered];
      });

      // Increment unseen count if chat is not active
      const isChatActive = activeTabRef.current === 'client-workspaces' && 
                           selectedChatClientRef.current && 
                           selectedChatClientRef.current.id === effectiveClientId;
      if (!isChatActive) {
        setUnseenCounts(prev => ({
          ...prev,
          [effectiveClientId]: (prev[effectiveClientId] || 0) + 1
        }));
      }

      // Check if the current user was mentioned in the message text
      const isMentioned = auth && 
        data.message.message && 
        new RegExp(`@${auth.name}\\b`, 'i').test(data.message.message);

      // Play chime sound (with different tone for mentions)
      playNotificationSound(false, isMentioned);

      // Find client names
      const client = (clientsRef.current || []).find(c => c.id === effectiveClientId);
      const clientName = client ? client.name : 'Client';
      
      const sourceClient = (clientsRef.current || []).find(c => c.id === data.client_id);
      const sourceClientName = sourceClient ? sourceClient.name : clientName;

      // Send system browser notification
      const notificationTitle = isMentioned 
        ? `🔔 Mentioned in ${clientName} chat` 
        : `New message in ${clientName} chat`;
      const notificationBody = isMentioned
        ? `You were mentioned by ${data.message.sender_name} for ${sourceClientName}: "${data.message.message}"`
        : `${data.message.sender_name} (${sourceClientName}): "${data.message.message}"`;
      triggerSystemNotification(notificationTitle, notificationBody);

      if (selectedChatClientRef.current && selectedChatClientRef.current.id === effectiveClientId) {
        setChatMessages(prev => [...prev, data.message]);
        if (isMentioned) {
          showToast(`🔔 ${data.message.sender_name} mentioned you in active chat!`, 'warning');
        } else {
          showToast(`New message from ${data.message.sender_name} in active chat`, 'info');
        }
      } else {
        if (isMentioned) {
          showToast(`🔔 Mentioned by ${data.message.sender_name} in ${clientName} chat!`, 'warning');
        } else {
          showToast(`New message in ${clientName} chat: "${data.message.message.substring(0, 30)}..."`, 'info');
        }
      }

    });

    return () => es.close();
  }, [auth]);

  // Hook to fetch calendar marketing content
  useEffect(() => {
    if (activeTab === 'calendar' && clients.length > 0) {
      fetchCalendarMarketingContent();
    }
  }, [activeTab, calendarClientFilter, clients]);

  // Core Data Fetching
  const fetchTasks = async () => {
    try {
      const res = await authFetch('/api/tasks');
      const data = await res.json();
      if (res.ok) setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await authFetch('/api/clients');
      const data = await res.json();
      if (res.ok) {
        const allClients = data.clients || [];
        setClients(allClients);
        if (allClients.length > 0) {
          const marketingClients = allClients.filter(c => c.client_type !== 'artist_curation');
          // Video editors don't need marketing reports/scripts data
          if (!isVideoEditor && marketingClients.length > 0) {
            if (!selectedClientForReports) {
              setSelectedClientForReports(marketingClients[0]);
              fetchMarketingData(marketingClients[0].id);
            }
            if (!selectedScriptClient) {
              setSelectedScriptClient(marketingClients[0]);
            }
          }
          if (!selectedChatClient) {
            setSelectedChatClient(allClients[0]);
            fetchChats(allClients[0].id);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChats = async (clientId) => {
    try {
      const res = await authFetch(`/api/clients/${clientId}/chats`);
      const data = await res.json();
      if (res.ok) setChatMessages(data.chats || []);
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  const fetchFreelancers = async () => {
    try {
      const res = await authFetch('/api/freelancers');
      const data = await res.json();
      if (res.ok) setFreelancers(data.freelancers || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStaffUsers = async () => {
    try {
      const res = await authFetch('/api/auth/users');
      const data = await res.json();
      if (res.ok) setStaffUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async (page = 1, limit = 25) => {
    try {
      const offset = (page - 1) * limit;
      const res = await authFetch(`/api/audit-logs?limit=${limit}&offset=${offset}`);
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.logs || []);
        setTotalAuditLogs(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCurationData = async () => {
    try {
      
      const artistRes = await authFetch('/api/artists');
      if (artistRes.ok) {
        const artistData = await artistRes.json();
        setArtists(artistData.artists || []);
      }

      const venueRes = await authFetch('/api/artists/venues');
      if (venueRes.ok) {
        const venueData = await venueRes.json();
        setVenues(venueData.venues || []);
      }

      const gigRes = await authFetch('/api/artists/gigs');
      if (gigRes.ok) {
        const gigData = await gigRes.json();
        setGigs(gigData.gigs || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReviewQueue = async () => {
    try {
      const res = await authFetch('/api/clients/marketing/review-queue');
      const data = await res.json();
      if (res.ok) setReviewQueue(data.content || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMarketingData = async (clientId) => {
    try {
      const cRes = await authFetch(`/api/clients/${clientId}/marketing/content`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setMarketingContent(cData.content || []);
      }
      // Video editors only have access to content — skip ads, monthly, scripts
      if (!isVideoEditor) {
        const adRes = await authFetch(`/api/clients/${clientId}/marketing/ads`);
        if (adRes.ok) {
          const adData = await adRes.json();
          setAdCampaigns(adData.ads || []);
        }
        const rRes = await authFetch(`/api/clients/${clientId}/marketing/monthly`);
        if (rRes.ok) {
          const rData = await rRes.json();
          setMonthlyReports(rData.reports || []);
        }
        const sRes = await authFetch(`/api/clients/${clientId}/marketing/scripts`);
        if (sRes.ok) {
          const sData = await sRes.json();
          setMarketingScripts(sData.scripts || []);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCalendarMarketingContent = async () => {
    try {
      if (calendarClientFilter) {
        const res = await authFetch(`/api/clients/${calendarClientFilter}/marketing/content`);
        const data = await res.json();
        if (res.ok) {
          const client = clients.find(c => c.id === parseInt(calendarClientFilter));
          const normalized = (data.content || []).map(item => ({
            ...item,
            clientName: client ? client.name : 'Client'
          }));
          setCalendarMarketingContent(normalized);
        }
      } else {
        const promises = clients.filter(c => c.client_type !== 'artist_curation').map(async (c) => {
          try {
            const res = await authFetch(`/api/clients/${c.id}/marketing/content`);
            if (res.ok) {
              const data = await res.json();
              return (data.content || []).map(item => ({
                ...item,
                clientName: c.name
              }));
            }
          } catch (e) {
            console.error(`Error fetching calendar content for client ${c.id}:`, e);
          }
          return [];
        });
        const results = await Promise.all(promises);
        setCalendarMarketingContent(results.flat());
      }
    } catch (err) {
      console.error('Error fetching calendar marketing content:', err);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      localStorage.removeItem('user');
      setAuth(null);
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  // --- TASK CRUD ---
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
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

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

  const handleKanbanCardClick = async (task) => {
    if (task.content_id) {
      if (isAdmin || isSMM) {
        try {
          const res = await authFetch(`/api/clients/${task.client_id}/marketing/content/${task.content_id}`);
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to fetch content details');
          }
          const contentData = await res.json();
          openContentModal(contentData);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    } else {
      if (isAdmin) {
        openTaskModal(task);
      }
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

      const task = tasks.find(t => t.id === taskId);
      const clientId = task ? task.client_id : null;

      fetchTasks();
      fetchCalendarMarketingContent();
      if (clientId) {
        fetchMarketingData(clientId);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateContentStatus = async (itemId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/marketing/content/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      showToast('Status updated successfully', 'success');
      fetchMarketingData(selectedClientForReports.id);
      fetchCalendarMarketingContent();
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- SOCIAL REVIEW QUEUE ---
  const handleReviewDecision = async (contentId, track) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/marketing/review/${contentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_tracked: track ? 1 : 0 }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to submit decision');
      showToast(track ? 'Item added to performance tracker' : 'Item discarded', 'success');
      fetchReviewQueue();
      if (selectedClientForReports) fetchMarketingData(selectedClientForReports.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- CONTENT TRACKER MANUAL CRUD ---
  const openContentModal = (content = null, defaultDate = null) => {
    if (content) {
      setEditingContent(content);
      const client = clients.find(c => c.id === content.client_id);
      if (client) {
        setSelectedClientForReports(client);
        fetchMarketingData(client.id);
      }
      setContentFormData({
        platform: content.platform || 'instagram',
        date: content.date || '',
        post_type: content.post_type || 'Reel',
        title: content.title || '',
        script: content.script || '',
        script_id: content.script_id || '',
        status: content.status || 'Draft',
        link: content.link || '',
        time: content.time || '',
        caption: content.caption || '',
        views: content.views !== null && content.views !== undefined ? String(content.views) : '',
        likes: content.likes !== null && content.likes !== undefined ? String(content.likes) : '',
        comments: content.comments !== null && content.comments !== undefined ? String(content.comments) : '',
        shares: content.shares !== null && content.shares !== undefined ? String(content.shares) : '',
        saves: content.saves !== null && content.saves !== undefined ? String(content.saves) : '',
        follows: content.follows !== null && content.follows !== undefined ? String(content.follows) : '',
        avg_watch_time_pct: content.avg_watch_time_pct !== null && content.avg_watch_time_pct !== undefined ? String(content.avg_watch_time_pct) : '',
        boosted: content.boosted || 'No',
        youtube_views: content.youtube_views !== null && content.youtube_views !== undefined ? String(content.youtube_views) : '',
        youtube_watch_time: content.youtube_watch_time !== null && content.youtube_watch_time !== undefined ? String(content.youtube_watch_time) : '',
        youtube_avg_view_duration: content.youtube_avg_view_duration || '',
        youtube_ctr: content.youtube_ctr !== null && content.youtube_ctr !== undefined ? String(content.youtube_ctr) : '',
        facebook_post_id: content.facebook_post_id || '',
        instagram_media_id: content.instagram_media_id || '',
        youtube_video_id: content.youtube_video_id || '',
        assigned_to: content.assigned_to !== null && content.assigned_to !== undefined ? String(content.assigned_to) : ''
      });
    } else {
      setEditingContent(null);
      if (calendarClientFilter) {
        const client = clients.find(c => c.id === parseInt(calendarClientFilter));
        if (client) {
          setSelectedClientForReports(client);
          fetchMarketingData(client.id);
        }
      }
      const videoEditor = staffUsers.find(u => u.role === 'ops_video_editor');
      setContentFormData({
        platform: 'instagram',
        date: defaultDate || new Date().toISOString().split('T')[0],
        post_type: 'Reel',
        title: '',
        script: '',
        script_id: '',
        status: 'Draft',
        link: '',
        time: '',
        caption: '',
        views: '',
        likes: '',
        comments: '',
        shares: '',
        saves: '',
        follows: '',
        avg_watch_time_pct: '',
        boosted: 'No',
        youtube_views: '',
        youtube_watch_time: '',
        youtube_avg_view_duration: '',
        youtube_ctr: '',
        facebook_post_id: '',
        instagram_media_id: '',
        youtube_video_id: '',
        assigned_to: videoEditor ? String(videoEditor.id) : ''
      });
    }
    setShowContentModal(true);
  };

  const handleContentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports) return;

    const url = editingContent 
      ? `/api/clients/${selectedClientForReports.id}/marketing/content/${editingContent.id}`
      : `/api/clients/${selectedClientForReports.id}/marketing/content`;
    const method = editingContent ? 'PATCH' : 'POST';

    const bodyData = {
      platform: contentFormData.platform,
      date: contentFormData.date || null,
      post_type: contentFormData.post_type || null,
      title: contentFormData.title || null,
      script: contentFormData.script || null,
      script_id: contentFormData.script_id || null,
      status: contentFormData.status || 'Draft',
      link: contentFormData.link || null,
      time: contentFormData.time || null,
      caption: contentFormData.caption || null,
      views: contentFormData.views !== '' ? parseInt(contentFormData.views) : null,
      likes: contentFormData.likes !== '' ? parseInt(contentFormData.likes) : null,
      comments: contentFormData.comments !== '' ? parseInt(contentFormData.comments) : null,
      shares: contentFormData.shares !== '' ? parseInt(contentFormData.shares) : null,
      saves: contentFormData.saves !== '' ? parseInt(contentFormData.saves) : null,
      follows: contentFormData.follows !== '' ? parseInt(contentFormData.follows) : null,
      avg_watch_time_pct: contentFormData.avg_watch_time_pct !== '' ? parseFloat(contentFormData.avg_watch_time_pct) : null,
      boosted: contentFormData.boosted || 'No',
      youtube_views: contentFormData.youtube_views !== '' ? parseInt(contentFormData.youtube_views) : null,
      youtube_watch_time: contentFormData.youtube_watch_time !== '' ? parseFloat(contentFormData.youtube_watch_time) : null,
      youtube_avg_view_duration: contentFormData.youtube_avg_view_duration || null,
      youtube_ctr: contentFormData.youtube_ctr !== '' ? parseFloat(contentFormData.youtube_ctr) : null,
      facebook_post_id: contentFormData.facebook_post_id || null,
      instagram_media_id: contentFormData.instagram_media_id || null,
      youtube_video_id: contentFormData.youtube_video_id || null,
      assigned_to: contentFormData.assigned_to !== '' ? parseInt(contentFormData.assigned_to) : null
    };

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save content row');

      showToast(`Content row ${editingContent ? 'updated' : 'added'} successfully`, 'success');
      setShowContentModal(false);
      fetchMarketingData(selectedClientForReports.id);
      fetchCalendarMarketingContent();
      fetchTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Sort clients by recency of chat messages, then alphabetically
  const sortedClients = React.useMemo(() => {
    const list = [...clients];
    list.sort((a, b) => {
      const idxA = clientRecencyOrder.indexOf(a.id);
      const idxB = clientRecencyOrder.indexOf(b.id);
      const hasA = idxA !== -1;
      const hasB = idxB !== -1;
      
      if (hasA && hasB) return idxA - idxB;
      if (hasA) return -1;
      if (hasB) return 1;
      
      const nameA = (a.parent_name ? `${a.parent_name} - ${a.name}` : a.name).toLowerCase();
      const nameB = (b.parent_name ? `${b.parent_name} - ${b.name}` : b.name).toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return list;
  }, [clients, clientRecencyOrder]);

  // Filtering lists
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(taskSearch.toLowerCase()) || 
      (t.client_name && t.client_name.toLowerCase().includes(taskSearch.toLowerCase()));
    const matchesClient = !taskClientFilter || t.client_id === parseInt(taskClientFilter);
    return matchesSearch && matchesClient;
  });

  // Render Kanban Columns helper
  const columns = ['backlog', 'todo', 'in_progress', 'delivered'];
  const getTasksByStatus = (status) => {
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

  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      

      {/* Top Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <span
            onClick={() => navigate('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', height: '40px', cursor: 'pointer' }}
          >
            <img src={logoImg} alt="Hyphening Media" style={{ height: '80px', width: 'auto' }} />
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sseConnected ? 'var(--success)' : 'var(--danger)' }} />
            {sseConnected ? 'SSE Connected' : 'SSE Disconnected'}
          </div>
        </div>

        <div className="dashboard-header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Notification Alarm Status/Toggle Button */}
          <button 
            onClick={notificationPermission === 'default' ? handleRequestPermission : toggleSound}
            className={`btn ${soundEnabled && notificationPermission === 'granted' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ 
              padding: '8px 12px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer',
              border: 'var(--border-width) solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)',
              fontSize: '0.85rem'
            }}
            title={
              notificationPermission === 'default' 
                ? 'Enable Browser Notifications' 
                : (soundEnabled ? 'Mute Chat Sound' : 'Unmute Chat Sound')
            }
          >
            {notificationPermission === 'default' ? (
              <>
                <Bell size={16} />
                <span>Enable Alerts</span>
              </>
            ) : soundEnabled ? (
              <>
                <Bell size={16} style={{ color: 'var(--success)' }} />
                <span>Alerts On</span>
              </>
            ) : (
              <>
                <BellOff size={16} style={{ color: 'var(--text-muted)' }} />
                <span>Alerts Muted</span>
              </>
            )}
          </button>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{auth?.name}</div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 'bold' }}>
              {userRole.replace('ops_', '').replace('_', ' ')}
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="dashboard-tabs">
        <button onClick={() => setActiveTab('tasks')} className={`btn ${activeTab === 'tasks' ? 'btn-primary' : 'btn-secondary'}`}>
          <Layers size={16} /> Kanban Tasks
        </button>
        <button onClick={() => setActiveTab('client-workspaces')} className={`btn ${activeTab === 'client-workspaces' ? 'btn-primary' : 'btn-secondary'}`}>
          <MessageSquare size={16} /> Client Workspace
        </button>
        <button onClick={() => setActiveTab('calendar')} className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}>
          <Calendar size={16} /> Calendar
        </button>

        {/* Admin only tabs */}
        {isAdmin && (
          <>
            <button onClick={() => setActiveTab('clients')} className={`btn ${activeTab === 'clients' ? 'btn-primary' : 'btn-secondary'}`}>
              <Folder size={16} /> Clients
            </button>
            <button onClick={() => setActiveTab('freelancers')} className={`btn ${activeTab === 'freelancers' ? 'btn-primary' : 'btn-secondary'}`}>
              <Users size={16} /> Freelancers
            </button>
            <button onClick={() => setActiveTab('curation')} className={`btn ${activeTab === 'curation' ? 'btn-primary' : 'btn-secondary'}`}>
              <Calendar size={16} /> Artist Curation
            </button>
          </>
        )}

        {/* Social / Admin tabs */}
        {(isAdmin || isSMM) && (
          <>
            <button onClick={() => {
              setActiveTab('scripts');
              if (selectedScriptClient) fetchMarketingData(selectedScriptClient.id);
            }} className={`btn ${activeTab === 'scripts' ? 'btn-primary' : 'btn-secondary'}`}>
              <FileText size={16} /> Script Tracker
            </button>
            <button onClick={() => setActiveTab('reports')} className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}>
              <FileSpreadsheet size={16} /> Marketing Data
            </button>
          </>
        )}

        {/* Super admin only tabs */}
        {isAdmin && (
          <button onClick={() => setActiveTab('audit')} className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}>
            <Shield size={16} /> Audit Logs
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('blog')} className={`btn ${activeTab === 'blog' ? 'btn-primary' : 'btn-secondary'}`}>
            <FileText size={16} /> Blog
          </button>
        )}
      </div>

      {/* Main Workspace Container */}
      <main className="container" style={{ flexGrow: 1, paddingBottom: '40px' }}>
        {/* CLIENT WORKSPACES TAB */}
        {activeTab === 'client-workspaces' && (
          <ChatTab
            auth={auth}
            clients={sortedClients}
            selectedChatClient={selectedChatClient}
            setSelectedChatClient={setSelectedChatClient}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            fetchChats={fetchChats}
            tasks={tasks}
            fetchTasks={fetchTasks}
            showToast={showToast}
            formatDateStr={formatDateStr}
            staffUsers={staffUsers}
            unseenCounts={unseenCounts}
          />
        )}

        {(activeTab === 'tasks' || activeTab === 'calendar') && (
          <TasksTab
            auth={auth}
            activeTab={activeTab}
            clients={clients}
            staffUsers={staffUsers}
            tasks={tasks}
            fetchTasks={fetchTasks}
            showToast={showToast}
            openContentModal={openContentModal}
            calendarMarketingContent={calendarMarketingContent}
            gigs={gigs}
            calendarClientFilter={calendarClientFilter}
            setCalendarClientFilter={setCalendarClientFilter}
            formatDateStr={formatDateStr}
            fetchCalendarMarketingContent={fetchCalendarMarketingContent}
          />
        )}

        {/* CLIENTS TAB (Admin Only) */}
        {activeTab === 'clients' && isAdmin && (
          <ClientsTab
            auth={auth}
            clients={clients}
            fetchClients={fetchClients}
            showToast={showToast}
          />
        )}

        {activeTab === 'freelancers' && (
          <FreelancersTab
            auth={auth}
            freelancers={freelancers}
            fetchFreelancers={fetchFreelancers}
            showToast={showToast}
          />
        )}

        {activeTab === 'scripts' && (
          <ScriptTrackerTab
            auth={auth}
            clients={clients}
            marketingScripts={marketingScripts}
            fetchMarketingData={fetchMarketingData}
            showToast={showToast}
            selectedScriptClient={selectedScriptClient}
            setSelectedScriptClient={setSelectedScriptClient}
            scriptMonth={scriptMonth}
            setScriptMonth={setScriptMonth}
          />
        )}

        {activeTab === 'reports' && (
          <MarketingDataTab
            auth={auth}
            clients={clients}
            marketingContent={marketingContent}
            adCampaigns={adCampaigns}
            monthlyReports={monthlyReports}
            fetchMarketingData={fetchMarketingData}
            fetchCalendarMarketingContent={fetchCalendarMarketingContent}
            fetchTasks={fetchTasks}
            showToast={showToast}
            selectedClientForReports={selectedClientForReports}
            setSelectedClientForReports={setSelectedClientForReports}
            formatDateStr={formatDateStr}
            marketingScripts={marketingScripts}
            staffUsers={staffUsers}
          />
        )}

        {activeTab === 'curation' && (
          <ArtistCurationTab
            auth={auth}
            gigs={gigs}
            artists={artists}
            venues={venues}
            fetchCurationData={fetchCurationData}
            showToast={showToast}
            formatDateStr={formatDateStr}
            clients={clients}
          />
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'audit' && (
          <AuditLogsTab
            auth={auth}
            auditLogs={auditLogs}
            totalAuditLogs={totalAuditLogs}
            auditPage={auditPage}
            setAuditPage={setAuditPage}
            auditLimit={auditLimit}
            setAuditLimit={setAuditLimit}
            formatDateStr={formatDateStr}
          />
        )}

        {/* BLOG TAB */}
        {activeTab === 'blog' && (
          <BlogTab showToast={showToast} />
        )}


      </main>

      {showContentModal && (
        <ContentModal
          showContentModal={showContentModal}
          setShowContentModal={setShowContentModal}
          editingContent={editingContent}
          contentFormData={contentFormData}
          setContentFormData={setContentFormData}
          handleContentSubmit={handleContentSubmit}
          clients={clients}
          staffUsers={staffUsers}
          marketingScripts={marketingScripts}
        />
      )}


    </div>
  );
}
