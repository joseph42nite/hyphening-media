import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import { 
  Users, Folder, Calendar, DollarSign, Clock, CheckSquare, 
  Layers, Shield, LogOut, RefreshCw, FileSpreadsheet, Plus, 
  Search, Share2, FileDown, Eye, HelpCircle, Check, X, ShieldAlert,
  AlertTriangle, Play, MessageSquare, FileText
} from 'lucide-react';

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
    instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: ''
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
    youtube_video_id: ''
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
    let res = await fetch(url, options);
    if (res.status === 401) {
      // Try to refresh the access token
      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
      if (refreshRes.ok) {
        // Retry the original request with the new cookie
        res = await fetch(url, options);
      } else {
        // Refresh failed — session is truly expired
        localStorage.removeItem('user');
        setAuth(null);
        navigate('/login');
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

    const es = new EventSource('/api/events');
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
        setClients(data.clients || []);
        if (data.clients?.length > 0) {
          // Video editors don't need marketing reports/scripts data
          if (!isVideoEditor) {
            if (!selectedClientForReports) {
              setSelectedClientForReports(data.clients[0]);
              fetchMarketingData(data.clients[0].id);
            }
            if (!selectedScriptClient) {
              setSelectedScriptClient(data.clients[0]);
            }
          }
          if (!selectedChatClient) {
            setSelectedChatClient(data.clients[0]);
            fetchChats(data.clients[0].id);
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
        const promises = clients.map(async (c) => {
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
      await fetch('/api/auth/logout', { method: 'POST' });
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskFormData)
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
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
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

  const updateContentStatus = async (itemId, newStatus) => {
    try {
      const res = await fetch(`/api/clients/${selectedClientForReports.id}/marketing/content/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientFormData)
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
        google_ads_customer_id: client.google_ads_customer_id || ''
      });
    } else {
      setEditingClient(null);
      setClientFormData({
        name: '', client_type: 'marketing', contact_person: '', contact_email: '', contact_phone: '',
        calendar_sync_link: '', drive_folder_link: '', instagram_business_account_id: '',
        instagram_access_token: '', youtube_channel_id: '', youtube_api_key: '', google_ads_customer_id: ''
      });
    }
    setShowClientModal(true);
  };

  const togglePortal = async (client, enable) => {
    try {
      const res = await fetch(`/api/clients/${client.id}/portal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_enabled: enable ? 1 : 0 })
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
      const res = await fetch(`/api/clients/${client.id}/portal/token`, { method: 'POST' });
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
      const res = await fetch(`/api/clients/${client.id}/portal/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || null })
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
      const res = await fetch(`/api/artists/${artistId}/bank`);
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...freelancerFormData,
          rate_per_video: freelancerFormData.rate_per_video ? parseFloat(freelancerFormData.rate_per_video) : null
        })
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
      const res = await fetch(`/api/freelancers/${freelancer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus })
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...venueFormData,
          client_id: venueFormData.client_id ? parseInt(venueFormData.client_id) : null
        })
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...artistFormData,
          rating: artistFormData.rating ? parseInt(artistFormData.rating) : null
        })
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
    } else {
      setEditingGig(null);
      setGigFormData({
        artist_id: artists.length > 0 ? String(artists[0].id) : '',
        venue_id: venues.length > 0 ? String(venues[0].id) : '',
        planning_cycle_id: planningCycles.length > 0 ? String(planningCycles[0].id) : '',
        gig_date: new Date().toISOString().split('T')[0],
        fee_inr: '0',
        advance_paid: '0',
        status: 'Pending'
      });
    }
    setShowGigModal(true);
  };

  const handleGigSubmit = async (e) => {
    e.preventDefault();
    const url = editingGig ? `/api/artists/gigs/${editingGig.id}` : '/api/artists/gigs';
    const method = editingGig ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
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
        })
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
      const res = await fetch(`/api/artists/planning-cycles/${cycleId}/finalize`, { method: 'POST' });
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
      const res = await fetch(`/api/clients/marketing/review/${contentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_tracked: track ? 1 : 0 })
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
        youtube_video_id: content.youtube_video_id || ''
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
        youtube_video_id: ''
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
      youtube_video_id: contentFormData.youtube_video_id || null
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
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
      const res = await fetch(`/api/clients/${selectedClientForReports.id}/marketing/monthly`, {
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
        })
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
      const res = await fetch(`/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptFormData)
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
      const res = await fetch(`/api/clients/${selectedScriptClient.id}/marketing/scripts/${scriptId}`, {
        method: 'DELETE'
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
      // BACKLOG: pending tasks that are overdue (due_date < localTodayStr)
      return filteredTasks.filter(t => 
        t.status !== 'delivered' && 
        t.status !== 'in_progress' && 
        t.due_date && 
        t.due_date < localTodayStr
      );
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
            // Synced tasks are already represented by 'content' events, so we exclude 'social' tasks to prevent duplication
            if (t.task_type !== 'social') {
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
          // Synced tasks are already represented by 'content' events, so we exclude 'social' tasks to prevent duplication
          if (t.task_type !== 'social') {
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
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {c.name}
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
                                        const res = await fetch(`/api/tasks/${task.id}`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ assigned_to: val })
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
                      <div 
                        style={{ 
                          marginTop: '16px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          flexWrap: 'wrap', 
                          gap: '16px',
                          borderTop: '2px solid #000',
                          paddingTop: '16px'
                        }}
                      >
                        {/* Left: Summary */}
                        <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                          Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((assignmentsPage - 1) * assignmentsLimit + 1, clientTasks.length)}</span> to{' '}
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(assignmentsPage * assignmentsLimit, clientTasks.length)}</span> of{' '}
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{clientTasks.length}</span> entries
                        </div>

                        {/* Right: Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          {/* Entries selector */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
                            <select
                              className="form-control"
                              value={assignmentsLimit}
                              onChange={(e) => {
                                setAssignmentsLimit(parseInt(e.target.value));
                                setAssignmentsPage(1); // reset to page 1 on limit change
                              }}
                              style={{ 
                                width: 'auto', 
                                padding: '8px 16px 8px 12px', 
                                height: 'auto', 
                                fontSize: '0.85rem',
                                borderWidth: '2px',
                                cursor: 'pointer'
                              }}
                            >
                              <option value={5}>5</option>
                              <option value={10}>10</option>
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                            </select>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
                          </div>

                          {/* Page numbers/buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              className="btn"
                              style={{ 
                                padding: '8px 14px', 
                                fontSize: '0.75rem', 
                                borderWidth: '2px', 
                                boxShadow: '2px 2px 0px #000' 
                              }}
                              disabled={assignmentsPage === 1}
                              onClick={() => setAssignmentsPage(1)}
                            >
                              First
                            </button>
                            <button
                              className="btn"
                              style={{ 
                                padding: '8px 14px', 
                                fontSize: '0.75rem', 
                                borderWidth: '2px', 
                                boxShadow: '2px 2px 0px #000' 
                              }}
                              disabled={assignmentsPage === 1}
                              onClick={() => setAssignmentsPage(assignmentsPage - 1)}
                            >
                              Prev
                            </button>

                            {/* Dynamic Page Buttons */}
                            {(() => {
                              const totalPages = Math.ceil(clientTasks.length / assignmentsLimit);
                              const buttons = [];
                              const startPage = Math.max(1, assignmentsPage - 2);
                              const endPage = Math.min(totalPages, assignmentsPage + 2);

                              for (let i = startPage; i <= endPage; i++) {
                                buttons.push(
                                  <button
                                    key={i}
                                    className={`btn ${assignmentsPage === i ? 'btn-primary' : ''}`}
                                    style={{ 
                                      padding: '8px 12px', 
                                      fontSize: '0.75rem', 
                                      borderWidth: '2px', 
                                      boxShadow: assignmentsPage === i ? 'none' : '2px 2px 0px #000',
                                      minWidth: '32px'
                                    }}
                                    onClick={() => setAssignmentsPage(i)}
                                  >
                                    {i}
                                  </button>
                                );
                              }
                              return buttons;
                            })()}

                            <button
                              className="btn"
                              style={{ 
                                padding: '8px 14px', 
                                fontSize: '0.75rem', 
                                borderWidth: '2px', 
                                boxShadow: '2px 2px 0px #000' 
                              }}
                              disabled={assignmentsPage >= Math.ceil(clientTasks.length / assignmentsLimit)}
                              onClick={() => setAssignmentsPage(assignmentsPage + 1)}
                            >
                              Next
                            </button>
                            <button
                              className="btn"
                              style={{ 
                                padding: '8px 14px', 
                                fontSize: '0.75rem', 
                                borderWidth: '2px', 
                                boxShadow: '2px 2px 0px #000' 
                              }}
                              disabled={assignmentsPage >= Math.ceil(clientTasks.length / assignmentsLimit)}
                              onClick={() => setAssignmentsPage(Math.ceil(clientTasks.length / assignmentsLimit))}
                            >
                              Last
                            </button>
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
        )}

        {/* KANBAN TASKS TAB */}
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
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>{task.task_type}</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {isOverdue(task) && (
                                <span className="badge" style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px' }}>
                                  <AlertTriangle size={10} /> OVERDUE
                                </span>
                              )}
                              <span className={`badge badge-${getPriorityBadgeClass(getTaskPriority(task))}`} style={{ fontSize: '0.65rem' }}>
                                {getTaskPriority(task)}
                              </span>
                            </div>
                          </div>
                          <div className="kanban-card-title">{task.title}</div>
                          {task.client_name && (
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                              Client: {task.client_name}
                            </div>
                          )}
                          {task.due_date && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: isOverdue(task) ? 'var(--danger)' : 'var(--text-muted)', 
                              fontWeight: isOverdue(task) ? 'bold' : 'normal',
                              marginTop: '2px' 
                            }}>
                              {formatDateStr(task.due_date)} {isOverdue(task) && '⚠️'}
                            </div>
                          )}
                          {task.freelancer_name && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 'bold' }}>
                              Assigned: {task.freelancer_name}
                            </div>
                          )}

                          {/* Inline status update select for fast operations */}
                          <div className="kanban-card-footer" onClick={e => e.stopPropagation()}>
                            <select 
                              className="form-control" 
                              value={col} 
                              onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', background: 'var(--bg-input)' }}
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

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <div style={{ textAlign: 'left' }}>
            {/* Calendar Header with navigation and filters */}
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
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="calendar-layout">
              {/* Calendar Grid */}
              <div className="glass" style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '12px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{day}</div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {getCalendarCells().map((cell, idx) => {
                    const isSelected = cell.dateStr === selectedDateStr;
                    return (
                      <div
                        key={idx}
                        onClick={() => cell.isCurrentMonth && setSelectedDateStr(cell.dateStr)}
                        className={`calendar-cell ${!cell.isCurrentMonth ? 'outside-month' : ''} ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="calendar-day-num">
                          {cell.dayNum}
                        </div>

                        {/* Cell indicators (desktop/mobile responsive rendering) */}
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

              {/* Day Details panel */}
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(client => (
                    <tr key={client.id}>
                      <td style={{ fontWeight: 'bold' }}>{client.name}</td>
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

        {/* FREELANCERS TAB (Admin Only) */}
        {activeTab === 'freelancers' && isAdmin && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>Freelancer Roster</h3>
              <button onClick={() => openFreelancerModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add Freelancer
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Company</th>
                    <th>Specialization</th>
                    <th>Rate/Video</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {freelancers.map(free => (
                    <tr key={free.id} style={{ opacity: free.is_active === 1 ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 'bold' }}>{free.name}</td>
                      <td>{free.email || '-'}</td>
                      <td>{free.phone || '-'}</td>
                      <td>{free.company_name || '-'}</td>
                      <td>
                        {free.specialization ? (
                          <span className="badge badge-muted" style={{ fontSize: '0.75rem' }}>
                            {free.specialization}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{free.rate_per_video !== null && free.rate_per_video !== undefined ? `₹${free.rate_per_video.toLocaleString()}` : '-'}</td>
                      <td>
                        <span className={`badge badge-${free.is_active === 1 ? 'success' : 'danger'}`}>
                          {free.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => openFreelancerModal(free)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                            Edit
                          </button>
                          <button 
                            onClick={() => toggleFreelancerStatus(free)} 
                            className={`btn btn-${free.is_active === 1 ? 'secondary' : 'primary'}`} 
                            style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                          >
                            {free.is_active === 1 ? 'Deactivate' : 'Activate'}
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

        {/* SCRIPT TRACKER TAB */}
        {activeTab === 'scripts' && (isAdmin || isSMM) && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
              <h3 style={{ margin: 0 }}>Script Tracker</h3>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingScript(null);
                  setScriptFormData({
                    title: '',
                    script_text: '',
                    month: scriptMonth,
                    reference_video_link: '',
                    reaction_video_link: '',
                    format: 'reel'
                  });
                  setShowScriptModal(true);
                }}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} /> Add Script
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Review and update marketing scripts and statuses for the selected client and month.
            </p>

            <div className="dashboard-toolbar" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label className="form-label" style={{ margin: 0 }}>Client:</label>
                  <select 
                    className="form-control"
                    value={selectedScriptClient?.id || ''}
                    onChange={(e) => {
                      const client = clients.find(c => c.id === parseInt(e.target.value));
                      setSelectedScriptClient(client);
                      if (client) fetchMarketingData(client.id);
                    }}
                    style={{ maxWidth: '200px', padding: '8px' }}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label className="form-label" style={{ margin: 0 }}>Month:</label>
                  <input
                    type="month"
                    className="form-control"
                    value={scriptMonth}
                    onChange={(e) => setScriptMonth(e.target.value)}
                    style={{ maxWidth: '160px', padding: '8px' }}
                  />
                </div>
              </div>
            </div>

            {(() => {
              const monthlyScripts = marketingScripts.filter(item => item.month === scriptMonth);
              const reelsScripts = monthlyScripts.filter(item => item.format !== 'long_format');
              const longFormatScripts = monthlyScripts.filter(item => item.format === 'long_format');

              if (monthlyScripts.length === 0) {
                return (
                  <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No scripts found for this client and month. Click "Add Script" to create one.
                  </div>
                );
              }

              const renderScriptGrid = (scripts) => (
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', 
                    gap: '24px', 
                    marginBottom: '24px' 
                  }}
                >
                  {scripts.map(item => (
                    <div key={item.id} className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <h4 style={{ fontSize: '1.2rem', margin: 0, flexGrow: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {item.title}
                          <span 
                            className={`badge badge-${item.format === 'long_format' ? 'info' : 'success'}`} 
                            style={{ 
                              fontSize: '0.6rem', 
                              padding: '2px 8px', 
                              borderWidth: '1.5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              lineHeight: '1',
                              boxShadow: 'none'
                            }}
                          >
                            {item.format === 'long_format' ? 'Long Format' : 'Reel'}
                          </span>
                        </h4>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setEditingScript(item);
                              setScriptFormData({
                                title: item.title,
                                script_text: item.script_text,
                                month: item.month,
                                reference_video_link: item.reference_video_link || '',
                                reaction_video_link: item.reaction_video_link || '',
                                format: item.format || 'reel'
                              });
                              setShowScriptModal(true);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteScript(item.id)}
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#dc3545', color: '#fff', border: 'none' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
 
                      <div style={{ 
                        maxHeight: '350px', 
                        overflowY: 'auto', 
                        padding: '14px', 
                        borderRadius: '4px', 
                        backgroundColor: 'rgba(0,0,0,0.1)', 
                        fontSize: '0.9rem', 
                        whiteSpace: 'pre-wrap',
                        textAlign: 'left'
                      }}>
                        {item.script_text}
                      </div>
 
                      {(item.reference_video_link || item.reaction_video_link) && (
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', marginTop: '4px', flexWrap: 'wrap' }}>
                          {item.reference_video_link && (
                            <a href={item.reference_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ textDecoration: 'none' }}>
                              🎥 Reference Video
                            </a>
                          )}
                          {item.reaction_video_link && (
                            <a href={item.reaction_video_link} target="_blank" rel="noopener noreferrer" className="badge badge-warning" style={{ textDecoration: 'none' }}>
                              🎬 Reaction Video
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
 
              return renderScriptGrid(monthlyScripts);
            })()}
          </div>
        )}

        {/* MARKETING DATA TAB */}
        {activeTab === 'reports' && (isAdmin || isSMM) && (
          <div style={{ textAlign: 'left' }}>
            <div className="dashboard-toolbar">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1 }}>
                <label className="form-label" style={{ margin: 0 }}>Select Client:</label>
                <select 
                  className="form-control"
                  value={selectedClientForReports?.id || ''}
                  onChange={(e) => {
                    const client = clients.find(c => c.id === parseInt(e.target.value));
                    setSelectedClientForReports(client);
                    if (client) fetchMarketingData(client.id);
                  }}
                  style={{ maxWidth: '250px' }}
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Exports */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => handleCSVExport('content')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                  <FileDown size={14} /> Content CSV
                </button>
                <button onClick={() => handleCSVExport('ads')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                  <FileDown size={14} /> Ads CSV
                </button>
                <button onClick={() => handleCSVExport('monthly')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                  <FileDown size={14} /> Monthly CSV
                </button>
              </div>
            </div>

            {selectedClientForReports && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0 }}>Content Performance Tracker</h3>
                  {(isAdmin || isSMM) && (
                    <button onClick={() => openContentModal()} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      <Plus size={14} style={{ marginRight: '4px' }} /> Add Content Row
                    </button>
                  )}
                </div>
                <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th colSpan="7" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5' }}>Metadata</th>
                        <th colSpan="11" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#fee2e2' }}>Instagram Metrics</th>
                        <th colSpan="4" style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#dbeafe' }}>YouTube Metrics</th>
                        <th style={{ borderBottom: '2px solid #000', textAlign: 'center', background: '#f4f4f5' }}>Actions</th>
                      </tr>
                      <tr>
                        {/* Metadata */}
                        <th>Date</th>
                        <th>Post Type</th>
                        <th>Script</th>
                        <th>Status</th>
                        <th>Link</th>
                        <th>Time</th>
                        <th>Caption</th>
                        {/* Insta */}
                        <th>Views</th>
                        <th>Likes</th>
                        <th>Comments</th>
                        <th>Shares</th>
                        <th>Saves</th>
                        <th>Follows</th>
                        <th>Avg Watch Time %</th>
                        <th>Boosted?</th>
                        <th>Engagement %</th>
                        <th>Save Rate %</th>
                        <th>Score</th>
                        {/* YouTube */}
                        <th>Views</th>
                        <th>Watch Time (hrs)</th>
                        <th>Avg Duration</th>
                        <th>CTR%</th>
                        {/* Actions */}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketingContent.length === 0 ? (
                        <tr>
                          <td colSpan="23" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No content items tracked yet.
                          </td>
                        </tr>
                      ) : (
                        marketingContent.map(item => (
                          <tr key={item.id}>
                            {/* Metadata */}
                            <td>{item.date ? formatDateStr(item.date) : '-'}</td>
                            <td><span className="badge badge-info">{item.post_type}</span></td>
                            <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.script_title || item.script}>{item.script_title || item.script || '-'}</td>
                            <td>
                              <select
                                value={item.status === 'Pending Client Approval' || item.status === 'Client Approved' ? 'Pending' : (item.status === 'Client Rejected' ? 'Draft' : item.status)}
                                onChange={(e) => updateContentStatus(item.id, e.target.value)}
                                style={{
                                  padding: '6px 24px 6px 12px',
                                  fontSize: '0.7rem',
                                  fontWeight: '800',
                                  borderRadius: '9999px',
                                  border: '2px solid #000000',
                                  textTransform: 'uppercase',
                                  cursor: 'pointer',
                                  appearance: 'none',
                                  WebkitAppearance: 'none',
                                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'right 8px center',
                                  backgroundSize: '10px',
                                  backgroundColor: 
                                    item.status === 'Posted' ? '#d1fae5' : 
                                    (['Pending', 'Pending Client Approval', 'Client Approved'].includes(item.status) ? '#fee2e2' : '#f4f4f5'),
                                  color: 
                                    item.status === 'Posted' ? '#065f46' : 
                                    (['Pending', 'Pending Client Approval', 'Client Approved'].includes(item.status) ? '#991b1b' : '#52525b'),
                                  boxShadow: 'var(--shadow-sm)'
                                }}
                              >
                                <option value="Draft" style={{ color: '#52525b', background: '#f4f4f5', fontWeight: '800' }}>Draft</option>
                                <option value="Pending" style={{ color: '#991b1b', background: '#fee2e2', fontWeight: '800' }}>Pending</option>
                                <option value="Posted" style={{ color: '#065f46', background: '#d1fae5', fontWeight: '800' }}>Posted</option>
                              </select>
                            </td>
                            <td>
                              {item.link ? (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Link</a>
                              ) : '-'}
                            </td>
                            <td>{item.time || '-'}</td>
                            <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.caption}>{item.caption || '-'}</td>
                            
                            {/* Insta */}
                            <td>{item.views?.toLocaleString() || '0'}</td>
                            <td>{item.likes?.toLocaleString() || '0'}</td>
                            <td>{item.comments?.toLocaleString() || '0'}</td>
                            <td>{item.shares?.toLocaleString() || '0'}</td>
                            <td>{item.saves?.toLocaleString() || '0'}</td>
                            <td>{item.follows?.toLocaleString() || '0'}</td>
                            <td>
                              {item.avg_watch_time_pct !== null && item.avg_watch_time_pct !== undefined ? (
                                <span style={{ color: item.avg_watch_time_pct >= 50 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.avg_watch_time_pct}%
                                </span>
                              ) : '-'}
                            </td>
                            <td>{item.boosted || 'No'}</td>
                            <td>
                              {item.engagement_rate_pct !== null && item.engagement_rate_pct !== undefined ? (
                                <span style={{ color: item.engagement_rate_pct >= 10 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.engagement_rate_pct}%
                                </span>
                              ) : '-'}
                            </td>
                            <td>
                              {item.save_rate_pct !== null && item.save_rate_pct !== undefined ? (
                                <span style={{ color: item.save_rate_pct >= 2 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.save_rate_pct}%
                                </span>
                              ) : '-'}
                            </td>
                            <td style={{ fontWeight: 'bold' }}>{item.content_score || '-'}</td>
                            
                            {/* YouTube */}
                            <td>{item.youtube_views?.toLocaleString() || '0'}</td>
                            <td>{item.youtube_watch_time !== null && item.youtube_watch_time !== undefined ? item.youtube_watch_time.toLocaleString() : '0'}</td>
                            <td>{item.youtube_avg_view_duration || '-'}</td>
                            <td>
                              {item.youtube_ctr !== null && item.youtube_ctr !== undefined ? (
                                <span style={{ color: item.youtube_ctr >= 4 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.youtube_ctr}%
                                </span>
                              ) : '0%'}
                            </td>
                            
                            {/* Actions */}
                            <td>
                              {(isAdmin || isSMM) && (
                                <button 
                                  onClick={() => openContentModal(item)} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ marginBottom: '12px' }}>Ad Campaigns Performance</h3>
                <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Campaign Name</th>
                        <th>Leads</th>
                        <th>Spend</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>CPL</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No ad campaigns tracked.
                          </td>
                        </tr>
                      ) : (
                        adCampaigns.map(ad => (
                          <tr key={ad.id}>
                            <td><span className="badge badge-success">{ad.platform}</span></td>
                            <td style={{ fontWeight: '500' }}>{ad.ad_campaign_name}</td>
                            <td>{ad.leads}</td>
                            <td>₹{ad.total_ad_spend_inr?.toLocaleString()}</td>
                            <td>{ad.impressions?.toLocaleString()}</td>
                            <td>{ad.clicks?.toLocaleString()}</td>
                            <td>
                              {ad.ctr_pct !== null && ad.ctr_pct !== undefined ? (
                                <span style={{ color: ad.ctr_pct >= 2 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {ad.ctr_pct}%
                                </span>
                              ) : '-'}
                            </td>
                            <td>₹{ad.cpl_inr}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{ad.roas}x</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* SEO Monthly Reports Table */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', marginTop: '32px' }}>
                  <h3 style={{ margin: 0 }}>SEO & GMB Monthly Reports</h3>
                  {(isAdmin || isSMM) && (
                    <button onClick={() => openMonthlyModal()} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      <Plus size={14} style={{ marginRight: '4px' }} /> Add Monthly Report
                    </button>
                  )}
                </div>
                <div className="table-container table-scrollable-y" style={{ marginBottom: '32px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Website Clicks</th>
                        <th>Website Traffic</th>
                        <th>GMB Views</th>
                        <th>Map Views</th>
                        <th>GMB Clicks</th>
                        <th>On Page Score</th>
                        <th>Off Page</th>
                        <th>Blogs</th>
                        <th>Calls</th>
                        <th>Directions</th>
                        <th>Reviews</th>
                        <th>Avg. Rating</th>
                        <th>Top 3 Keywords</th>
                        <th>DA</th>
                        <th>MoM Growth – Sessions</th>
                        <th>MoM Growth – GMB Views</th>
                        <th>AI Overview Visible?</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReports.length === 0 ? (
                        <tr>
                          <td colSpan="19" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No monthly reports available.
                          </td>
                        </tr>
                      ) : (
                        monthlyReports.map(item => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 'bold' }}>{formatMonthStr(item.month)}</td>
                            <td>{item.website_clicks || '-'}</td>
                            <td>{item.website_traffic?.toLocaleString() || '-'}</td>
                            <td>{item.gmb_views?.toLocaleString() || '-'}</td>
                            <td>{item.map_views?.toLocaleString() || '-'}</td>
                            <td>{item.gmb_clicks?.toLocaleString() || '-'}</td>
                            <td>{item.on_page_score || '-'}</td>
                            <td>{item.off_page !== null && item.off_page !== undefined ? item.off_page : '-'}</td>
                            <td>{item.blogs !== null && item.blogs !== undefined ? item.blogs : '-'}</td>
                            <td>{item.calls !== null && item.calls !== undefined ? item.calls : '-'}</td>
                            <td>{item.directions !== null && item.directions !== undefined ? item.directions : '-'}</td>
                            <td>{item.reviews !== null && item.reviews !== undefined ? item.reviews : '-'}</td>
                            <td>{item.avg_rating !== null && item.avg_rating !== undefined ? item.avg_rating.toFixed(1) : '-'}</td>
                            <td>{item.top_keywords || '-'}</td>
                            <td>{item.da !== null && item.da !== undefined ? item.da : '-'}</td>
                            <td>
                              {item.mom_growth_sessions !== null && item.mom_growth_sessions !== undefined ? (
                                <span style={{ color: item.mom_growth_sessions >= 0 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.mom_growth_sessions >= 0 ? '+' : ''}{(item.mom_growth_sessions * 100).toFixed(2)}%
                                </span>
                              ) : '-'}
                            </td>
                            <td>
                              {item.mom_growth_gmb_views !== null && item.mom_growth_gmb_views !== undefined ? (
                                <span style={{ color: item.mom_growth_gmb_views >= 0 ? '#065f46' : '#991b1b', fontWeight: 'bold' }}>
                                  {item.mom_growth_gmb_views >= 0 ? '+' : ''}{(item.mom_growth_gmb_views * 100).toFixed(2)}%
                                </span>
                              ) : '-'}
                            </td>
                            <td>
                              <span className={`badge badge-${item.ai_overview_visible === 'Yes' ? 'success' : 'muted'}`}>
                                {item.ai_overview_visible || 'No'}
                              </span>
                            </td>
                            <td>
                              {(isAdmin || isSMM) && (
                                <button 
                                  onClick={() => openMonthlyModal(item)} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ARTIST CURATION TAB */}
        {activeTab === 'curation' && isAdmin && (
          <div style={{ textAlign: 'left' }}>
            
            {/* Gig Status Tracker */}
            <div className="dashboard-toolbar">
              <h3>Gig Status Tracker</h3>
              <button onClick={() => openGigModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add Gig
              </button>
            </div>
            <div className="table-container" style={{ marginBottom: '32px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Artist ID</th>
                    <th>Artist Name</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Payment (₹)</th>
                    <th>Status</th>
                    <th>Advance Paid</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gigs.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No gigs found</td>
                    </tr>
                  ) : (
                    gigs.map(g => (
                      <tr key={g.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{g.artist_code || '-'}</td>
                        <td style={{ fontWeight: 'bold' }}>{g.artist_name || '-'}</td>
                        <td>{formatDateStr(g.gig_date)}</td>
                        <td>{g.venue_name || '-'}</td>
                        <td>₹{g.fee_inr !== null ? g.fee_inr.toLocaleString('en-IN') : '0'}</td>
                        <td>
                          <span className={`badge badge-${
                            g.status === 'Paid' || g.status === 'Confirmed' ? 'success' :
                            g.status === 'Pending' ? 'warning' :
                            g.status === 'Cancelled' ? 'danger' : 'info'
                          }`}>
                            {g.status}
                          </span>
                        </td>
                        <td>₹{g.advance_paid !== null ? g.advance_paid.toLocaleString('en-IN') : '0'}</td>
                        <td>
                          <button onClick={() => openGigModal(g)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Roster & Encrypted Details */}
            <div className="dashboard-toolbar">
              <h3>Artist Roster (Client Specific)</h3>
              <button onClick={() => openArtistModal()} className="btn btn-primary">
                <Plus size={16} /> Add Artist
              </button>
            </div>
            <div className="table-container" style={{ marginBottom: '32px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Artist Name</th>
                    <th>Category</th>
                    <th>Phone Number</th>
                    <th>Instruments</th>
                    <th>Insta Link</th>
                    <th>Description</th>
                    <th>Email</th>
                    <th>City</th>
                    <th>Total Performances</th>
                    <th>Perf. with M-</th>
                    <th>Last Perf. Date</th>
                    <th>Average Fee (₹)</th>
                    <th>Payment Status</th>
                    <th>Rating (1-10)</th>
                    <th>Reliability Score</th>
                    <th>Notes</th>
                    <th>Bank Details</th>
                    <th>Total Amount Paid</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map(art => (
                    <tr key={art.id}>
                      <td style={{ fontWeight: 'bold' }}>{art.name}</td>
                      <td>{art.category || '-'}</td>
                      <td>{art.phone || '-'}</td>
                      <td>{art.instruments || '-'}</td>
                      <td>
                        {art.insta_link ? (
                          <a href={art.insta_link.startsWith('http') ? art.insta_link : `https://${art.insta_link}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>
                            {art.insta_link}
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={art.description}>
                        {art.description || '-'}
                      </td>
                      <td>{art.email || '-'}</td>
                      <td>{art.city || '-'}</td>
                      <td>{art.total_performances}</td>
                      <td>{art.perf_with_m}</td>
                      <td>{art.last_perf_date}</td>
                      <td>₹{art.average_fee_inr ? art.average_fee_inr.toLocaleString('en-IN') : '0'}</td>
                      <td>{art.payment_status}</td>
                      <td>{art.rating || '-'}</td>
                      <td>{art.reliability_score !== null && art.reliability_score !== undefined ? `${art.reliability_score}%` : 'N/A'}</td>
                      <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={art.notes}>
                        {art.notes || '-'}
                      </td>
                      <td>
                        {decryptedBank[art.id] ? (
                          <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{decryptedBank[art.id]}</span>
                        ) : (
                          <button 
                            onClick={() => decryptBankDetails(art.id)} 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                            disabled={!isSuperAdmin}
                            title={!isSuperAdmin ? 'Only Super Admin can decrypt bank credentials' : ''}
                          >
                            Reveal Bank Info
                          </button>
                        )}
                      </td>
                      <td>₹{art.total_amount_paid_inr ? art.total_amount_paid_inr.toLocaleString('en-IN') : '0'}</td>
                      <td>
                        <button onClick={() => openArtistModal(art)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Venues Table */}
            <div className="dashboard-toolbar">
              <h3>Venue List</h3>
              <button onClick={() => openVenueModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add Venue
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Location Name</th>
                    <th>Address</th>
                    <th>Google Maps Link</th>
                    <th>POC Name</th>
                    <th>POC Number</th>
                    <th>POC Email</th>
                    <th>Social Links</th>
                    <th>Gig Confirmed Message</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {venues.map(v => (
                    <tr key={v.id}>
                      <td>{v.client_name || '-'}</td>
                      <td style={{ fontWeight: 'bold' }}>{v.name}</td>
                      <td>{v.address || '-'}</td>
                      <td>
                        {v.map_link ? (
                          <a href={v.map_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                            View Map
                          </a>
                        ) : '-'}
                      </td>
                      <td>{v.poc_name || '-'}</td>
                      <td>{v.poc_phone || '-'}</td>
                      <td>{v.poc_email || '-'}</td>
                      <td>{v.social_links || '-'}</td>
                      <td style={{ fontSize: '0.75rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.gig_confirmed_message}>
                        {v.gig_confirmed_message || '-'}
                      </td>
                      <td>
                        <button onClick={() => openVenueModal(v)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'audit' && isAdmin && (
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
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginTop: '20px', 
                  flexWrap: 'wrap', 
                  gap: '16px' 
                }}
              >
                {/* Left: Summary */}
                <div style={{ fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                  Showing <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min((auditPage - 1) * auditLimit + 1, totalAuditLogs)}</span> to{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.min(auditPage * auditLimit, totalAuditLogs)}</span> of{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{totalAuditLogs}</span> entries
                </div>

                {/* Right: Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Entries selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show</span>
                    <select
                      className="form-control"
                      value={auditLimit}
                      onChange={(e) => {
                        setAuditLimit(parseInt(e.target.value));
                        setAuditPage(1); // reset to page 1 on limit change
                      }}
                      style={{ 
                        width: 'auto', 
                        padding: '8px 16px 8px 12px', 
                        height: 'auto', 
                        fontSize: '0.85rem',
                        borderWidth: '2px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-muted)' }}>entries</span>
                  </div>

                  {/* Page numbers/buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      className="btn"
                      style={{ 
                        padding: '8px 14px', 
                        fontSize: '0.75rem', 
                        borderWidth: '2px', 
                        boxShadow: '2px 2px 0px #000' 
                      }}
                      disabled={auditPage === 1}
                      onClick={() => setAuditPage(1)}
                    >
                      First
                    </button>
                    <button
                      className="btn"
                      style={{ 
                        padding: '8px 14px', 
                        fontSize: '0.75rem', 
                        borderWidth: '2px', 
                        boxShadow: '2px 2px 0px #000' 
                      }}
                      disabled={auditPage === 1}
                      onClick={() => setAuditPage(auditPage - 1)}
                    >
                      Prev
                    </button>

                    {/* Dynamic Page Buttons */}
                    {(() => {
                      const totalPages = Math.ceil(totalAuditLogs / auditLimit);
                      const buttons = [];
                      const startPage = Math.max(1, auditPage - 2);
                      const endPage = Math.min(totalPages, auditPage + 2);

                      for (let i = startPage; i <= endPage; i++) {
                        buttons.push(
                          <button
                            key={i}
                            className={`btn ${auditPage === i ? 'btn-primary' : ''}`}
                            style={{ 
                              padding: '8px 12px', 
                              fontSize: '0.75rem', 
                              borderWidth: '2px', 
                              boxShadow: auditPage === i ? 'none' : '2px 2px 0px #000',
                              minWidth: '32px'
                            }}
                            onClick={() => setAuditPage(i)}
                          >
                            {i}
                          </button>
                        );
                      }
                      return buttons;
                    })()}

                    <button
                      className="btn"
                      style={{ 
                        padding: '8px 14px', 
                        fontSize: '0.75rem', 
                        borderWidth: '2px', 
                        boxShadow: '2px 2px 0px #000' 
                      }}
                      disabled={auditPage >= Math.ceil(totalAuditLogs / auditLimit)}
                      onClick={() => setAuditPage(auditPage + 1)}
                    >
                      Next
                    </button>
                    <button
                      className="btn"
                      style={{ 
                        padding: '8px 14px', 
                        fontSize: '0.75rem', 
                        borderWidth: '2px', 
                        boxShadow: '2px 2px 0px #000' 
                      }}
                      disabled={auditPage >= Math.ceil(totalAuditLogs / auditLimit)}
                      onClick={() => setAuditPage(Math.ceil(totalAuditLogs / auditLimit))}
                    >
                      Last
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* --- MODALS --- */}
      
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
                      <option key={c.id} value={c.id}>{c.name}</option>
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
      )}

      {/* Artist Modal */}
      {showArtistModal && (
        <div className="modal-overlay" onClick={() => setShowArtistModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingArtist ? 'Edit Artist Details' : 'Add Artist to Roster'}</h2>
            <form onSubmit={handleArtistSubmit} style={{ marginTop: '20px' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={artistFormData.name}
                  onChange={e => setArtistFormData({...artistFormData, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Jazz Vocalist"
                    value={artistFormData.category}
                    onChange={e => setArtistFormData({...artistFormData, category: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Mumbai"
                    value={artistFormData.city}
                    onChange={e => setArtistFormData({...artistFormData, city: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={artistFormData.phone}
                    onChange={e => setArtistFormData({...artistFormData, phone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={artistFormData.email}
                    onChange={e => setArtistFormData({...artistFormData, email: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Instruments</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Guitar, Drums"
                    value={artistFormData.instruments}
                    onChange={e => setArtistFormData({...artistFormData, instruments: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Insta Link</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. instagram.com/artist"
                    value={artistFormData.insta_link}
                    onChange={e => setArtistFormData({...artistFormData, insta_link: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Short summary..."
                    value={artistFormData.description}
                    onChange={e => setArtistFormData({...artistFormData, description: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rating (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-control"
                    placeholder="e.g. 8"
                    value={artistFormData.rating}
                    onChange={e => setArtistFormData({...artistFormData, rating: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Telegram Chat ID</label>
                <input
                  type="text"
                  className="form-control"
                  value={artistFormData.telegram_chat_id}
                  onChange={e => setArtistFormData({...artistFormData, telegram_chat_id: e.target.value})}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Bank Details (Super Admin only can decrypt)</label>
                  <textarea
                    className="form-control"
                    placeholder="Enter Bank Details..."
                    value={artistFormData.bank_details}
                    onChange={e => setArtistFormData({...artistFormData, bank_details: e.target.value})}
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Onboarding notes..."
                    value={artistFormData.notes}
                    onChange={e => setArtistFormData({...artistFormData, notes: e.target.value})}
                    rows={2}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowArtistModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Artist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content Modal */}
      {showContentModal && (
        <div className="modal-overlay" onClick={() => setShowContentModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingContent ? 'Edit Content Row' : 'Add Content Row'}</h2>
            <form onSubmit={handleContentSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Platform</label>
                  <select
                    className="form-control"
                    value={contentFormData.platform}
                    onChange={e => setContentFormData({ ...contentFormData, platform: e.target.value })}
                    required
                  >
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={contentFormData.date}
                    onChange={e => setContentFormData({ ...contentFormData, date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Post Type</label>
                  <select
                    className="form-control"
                    value={contentFormData.post_type}
                    onChange={e => setContentFormData({ ...contentFormData, post_type: e.target.value })}
                  >
                    <option value="Reel">Reel</option>
                    <option value="Story">Story</option>
                    <option value="Static">Static</option>
                    <option value="Carousel">Carousel</option>
                    <option value="Youtube">YouTube Video</option>
                    <option value="Short">YouTube Short</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-control"
                    value={contentFormData.status}
                    onChange={e => setContentFormData({ ...contentFormData, status: e.target.value })}
                  >
                    <option value="Draft">Draft</option>
                    <option value="Pending">Pending</option>
                    <option value="Posted">Posted</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Title (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={contentFormData.title}
                  onChange={e => setContentFormData({ ...contentFormData, title: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Link</label>
                  <input
                    type="url"
                    className="form-control"
                    value={contentFormData.link}
                    onChange={e => setContentFormData({ ...contentFormData, link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input
                    type="text"
                    className="form-control"
                    value={contentFormData.time}
                    onChange={e => setContentFormData({ ...contentFormData, time: e.target.value })}
                    placeholder="e.g. 18:00"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Linked Script</label>
                  <select
                    className="form-control"
                    value={contentFormData.script_id || ''}
                    onChange={e => setContentFormData({ ...contentFormData, script_id: e.target.value })}
                  >
                    <option value="">-- None --</option>
                    {(() => {
                      const selectedMonth = contentFormData.date ? contentFormData.date.slice(0, 7) : '';
                      const filteredScripts = selectedMonth 
                        ? marketingScripts.filter(s => s.month === selectedMonth)
                        : marketingScripts;
                      
                      return filteredScripts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.month})
                        </option>
                      ));
                    })()}
                  </select>
                  {marketingScripts.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      No scripts found. Create one in the Script Tracker tab.
                    </span>
                  ) : (
                    (() => {
                      const selectedMonth = contentFormData.date ? contentFormData.date.slice(0, 7) : '';
                      const filtered = selectedMonth ? marketingScripts.filter(s => s.month === selectedMonth) : marketingScripts;
                      if (filtered.length === 0 && selectedMonth) {
                        return (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-warning)' }}>
                            No scripts found for {selectedMonth}. Create one in the Script Tracker tab.
                          </span>
                        );
                      }
                      return null;
                    })()
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Caption</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={contentFormData.caption}
                    onChange={e => setContentFormData({ ...contentFormData, caption: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Facebook Post ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="fb_..."
                    value={contentFormData.facebook_post_id}
                    onChange={e => setContentFormData({ ...contentFormData, facebook_post_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Instagram Media ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="ig_..."
                    value={contentFormData.instagram_media_id}
                    onChange={e => setContentFormData({ ...contentFormData, instagram_media_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube Video ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="yt_..."
                    value={contentFormData.youtube_video_id}
                    onChange={e => setContentFormData({ ...contentFormData, youtube_video_id: e.target.value })}
                  />
                </div>
              </div>

              {contentFormData.platform === 'instagram' ? (
                <div>
                  <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Instagram Metrics</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Views</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.views}
                        onChange={e => setContentFormData({ ...contentFormData, views: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Likes</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.likes}
                        onChange={e => setContentFormData({ ...contentFormData, likes: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Comments</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.comments}
                        onChange={e => setContentFormData({ ...contentFormData, comments: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Shares</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.shares}
                        onChange={e => setContentFormData({ ...contentFormData, shares: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Saves</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.saves}
                        onChange={e => setContentFormData({ ...contentFormData, saves: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Follows (from post)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.follows}
                        onChange={e => setContentFormData({ ...contentFormData, follows: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Avg Watch Time %</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={contentFormData.avg_watch_time_pct}
                        onChange={e => setContentFormData({ ...contentFormData, avg_watch_time_pct: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Boosted? (Yes/No + spend)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Yes - ₹500"
                        value={contentFormData.boosted}
                        onChange={e => setContentFormData({ ...contentFormData, boosted: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>YouTube Metrics</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">YouTube Views</label>
                      <input
                        type="number"
                        className="form-control"
                        value={contentFormData.youtube_views}
                        onChange={e => setContentFormData({ ...contentFormData, youtube_views: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Watch Time (hrs)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        value={contentFormData.youtube_watch_time}
                        onChange={e => setContentFormData({ ...contentFormData, youtube_watch_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Avg View Duration</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. 02:15"
                        value={contentFormData.youtube_avg_view_duration}
                        onChange={e => setContentFormData({ ...contentFormData, youtube_avg_view_duration: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">CTR%</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={contentFormData.youtube_ctr}
                        onChange={e => setContentFormData({ ...contentFormData, youtube_ctr: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowContentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Script Modal */}
      {showScriptModal && (
        <div className="modal-overlay" onClick={() => {
          setShowScriptModal(false);
          setEditingScript(null);
        }}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingScript ? 'Edit Script' : 'Add Script'}</h2>
            <form onSubmit={handleSaveScript} style={{ marginTop: '20px' }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={scriptFormData.title}
                  onChange={e => setScriptFormData({ ...scriptFormData, title: e.target.value })}
                  placeholder="e.g. Intro to Espresso Brewing"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Month</label>
                  <input
                    type="month"
                    className="form-control"
                    value={scriptFormData.month}
                    onChange={e => setScriptFormData({ ...scriptFormData, month: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Format Type</label>
                  <select
                    className="form-control"
                    value={scriptFormData.format || 'reel'}
                    onChange={e => setScriptFormData({ ...scriptFormData, format: e.target.value })}
                    required
                  >
                    <option value="reel">Reel Format</option>
                    <option value="long_format">Long Format</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Reference Video Link (Optional)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={scriptFormData.reference_video_link}
                    onChange={e => setScriptFormData({ ...scriptFormData, reference_video_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reaction Video Link (Optional)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={scriptFormData.reaction_video_link}
                    onChange={e => setScriptFormData({ ...scriptFormData, reaction_video_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Script Text</label>
                <textarea
                  className="form-control"
                  rows={16}
                  value={scriptFormData.script_text}
                  onChange={e => setScriptFormData({ ...scriptFormData, script_text: e.target.value })}
                  placeholder="Paste or write script contents here..."
                  required
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', minHeight: '350px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowScriptModal(false);
                    setEditingScript(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Script
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monthly Report Modal */}
      {showMonthlyModal && (
        <div className="modal-overlay" onClick={() => setShowMonthlyModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingMonthly ? 'Edit Monthly Report' : 'Add Monthly Report'}</h2>
            <form onSubmit={handleMonthlyReportSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Month (YYYY-MM)</label>
                  <input
                    type="month"
                    className="form-control"
                    value={monthlyFormData.month}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, month: e.target.value })}
                    required
                    disabled={!!editingMonthly}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Website Clicks</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 7.89k"
                    value={monthlyFormData.website_clicks}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, website_clicks: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Website Traffic</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 16000"
                    value={monthlyFormData.website_traffic}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, website_traffic: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GMB Views</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 52000"
                    value={monthlyFormData.gmb_views}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_views: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Map Views</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 35000"
                    value={monthlyFormData.map_views}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, map_views: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GMB Clicks</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 1200"
                    value={monthlyFormData.gmb_clicks}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_clicks: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">On Page Score</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 85/100"
                    value={monthlyFormData.on_page_score}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, on_page_score: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Off Page</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 45"
                    value={monthlyFormData.off_page}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, off_page: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Blogs</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 4"
                    value={monthlyFormData.blogs}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, blogs: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Calls</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 150"
                    value={monthlyFormData.calls}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, calls: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Directions</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 450"
                    value={monthlyFormData.directions}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, directions: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reviews</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 12"
                    value={monthlyFormData.reviews}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, reviews: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Avg. Rating</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    className="form-control"
                    placeholder="e.g. 4.8"
                    value={monthlyFormData.avg_rating}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, avg_rating: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">DA</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 32"
                    value={monthlyFormData.da}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, da: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Top 3 Keywords</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="keyword1, keyword2..."
                    value={monthlyFormData.top_keywords}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, top_keywords: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">AI Overview Visible?</label>
                  <select
                    className="form-control"
                    value={monthlyFormData.ai_overview_visible}
                    onChange={e => setMonthlyFormData({ ...monthlyFormData, ai_overview_visible: e.target.value })}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMonthlyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFreelancerModal && (
        <div className="modal-overlay" onClick={() => setShowFreelancerModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingFreelancer ? 'Edit Freelancer' : 'Add Freelancer'}</h2>
            <form onSubmit={handleFreelancerSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.name}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={freelancerFormData.email}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.phone}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={freelancerFormData.company_name}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, company_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Specialization</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Editor, Camera Guy, Motion Graphics"
                    value={freelancerFormData.specialization}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, specialization: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rate per Video (INR)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={freelancerFormData.rate_per_video}
                    onChange={e => setFreelancerFormData({ ...freelancerFormData, rate_per_video: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFreelancerModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Freelancer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVenueModal && (
        <div className="modal-overlay" onClick={() => setShowVenueModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingVenue ? 'Edit Venue Details' : 'Add Venue'}</h2>
            <form onSubmit={handleVenueSubmit} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Client Name (Association)</label>
                  <select
                    className="form-control"
                    value={venueFormData.client_id}
                    onChange={e => setVenueFormData({ ...venueFormData, client_id: e.target.value })}
                  >
                    <option value="">Select Client (None)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Location / Venue Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.name}
                    onChange={e => setVenueFormData({ ...venueFormData, name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.address}
                    onChange={e => setVenueFormData({ ...venueFormData, address: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.city}
                    onChange={e => setVenueFormData({ ...venueFormData, city: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Google Maps Link</label>
                  <input
                    type="url"
                    className="form-control"
                    value={venueFormData.map_link}
                    onChange={e => setVenueFormData({ ...venueFormData, map_link: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Social Links (Instagram/Website/Other)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. instagram.com/venue"
                    value={venueFormData.social_links}
                    onChange={e => setVenueFormData({ ...venueFormData, social_links: e.target.value })}
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Point of Contact (POC)</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">POC Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.poc_name}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">POC Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={venueFormData.poc_phone}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">POC Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={venueFormData.poc_email}
                    onChange={e => setVenueFormData({ ...venueFormData, poc_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Gig Confirmed Message (Telegram DM Template)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Hey {{artist_name}}! Confirmed: {{gig_date}} at {{venue_name}}..."
                  value={venueFormData.gig_confirmed_message}
                  onChange={e => setVenueFormData({ ...venueFormData, gig_confirmed_message: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowVenueModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Venue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showGigModal && (
        <div className="modal-overlay" onClick={() => setShowGigModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', width: '100%', maxWidth: '600px' }}>
            <h2>{editingGig ? 'Edit Gig Status' : 'Add Gig Status'}</h2>
            <form onSubmit={handleGigSubmit} style={{ marginTop: '20px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Artist</label>
                  <select
                    className="form-control"
                    value={gigFormData.artist_id}
                    onChange={e => setGigFormData({ ...gigFormData, artist_id: e.target.value })}
                    required
                  >
                    <option value="">Select Artist</option>
                    {artists.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.category || 'No Category'})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Location / Venue</label>
                  <select
                    className="form-control"
                    value={gigFormData.venue_id}
                    onChange={e => setGigFormData({ ...gigFormData, venue_id: e.target.value })}
                  >
                    <option value="">Select Venue (None)</option>
                    {venues.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Gig Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={gigFormData.gig_date}
                    onChange={e => setGigFormData({ ...gigFormData, gig_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Planning Cycle</label>
                  <select
                    className="form-control"
                    value={gigFormData.planning_cycle_id}
                    onChange={e => setGigFormData({ ...gigFormData, planning_cycle_id: e.target.value })}
                  >
                    <option value="">Select Cycle (None)</option>
                    {planningCycles.map(c => (
                      <option key={c.id} value={c.id}>{c.cycle_label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Payment Fee (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 15000"
                    value={gigFormData.fee_inr}
                    onChange={e => setGigFormData({ ...gigFormData, fee_inr: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Advance Paid (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 5000"
                    value={gigFormData.advance_paid}
                    onChange={e => setGigFormData({ ...gigFormData, advance_paid: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-control"
                  value={gigFormData.status}
                  onChange={e => setGigFormData({ ...gigFormData, status: e.target.value })}
                  required
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Advance Paid">Advance Paid</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Hold">Hold</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGigModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Gig Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
