import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api.js';
import logoImg from '../assets/logo.png';
import { 
  Users, Folder, Calendar, DollarSign, Clock, CheckSquare, 
  Layers, Shield, LogOut, RefreshCw, FileSpreadsheet, Plus, 
  Search, Share2, FileDown, Eye, HelpCircle, Check, X, ShieldAlert,
  AlertTriangle, Play, MessageSquare, FileText
} from 'lucide-react';

import TasksTab from '../components/dashboard/TasksTab.jsx';
import FreelancersTab from '../components/dashboard/FreelancersTab.jsx';
import ArtistCurationTab from '../components/dashboard/ArtistCurationTab.jsx';
import ScriptTrackerTab from '../components/dashboard/ScriptTrackerTab.jsx';
import MarketingDataTab from '../components/dashboard/MarketingDataTab.jsx';
import AuditLogsTab from '../components/dashboard/AuditLogsTab.jsx';
import ChatTab from '../components/dashboard/ChatTab.jsx';
import ContentModal from '../components/dashboard/ContentModal.jsx';

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
  const [planningCycles, setPlanningCycles] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistsPage, setArtistsPage] = useState(1);
  const [artistsLimit, setArtistsLimit] = useState(10);
  const [venues, setVenues] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [gigsPage, setGigsPage] = useState(1);
  const [gigsLimit, setGigsLimit] = useState(10);
  const [artistSearch, setArtistSearch] = useState('');
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
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
  const [newChatMessage, setNewChatMessage] = useState('');

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

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientFormData, setClientFormData] = useState({
    name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
    calendar_sync_link: '', drive_folder_link: '', instagram_business_account_id: '',
    instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: '',
    parent_id: ''
  });

  const [showFreelancerModal, setShowFreelancerModal] = useState(false);
  const [editingFreelancer, setEditingFreelancer] = useState(null);
  const [freelancerFormData, setFreelancerFormData] = useState({
    name: '', email: '', phone: '', company_name: '', specialization: '', rate_per_video: ''
  });

  const [showVenueModal, setShowVenueModal] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [venueFormData, setVenueFormData] = useState({
    name: '', address: '', city: '', map_link: '', poc_name: '', poc_phone: '', poc_email: '', social_links: '', gig_confirmed_message: '', client_id: ''
  });

  const [showArtistModal, setShowArtistModal] = useState(false);
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistFormData, setArtistFormData] = useState({
    name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: '',
    instruments: '', insta_link: '', description: '', rating: '', notes: ''
  });

  const [editingGig, setEditingGig] = useState(null);

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

  const [monthlyFormData, setMonthlyFormData] = useState({
    month: '',
    website_clicks: '',
    website_traffic: '',
    gmb_views: '',
    map_views: '',
    gmb_clicks: '',
    on_page_score: '',
    off_page: '',
    blogs: '',
    calls: '',
    directions: '',
    reviews: '',
    avg_rating: '',
    top_keywords: '',
    da: '',
    ai_overview_visible: 'No'
  });

  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState(null);

  // Script Tracker states
  const [selectedScriptClient, setSelectedScriptClient] = useState(null);
  const [scriptMonth, setScriptMonth] = useState(new Date().toISOString().substring(0, 7));
  const [scriptDrafts, setScriptDrafts] = useState({});
  const [scriptStatusDrafts, setScriptStatusDrafts] = useState({});
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [reelsExpanded, setReelsExpanded] = useState(true);
  const [longFormatExpanded, setLongFormatExpanded] = useState(true);
  const [scriptFormData, setScriptFormData] = useState({
    title: '', script_text: '', month: new Date().toISOString().substring(0, 7), reference_video_link: '', reaction_video_link: '', format: 'reel'
  });

  const [showGigModal, setShowGigModal] = useState(false);
  const [gigFormData, setGigFormData] = useState({
    client_id: '', artist_id: '', venue_id: '', planning_cycle_id: '', gig_date: '', fee_inr: 0, advance_paid: 0, status: 'Pending'
  });

  // Decrypted bank details caching
  const [decryptedBank, setDecryptedBank] = useState({});

  // Refs to avoid closing EventSource connection when selected client / client list changes
  const selectedClientForReportsRef = useRef(selectedClientForReports);
  selectedClientForReportsRef.current = selectedClientForReports;

  const selectedChatClientRef = useRef(selectedChatClient);
  selectedChatClientRef.current = selectedChatClient;

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

  // Reset job assignments page when selected client changes
  useEffect(() => {
    setAssignmentsPage(1);
  }, [selectedChatClient]);

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
      if (selectedChatClientRef.current && selectedChatClientRef.current.id === data.client_id) {
        setChatMessages(prev => [...prev, data.message]);
      } else {
        const client = (clientsRef.current || []).find(c => c.id === data.client_id);
        const clientName = client ? client.name : 'Client';
        showToast(`New message in ${clientName} chat: "${data.message.message.substring(0, 30)}..."`, 'info');
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

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedChatClient) return;

    try {
      const res = await authFetch(`/api/clients/${selectedChatClient.id}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newChatMessage })
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
      const cycleRes = await authFetch('/api/artists/planning-cycles');
      if (cycleRes.ok) {
        const cycleData = await cycleRes.json();
        setPlanningCycles(cycleData.planning_cycles || []);
      }
      
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

  // --- CLIENT CRUD ---
  const handleClientSubmit = async (e) => {
    e.preventDefault();
    const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
    const method = editingClient ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientFormData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Client ${editingClient ? 'updated' : 'created'} successfully`, 'success');
      setShowClientModal(false);
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openClientModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setClientFormData({
        name: client.name,
        client_type: client.client_type,
        contact_person: client.contact_person || '',
        contact_email: client.contact_email || '',
        contact_phone: client.contact_phone || '',
        calendar_sync_link: client.calendar_sync_link || '',
        drive_folder_link: client.drive_folder_link || '',
        instagram_business_account_id: client.instagram_business_account_id || '',
        instagram_access_token: '', // Leave blank unless editing
        youtube_channel_id: client.youtube_channel_id || '',
        youtube_api_key: '', // Leave blank unless editing
        google_ads_customer_id: client.google_ads_customer_id || '',
        parent_id: client.parent_id || ''
      });
    } else {
      setEditingClient(null);
      setClientFormData({
        name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
        calendar_sync_link: '', drive_folder_link: '', instagram_business_account_id: '',
        instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: '',
        parent_id: ''
      });
    }
    setShowClientModal(true);
  };

  const togglePortal = async (client, enable) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_enabled: enable ? 1 : 0 }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to update portal state');
      showToast(`Portal ${enable ? 'enabled' : 'disabled'}`, 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const generatePortalToken = async (client) => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal/token`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('New secure token generated', 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const setPortalPin = async (client) => {
    const pin = prompt('Enter a new 4-digit PIN for the client (leave empty to disable PIN protection):');
    if (pin === null) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/portal/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || null }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to set PIN');
      showToast(pin ? 'PIN updated successfully' : 'PIN protection removed', 'success');
      fetchClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- ARTIST MIGRATION & BANK DECRYPTION ---
  const decryptBankDetails = async (artistId) => {
    try {
      const res = await fetch(`${API_BASE}/api/artists/${artistId}/bank`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDecryptedBank(prev => ({ ...prev, [artistId]: data.bank_details }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- FREELANCER CRUD ---
  const handleFreelancerSubmit = async (e) => {
    e.preventDefault();
    const url = editingFreelancer ? `/api/freelancers/${editingFreelancer.id}` : '/api/freelancers';
    const method = editingFreelancer ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...freelancerFormData,
          rate_per_video: freelancerFormData.rate_per_video ? parseFloat(freelancerFormData.rate_per_video) : null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit freelancer data');

      showToast(`Freelancer ${editingFreelancer ? 'updated' : 'added'} successfully`, 'success');
      setShowFreelancerModal(false);
      fetchFreelancers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openFreelancerModal = (freelancer = null) => {
    if (freelancer) {
      setEditingFreelancer(freelancer);
      setFreelancerFormData({
        name: freelancer.name,
        email: freelancer.email || '',
        phone: freelancer.phone || '',
        company_name: freelancer.company_name || '',
        specialization: freelancer.specialization || '',
        rate_per_video: freelancer.rate_per_video !== null && freelancer.rate_per_video !== undefined ? String(freelancer.rate_per_video) : ''
      });
    } else {
      setEditingFreelancer(null);
      setFreelancerFormData({
        name: '', email: '', phone: '', company_name: '', specialization: '', rate_per_video: ''
      });
    }
    setShowFreelancerModal(true);
  };

  const toggleFreelancerStatus = async (freelancer) => {
    const newStatus = freelancer.is_active === 1 ? 0 : 1;
    const actionStr = newStatus === 1 ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${actionStr} this freelancer?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/freelancers/${freelancer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      showToast(`Freelancer ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`, 'success');
      fetchFreelancers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- VENUE CRUD ---
  const handleVenueSubmit = async (e) => {
    e.preventDefault();
    const url = editingVenue ? `/api/artists/venues/${editingVenue.id}` : '/api/artists/venues';
    const method = editingVenue ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...venueFormData,
          client_id: venueFormData.client_id ? parseInt(venueFormData.client_id) : null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit venue data');

      showToast(`Venue ${editingVenue ? 'updated' : 'added'} successfully`, 'success');
      setShowVenueModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openVenueModal = (venue = null) => {
    if (venue) {
      setEditingVenue(venue);
      setVenueFormData({
        name: venue.name,
        address: venue.address || '',
        city: venue.city || '',
        map_link: venue.map_link || '',
        poc_name: venue.poc_name || '',
        poc_phone: venue.poc_phone || '',
        poc_email: venue.poc_email || '',
        social_links: venue.social_links || '',
        gig_confirmed_message: venue.gig_confirmed_message || '',
        client_id: venue.client_id || ''
      });
    } else {
      setEditingVenue(null);
      setVenueFormData({
        name: '', address: '', city: '', map_link: '', poc_name: '', poc_phone: '', poc_email: '', social_links: '', gig_confirmed_message: '', client_id: ''
      });
    }
    setShowVenueModal(true);
  };

  const handleArtistSubmit = async (e) => {
    e.preventDefault();
    const url = editingArtist ? `/api/artists/${editingArtist.id}` : '/api/artists';
    const method = editingArtist ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...artistFormData,
          rating: artistFormData.rating ? parseInt(artistFormData.rating) : null
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Artist ${editingArtist ? 'updated' : 'added'} successfully`, 'success');
      setShowArtistModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openArtistModal = (artist = null) => {
    if (artist) {
      setEditingArtist(artist);
      setArtistFormData({
        name: artist.name,
        category: artist.category || '',
        city: artist.city || '',
        phone: artist.phone || '',
        email: artist.email || '',
        telegram_chat_id: artist.telegram_chat_id || '',
        bank_details: '', // Leave blank unless updating
        instruments: artist.instruments || '',
        insta_link: artist.insta_link || '',
        description: artist.description || '',
        rating: artist.rating !== null && artist.rating !== undefined ? String(artist.rating) : '',
        notes: artist.notes || ''
      });
    } else {
      setEditingArtist(null);
      setArtistFormData({
        name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: '',
        instruments: '', insta_link: '', description: '', rating: '', notes: ''
      });
    }
    setShowArtistModal(true);
  };

  const openGigModal = (gig = null) => {
    if (gig) {
      setEditingGig(gig);
      setGigFormData({
        artist_id: gig.artist_id || '',
        venue_id: gig.venue_id || '',
        planning_cycle_id: gig.planning_cycle_id || '',
        gig_date: gig.gig_date || '',
        fee_inr: gig.fee_inr !== null && gig.fee_inr !== undefined ? String(gig.fee_inr) : '0',
        advance_paid: gig.advance_paid !== null && gig.advance_paid !== undefined ? String(gig.advance_paid) : '0',
        status: gig.status || 'Pending'
      });
      const artist = artists.find(a => a.id === gig.artist_id);
      setArtistSearch(artist ? `${artist.name} (${artist.category || 'No Category'})` : '');
      const venue = venues.find(v => v.id === gig.venue_id);
      setVenueSearch(venue ? venue.name : '');
    } else {
      setEditingGig(null);
      const defaultArtist = artists.length > 0 ? artists[0] : null;
      const defaultVenue = venues.length > 0 ? venues[0] : null;
      setGigFormData({
        artist_id: defaultArtist ? String(defaultArtist.id) : '',
        venue_id: defaultVenue ? String(defaultVenue.id) : '',
        planning_cycle_id: planningCycles.length > 0 ? String(planningCycles[0].id) : '',
        gig_date: new Date().toISOString().split('T')[0],
        fee_inr: '0',
        advance_paid: '0',
        status: 'Pending'
      });
      setArtistSearch(defaultArtist ? `${defaultArtist.name} (${defaultArtist.category || 'No Category'})` : '');
      setVenueSearch(defaultVenue ? defaultVenue.name : '');
    }
    setShowGigModal(true);
  };

  const handleGigSubmit = async (e) => {
    e.preventDefault();
    const url = editingGig ? `/api/artists/gigs/${editingGig.id}` : '/api/artists/gigs';
    const method = editingGig ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: parseInt(gigFormData.artist_id),
          venue_id: gigFormData.venue_id ? parseInt(gigFormData.venue_id) : null,
          planning_cycle_id: gigFormData.planning_cycle_id ? parseInt(gigFormData.planning_cycle_id) : null,
          gig_date: gigFormData.gig_date,
          fee_inr: gigFormData.fee_inr ? parseFloat(gigFormData.fee_inr) : 0,
          advance_paid: gigFormData.advance_paid ? parseFloat(gigFormData.advance_paid) : 0,
          status: gigFormData.status
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit gig data');

      showToast(`Gig ${editingGig ? 'updated' : 'added'} successfully`, 'success');
      setShowGigModal(false);
      fetchCurationData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const finalizePlanningCycle = async (cycleId) => {
    if (!window.confirm('Finalize this cycle? This will lock curation assignments and notify the admin telegram bot.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/artists/planning-cycles/${cycleId}/finalize`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Cycle finalized and sent for approval', 'success');
      fetchCurationData();
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

  const openMonthlyModal = (report = null) => {
    if (report) {
      setEditingMonthly(report);
      setMonthlyFormData({
        month: report.month || '',
        website_clicks: report.website_clicks !== null && report.website_clicks !== undefined ? String(report.website_clicks) : '',
        website_traffic: report.website_traffic !== null && report.website_traffic !== undefined ? String(report.website_traffic) : '',
        gmb_views: report.gmb_views !== null && report.gmb_views !== undefined ? String(report.gmb_views) : '',
        map_views: report.map_views !== null && report.map_views !== undefined ? String(report.map_views) : '',
        gmb_clicks: report.gmb_clicks !== null && report.gmb_clicks !== undefined ? String(report.gmb_clicks) : '',
        on_page_score: report.on_page_score !== null && report.on_page_score !== undefined ? String(report.on_page_score) : '',
        off_page: report.off_page !== null && report.off_page !== undefined ? String(report.off_page) : '',
        blogs: report.blogs !== null && report.blogs !== undefined ? String(report.blogs) : '',
        calls: report.calls !== null && report.calls !== undefined ? String(report.calls) : '',
        directions: report.directions !== null && report.directions !== undefined ? String(report.directions) : '',
        reviews: report.reviews !== null && report.reviews !== undefined ? String(report.reviews) : '',
        avg_rating: report.avg_rating !== null && report.avg_rating !== undefined ? String(report.avg_rating) : '',
        top_keywords: report.top_keywords || '',
        da: report.da !== null && report.da !== undefined ? String(report.da) : '',
        ai_overview_visible: report.ai_overview_visible || 'No'
      });
    } else {
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '',
        website_clicks: '',
        website_traffic: '',
        gmb_views: '',
        map_views: '',
        gmb_clicks: '',
        on_page_score: '',
        off_page: '',
        blogs: '',
        calls: '',
        directions: '',
        reviews: '',
        avg_rating: '',
        top_keywords: '',
        da: '',
        ai_overview_visible: 'No'
      });
    }
    setShowMonthlyModal(true);
  };

  const handleMonthlyReportSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForReports) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientForReports.id}/marketing/monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthlyFormData.month,
          website_clicks: monthlyFormData.website_clicks || null,
          website_traffic: monthlyFormData.website_traffic !== '' ? parseInt(monthlyFormData.website_traffic) : null,
          gmb_views: monthlyFormData.gmb_views !== '' ? parseInt(monthlyFormData.gmb_views) : null,
          map_views: monthlyFormData.map_views !== '' ? parseInt(monthlyFormData.map_views) : null,
          gmb_clicks: monthlyFormData.gmb_clicks !== '' ? parseInt(monthlyFormData.gmb_clicks) : null,
          on_page_score: monthlyFormData.on_page_score || null,
          off_page: monthlyFormData.off_page !== '' ? parseInt(monthlyFormData.off_page) : null,
          blogs: monthlyFormData.blogs !== '' ? parseInt(monthlyFormData.blogs) : null,
          calls: monthlyFormData.calls !== '' ? parseInt(monthlyFormData.calls) : null,
          directions: monthlyFormData.directions !== '' ? parseInt(monthlyFormData.directions) : null,
          reviews: monthlyFormData.reviews !== '' ? parseInt(monthlyFormData.reviews) : null,
          avg_rating: monthlyFormData.avg_rating !== '' ? parseFloat(monthlyFormData.avg_rating) : null,
          top_keywords: monthlyFormData.top_keywords || null,
          da: monthlyFormData.da !== '' ? parseInt(monthlyFormData.da) : null,
          ai_overview_visible: monthlyFormData.ai_overview_visible || 'No'
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save monthly report');

      showToast(`Monthly report ${editingMonthly ? 'updated' : 'saved'} successfully`, 'success');
      setShowMonthlyModal(false);
      setEditingMonthly(null);
      setMonthlyFormData({
        month: '',
        website_clicks: '',
        website_traffic: '',
        gmb_views: '',
        map_views: '',
        gmb_clicks: '',
        on_page_score: '',
        off_page: '',
        blogs: '',
        calls: '',
        directions: '',
        reviews: '',
        avg_rating: '',
        top_keywords: '',
        da: '',
        ai_overview_visible: 'No'
      });
      fetchMarketingData(selectedClientForReports.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateScript = async (scriptId, updatedFields) => {
    if (!selectedScriptClient) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update script');

      showToast('Script updated successfully', 'success');
      fetchMarketingData(selectedScriptClient.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveScript = async (e) => {
    e.preventDefault();
    if (!selectedScriptClient) return;

    const url = editingScript 
      ? `/api/clients/${selectedScriptClient.id}/marketing/scripts/${editingScript.id}` 
      : `/api/clients/${selectedScriptClient.id}/marketing/scripts`;
    const method = editingScript ? 'PATCH' : 'POST';

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptFormData),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save script');

      showToast(editingScript ? 'Script updated successfully' : 'Script created successfully', 'success');
      setShowScriptModal(false);
      setEditingScript(null);
      setScriptFormData({ title: '', script_text: '', month: scriptMonth, reference_video_link: '', reaction_video_link: '', format: 'reel' });
      fetchMarketingData(selectedScriptClient.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteScript = async (scriptId) => {
    if (!selectedScriptClient) return;
    if (!window.confirm('Are you sure you want to delete this script?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete script');

      showToast('Script deleted successfully', 'success');
      fetchMarketingData(selectedScriptClient.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // CSV Export helper
  const handleCSVExport = (type) => {
    if (!selectedClientForReports) return;
    window.open(`/api/clients/${selectedClientForReports.id}/export/${type}`, '_blank');
  };

  // Filtering lists
  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
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

  const getMonthName = (m) => {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][m];
  };

  const getCalendarCells = () => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    const cells = [];
    
    // Previous month cells
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: false,
        events: []
      });
    }
    
    // Current month cells
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dateEvents = [];
      
      // Tasks
      tasks.forEach(t => {
        if (t.due_date === dateStr) {
          if (!calendarClientFilter || t.client_id === parseInt(calendarClientFilter)) {
            // Synced tasks are already represented by 'content' events, so we exclude them to prevent duplication
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
      
      // Gigs
      gigs.forEach(g => {
        if (g.gig_date === dateStr) {
          if (!calendarClientFilter || g.client_id === parseInt(calendarClientFilter)) {
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
      
      // Marketing Content
      calendarMarketingContent.forEach(item => {
        if (item.date === dateStr) {
          if (!calendarClientFilter || item.client_id === parseInt(calendarClientFilter)) {
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
        if (!calendarClientFilter || t.client_id === parseInt(calendarClientFilter)) {
          // Synced tasks are already represented by 'content' events, so we exclude them to prevent duplication
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
        if (!calendarClientFilter || g.client_id === parseInt(calendarClientFilter)) {
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
        if (!calendarClientFilter || item.client_id === parseInt(calendarClientFilter)) {
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

        <div className="dashboard-header-right">
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
      </div>

      {/* Main Workspace Container */}
      <main className="container" style={{ flexGrow: 1, paddingBottom: '40px' }}>
        {/* CLIENT WORKSPACES TAB */}
        {activeTab === 'client-workspaces' && (
          <ChatTab
            auth={auth}
            clients={clients}
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
          <div style={{ textAlign: 'left' }}>
            <div className="dashboard-toolbar">
              <div className="dashboard-toolbar-search">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Filter clients..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <button onClick={() => openClientModal()} className="btn btn-primary">
                <Plus size={16} /> Add Client
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Contact Info</th>
                    <th>API Integration</th>
                    <th>Client Portal</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(client => (
                    <tr key={client.id}>
                      <td style={{ fontWeight: 'bold' }}>
                        {client.name}
                        {client.parent_name && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '2px' }}>
                            Company: <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{client.parent_name}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info">{client.client_type}</span>
                      </td>
                      <td>
                        <div>{client.contact_person}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.contact_email}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className={`badge ${client.instagram_business_account_id ? 'badge-success' : 'badge-muted'}`}>
                            Instagram
                          </span>
                          <span className={`badge ${client.youtube_channel_id ? 'badge-success' : 'badge-muted'}`}>
                            YouTube
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`badge badge-${client.portal_enabled ? 'success' : 'muted'}`}>
                              {client.portal_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <button
                              onClick={() => togglePortal(client, !client.portal_enabled)}
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                            >
                              {client.portal_enabled ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                          {client.portal_enabled && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {client.portal_token ? (
                                <button
                                  onClick={() => {
                                    const url = `${window.location.origin}/portal/${client.portal_token}`;
                                    navigator.clipboard.writeText(url);
                                    showToast('Portal link copied to clipboard!', 'success');
                                  }}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
                                >
                                  Copy Portal Link
                                </button>
                              ) : (
                                <button
                                  onClick={() => generatePortalToken(client)}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
                                >
                                  Generate Token
                                </button>
                              )}
                              <button
                                onClick={() => setPortalPin(client)}
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'fit-content' }}
                              >
                                {client.has_portal_pin ? 'Change PIN' : 'Set PIN'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => openClientModal(client)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
            planningCycles={planningCycles}
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

      </main>

      {/* --- MODALS --- */}
      


      {/* Client Modal */}
      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '700px' }}>
            <h2>{editingClient ? 'Edit Client' : 'Add Client'}</h2>
            <form onSubmit={handleClientSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Client Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientFormData.name}
                    onChange={e => setClientFormData({...clientFormData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Type</label>
                  <select
                    className="form-control"
                    value={clientFormData.client_type}
                    onChange={e => setClientFormData({...clientFormData, client_type: e.target.value})}
                  >
                    <option value="marketing">Marketing</option>
                    <option value="artist_curation">Artist Curation</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Parent Company / Group</label>
                <select
                  className="form-control"
                  value={clientFormData.parent_id || ''}
                  onChange={e => setClientFormData({...clientFormData, parent_id: e.target.value})}
                >
                  <option value="">None (Standalone Client)</option>
                  {clients
                    .filter(c => !editingClient || c.id !== editingClient.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.parent_name ? `${c.parent_name} - ${c.name}` : c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientFormData.contact_person}
                    onChange={e => setClientFormData({...clientFormData, contact_person: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={clientFormData.contact_email}
                    onChange={e => setClientFormData({...clientFormData, contact_email: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientFormData.contact_phone}
                    onChange={e => setClientFormData({...clientFormData, contact_phone: e.target.value})}
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Integrations & Links</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Calendar Sync Link</label>
                  <input
                    type="url"
                    className="form-control"
                    value={clientFormData.calendar_sync_link}
                    onChange={e => setClientFormData({...clientFormData, calendar_sync_link: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Drive Folder Link</label>
                  <input
                    type="url"
                    className="form-control"
                    value={clientFormData.drive_folder_link}
                    onChange={e => setClientFormData({...clientFormData, drive_folder_link: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Instagram Business ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientFormData.instagram_business_account_id}
                    onChange={e => setClientFormData({...clientFormData, instagram_business_account_id: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Instagram Token (encrypted)</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Enter new token to overwrite"
                    value={clientFormData.instagram_access_token}
                    onChange={e => setClientFormData({...clientFormData, instagram_access_token: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">YouTube Channel ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientFormData.youtube_channel_id}
                    onChange={e => setClientFormData({...clientFormData, youtube_channel_id: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube API Key (encrypted)</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Enter new API key to overwrite"
                    value={clientFormData.youtube_api_key}
                    onChange={e => setClientFormData({...clientFormData, youtube_api_key: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Google Ads Customer ID</label>
                <input
                  type="text"
                  className="form-control"
                  value={clientFormData.google_ads_customer_id}
                  onChange={e => setClientFormData({...clientFormData, google_ads_customer_id: e.target.value})}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowClientModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
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
