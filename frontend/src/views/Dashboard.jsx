import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Folder, Calendar, DollarSign, Clock, CheckSquare, 
  Layers, Shield, LogOut, RefreshCw, FileSpreadsheet, Plus, 
  Search, Share2, FileDown, Eye, HelpCircle, Check, X, ShieldAlert,
  AlertTriangle, Play, MessageSquare
} from 'lucide-react';

export default function Dashboard({ auth, setAuth, showToast }) {
  const navigate = useNavigate();
  const userRole = auth?.role || 'ops_video_editor';
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const isSuperAdmin = userRole === 'super_admin';
  const isSMM = userRole === 'ops_social_media_manager';
  
  // Tab states
  const [activeTab, setActiveTab] = useState(isAdmin ? 'tasks' : (isSMM ? 'review-queue' : 'tasks'));
  
  // Data states
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
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

  const [showArtistModal, setShowArtistModal] = useState(false);
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistFormData, setArtistFormData] = useState({
    name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: ''
  });

  const [showContentModal, setShowContentModal] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [contentFormData, setContentFormData] = useState({
    platform: 'instagram',
    date: '',
    post_type: 'Reel',
    title: '',
    script: '',
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
    youtube_ctr: ''
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

  const [showGigModal, setShowGigModal] = useState(false);
  const [gigFormData, setGigFormData] = useState({
    client_id: '', artist_id: '', venue_id: '', planning_cycle_id: '', gig_date: '', fee_inr: 0, status: 'Pending'
  });

  // Decrypted bank details caching
  const [decryptedBank, setDecryptedBank] = useState({});

  useEffect(() => {
    if (!auth) {
      navigate('/login');
      return;
    }
    
    // Connect SSE
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
      if (selectedClientForReports) {
        fetchMarketingData(selectedClientForReports.id);
      }
    });

    es.addEventListener('client_feedback', (e) => {
      const data = JSON.parse(e.data);
      showToast(`New client request: "${data.message}"`, 'warning');
    });

    es.addEventListener('chat_message', (e) => {
      const data = JSON.parse(e.data);
      if (selectedChatClient && selectedChatClient.id === data.client_id) {
        setChatMessages(prev => [...prev, data.message]);
      } else {
        const client = clients.find(c => c.id === data.client_id);
        const clientName = client ? client.name : 'Client';
        showToast(`New message in ${clientName} chat: "${data.message.message.substring(0, 30)}..."`, 'info');
      }
    });

    // Load initial data
    fetchTasks();
    if (isAdmin) {
      fetchClients();
      fetchFreelancers();
      fetchAuditLogs();
      fetchCurationData();
    }
    if (isAdmin || isSMM) {
      fetchReviewQueue();
    }

    return () => es.close();
  }, [auth, selectedClientForReports, selectedChatClient, clients]);

  // Core Data Fetching
  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (res.ok) setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      if (res.ok) {
        setClients(data.clients || []);
        if (data.clients?.length > 0) {
          if (!selectedClientForReports) {
            setSelectedClientForReports(data.clients[0]);
            fetchMarketingData(data.clients[0].id);
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
      const res = await fetch(`/api/clients/${clientId}/chats`);
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
      const res = await fetch(`/api/clients/${selectedChatClient.id}/chats`, {
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
      const res = await fetch('/api/freelancers');
      const data = await res.json();
      if (res.ok) setFreelancers(data.freelancers || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (res.ok) setAuditLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCurationData = async () => {
    try {
      // Planning cycles
      const cycleRes = await fetch('/api/artists/planning-cycles');
      if (cycleRes.ok) {
        const cycleData = await cycleRes.json();
        setPlanningCycles(cycleData.planning_cycles || []);
      }
      
      // Artists
      const artistRes = await fetch('/api/artists');
      if (artistRes.ok) {
        const artistData = await artistRes.json();
        setArtists(artistData.artists || []);
      }

      // Venues
      const venueRes = await fetch('/api/artists/venues');
      if (venueRes.ok) {
        const venueData = await venueRes.json();
        setVenues(venueData.venues || []);
      }

      // Gigs
      const gigRes = await fetch('/api/artists/gigs');
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
      const res = await fetch('/api/clients/marketing/review-queue');
      const data = await res.json();
      if (res.ok) setReviewQueue(data.content || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMarketingData = async (clientId) => {
    try {
      const cRes = await fetch(`/api/clients/${clientId}/marketing/content`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setMarketingContent(cData.content || []);
      }
      const adRes = await fetch(`/api/clients/${clientId}/marketing/ads`);
      if (adRes.ok) {
        const adData = await adRes.json();
        setAdCampaigns(adData.ads || []);
      }
      const rRes = await fetch(`/api/clients/${clientId}/marketing/monthly`);
      if (rRes.ok) {
        const rData = await rRes.json();
        setMonthlyReports(rData.reports || []);
      }
    } catch (err) {
      console.error(err);
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

  const handleArtistSubmit = async (e) => {
    e.preventDefault();
    const url = editingArtist ? `/api/artists/${editingArtist.id}` : '/api/artists';
    const method = editingArtist ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artistFormData)
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
        bank_details: '' // Leave blank unless updating
      });
    } else {
      setEditingArtist(null);
      setArtistFormData({
        name: '', category: '', city: '', phone: '', email: '', telegram_chat_id: '', bank_details: ''
      });
    }
    setShowArtistModal(true);
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
  const openContentModal = (content = null) => {
    if (content) {
      setEditingContent(content);
      setContentFormData({
        platform: content.platform || 'instagram',
        date: content.date || '',
        post_type: content.post_type || 'Reel',
        title: content.title || '',
        script: content.script || '',
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
        youtube_ctr: content.youtube_ctr !== null && content.youtube_ctr !== undefined ? String(content.youtube_ctr) : ''
      });
    } else {
      setEditingContent(null);
      setContentFormData({
        platform: 'instagram',
        date: new Date().toISOString().split('T')[0],
        post_type: 'Reel',
        title: '',
        script: '',
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
        youtube_ctr: ''
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
      youtube_ctr: contentFormData.youtube_ctr !== '' ? parseFloat(contentFormData.youtube_ctr) : null
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
    } catch (err) {
      showToast(err.message, 'error');
    }
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

      showToast('Monthly report saved successfully', 'success');
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
  const columns = ['backlog', 'todo', 'in_progress', 'review', 'revision', 'approved', 'delivered'];
  const getTasksByStatus = (status) => {
    return filteredTasks.filter(t => t.status === status);
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
    
    return selectedEvents;
  };

  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h2 style={{ fontSize: '1.4rem', margin: 0, background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Hyphening Ops
          </h2>
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
            <button onClick={() => setActiveTab('review-queue')} className={`btn ${activeTab === 'review-queue' ? 'btn-primary' : 'btn-secondary'}`}>
              <RefreshCw size={16} /> Discovery Queue
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                <div className="glass" style={{ display: 'flex', flexDirection: 'column', height: '400px' }}>
                  <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
                    Internal Chat — {selectedChatClient.name}
                  </h3>
                  
                  {/* Messages container */}
                  <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#f4f4f5', borderRadius: '8px', border: '2px solid #000', marginBottom: '12px' }}>
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
                          <th>Priority</th>
                          <th>Due Date</th>
                          <th>Freelancer</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.filter(t => t.client_id === selectedChatClient.id).length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                              No tasks assigned to this client.
                            </td>
                          </tr>
                        ) : (
                          tasks.filter(t => t.client_id === selectedChatClient.id).map(task => (
                            <tr key={task.id}>
                              <td style={{ fontWeight: 'bold' }}>{task.title}</td>
                              <td>
                                <span className={`badge badge-${task.priority === 'urgent' || task.priority === 'high' ? 'danger' : 'warning'}`}>
                                  {task.priority}
                                </span>
                              </td>
                              <td>{task.due_date || 'No due date'}</td>
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
                                  {freelancers.map(f => (
                                    <option key={f.id} value={f.id}>{f.name} ({f.specialization})</option>
                                  ))}
                                </select>
                              </td>
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
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
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
            <div className="dashboard-toolbar">
              <div className="dashboard-toolbar-search" style={{ display: 'flex', gap: '12px', flexGrow: 1, flexWrap: 'wrap', maxWidth: 'none' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search tasks or client..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  style={{ flexGrow: 1, minWidth: '200px' }}
                />
                <select
                  className="form-control"
                  value={taskClientFilter}
                  onChange={(e) => setTaskClientFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: '180px' }}
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
                        <div key={task.id} className="kanban-card" onClick={() => isAdmin && openTaskModal(task)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>{task.task_type}</span>
                            <span className={`badge badge-${task.priority === 'urgent' || task.priority === 'high' ? 'danger' : 'warning'}`} style={{ fontSize: '0.65rem' }}>
                              {task.priority}
                            </span>
                          </div>
                          <div className="kanban-card-title">{task.title}</div>
                          {task.client_name && (
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                              Client: {task.client_name}
                            </div>
                          )}
                          {task.due_date && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Due: {task.due_date}
                            </div>
                          )}

                          {/* Inline status update select for fast operations */}
                          <div className="kanban-card-footer" onClick={e => e.stopPropagation()}>
                            <select 
                              className="form-control" 
                              value={task.status} 
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

            <div className="workspace-layout" style={{ gridTemplateColumns: '1fr 320px' }}>
              {/* Calendar Grid */}
              <div className="glass" style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '12px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
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
                              className={`calendar-event-tag ${ev.type === 'task' ? 'calendar-event-task' : 'calendar-event-gig'}`}
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
                <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: 0 }}>
                  Agenda: {selectedDateStr ? new Date(selectedDateStr).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Select a date'}
                </h3>

                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {getSelectedDateEvents().length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '60px', fontSize: '0.9rem' }}>
                      No tasks or gigs scheduled for this day.
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
                          <span className={`badge ${ev.type === 'task' ? 'badge-info' : 'badge-warning'}`}>
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
                        {ev.type === 'task' && isAdmin && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.7rem', marginTop: '8px', width: '100%' }}
                            onClick={() => openTaskModal(ev.originalItem)}
                          >
                            Edit Task
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
                    <th>Portal Status</th>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`badge ${client.portal_enabled ? 'badge-success' : 'badge-muted'}`}>
                              {client.portal_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <input
                              type="checkbox"
                              checked={client.portal_enabled === 1}
                              onChange={(e) => togglePortal(client, e.target.checked)}
                            />
                          </div>
                          
                          {client.portal_token && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>URL: /portal/{client.portal_token.substring(0, 8)}...</span>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '2px 4px', fontSize: '0.65rem' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/portal/${client.portal_token}`);
                                  showToast('Copied portal URL to clipboard!', 'success');
                                }}
                              >
                                Copy
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
                          <button onClick={() => generatePortalToken(client)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                            Token
                          </button>
                          <button onClick={() => setPortalPin(client)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                            PIN
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Freelancer Roster</h3>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Specialization</th>
                    <th>Rate/Video</th>
                  </tr>
                </thead>
                <tbody>
                  {freelancers.map(free => (
                    <tr key={free.id}>
                      <td style={{ fontWeight: 'bold' }}>{free.name}</td>
                      <td>{free.email}</td>
                      <td>{free.phone}</td>
                      <td>{free.specialization}</td>
                      <td>₹{free.rate_per_video?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DISCOVERY REVIEW QUEUE TAB */}
        {activeTab === 'review-queue' && (isAdmin || isSMM) && (
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ marginBottom: '16px' }}>Discovered Marketing Media (Review Queue)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
              These assets were automatically discovered on social platforms by client APIs. Approve to track them in performance stats, or discard them.
            </p>

            {reviewQueue.length === 0 ? (
              <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Discovery queue is empty. No new media discovered.
              </div>
            ) : (
              <div className="grid-auto">
                {reviewQueue.map(item => (
                  <div key={item.id} className="glass" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge badge-info">{item.platform}</span>
                      <span className="badge badge-muted">{item.post_type}</span>
                    </div>
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>{item.title}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Views: {item.views?.toLocaleString() || 0}</p>
                    
                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                      <button onClick={() => handleReviewDecision(item.id, true)} className="btn btn-success" style={{ flexGrow: 1, padding: '6px' }}>
                        Track
                      </button>
                      <button onClick={() => handleReviewDecision(item.id, false)} className="btn btn-danger" style={{ flexGrow: 1, padding: '6px' }}>
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <div className="table-container" style={{ marginBottom: '32px' }}>
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
                            <td>{item.date || '-'}</td>
                            <td><span className="badge badge-info">{item.post_type}</span></td>
                            <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.script}>{item.script || '-'}</td>
                            <td>
                              <span className={`badge badge-${
                                item.status === 'Posted' ? 'success' : 
                                (item.status === 'Pending Client Approval' ? 'warning' : 'muted')
                              }`}>
                                {item.status}
                              </span>
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
                            <td>{item.avg_watch_time_pct !== null && item.avg_watch_time_pct !== undefined ? `${item.avg_watch_time_pct}%` : '-'}</td>
                            <td>{item.boosted || 'No'}</td>
                            <td>{item.engagement_rate_pct !== null && item.engagement_rate_pct !== undefined ? `${item.engagement_rate_pct}%` : '-'}</td>
                            <td>{item.save_rate_pct !== null && item.save_rate_pct !== undefined ? `${item.save_rate_pct}%` : '-'}</td>
                            <td style={{ fontWeight: 'bold' }}>{item.content_score || '-'}</td>
                            
                            {/* YouTube */}
                            <td>{item.youtube_views?.toLocaleString() || '0'}</td>
                            <td>{item.youtube_watch_time !== null && item.youtube_watch_time !== undefined ? item.youtube_watch_time.toLocaleString() : '0'}</td>
                            <td>{item.youtube_avg_view_duration || '-'}</td>
                            <td>{item.youtube_ctr !== null && item.youtube_ctr !== undefined ? `${item.youtube_ctr}%` : '0%'}</td>
                            
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
                <div className="table-container" style={{ marginBottom: '32px' }}>
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
                            <td>{ad.ctr_pct}%</td>
                            <td>₹{ad.cpl_inr}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{ad.roas}x</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* SEO Monthly Reports Form */}
                {(isAdmin || isSMM) && (
                  <form onSubmit={handleMonthlyReportSubmit} className="glass" style={{ padding: '16px', marginBottom: '20px', background: '#fff', border: '2px solid #000', boxShadow: '4px 4px 0px #000' }}>
                    <h4 style={{ margin: '0 0 16px 0', borderBottom: '2px solid #000', paddingBottom: '8px' }}>Add/Update SEO & GMB Monthly Data</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Month (YYYY-MM)</label>
                        <input 
                          type="month" 
                          className="form-control" 
                          value={monthlyFormData.month}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, month: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Website Clicks</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. 7.89k"
                          value={monthlyFormData.website_clicks}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, website_clicks: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Website Traffic</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 16000"
                          value={monthlyFormData.website_traffic}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, website_traffic: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>GMB Views</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 52000"
                          value={monthlyFormData.gmb_views}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_views: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Map Views</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 35000"
                          value={monthlyFormData.map_views}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, map_views: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>GMB Clicks</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 1200"
                          value={monthlyFormData.gmb_clicks}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, gmb_clicks: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>On Page Score</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. 85/100"
                          value={monthlyFormData.on_page_score}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, on_page_score: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Off Page</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 45"
                          value={monthlyFormData.off_page}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, off_page: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Blogs</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 4"
                          value={monthlyFormData.blogs}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, blogs: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Calls</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 150"
                          value={monthlyFormData.calls}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, calls: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Directions</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 450"
                          value={monthlyFormData.directions}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, directions: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Reviews</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 12"
                          value={monthlyFormData.reviews}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, reviews: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Avg. Rating</label>
                        <input 
                          type="number" 
                          step="0.1" 
                          min="1" 
                          max="5"
                          className="form-control" 
                          placeholder="e.g. 4.8"
                          value={monthlyFormData.avg_rating}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, avg_rating: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Top 3 Keywords</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="keyword1, keyword2..."
                          value={monthlyFormData.top_keywords}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, top_keywords: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>DA</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 32"
                          value={monthlyFormData.da}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, da: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>AI Overview Visible?</label>
                        <select 
                          className="form-control"
                          value={monthlyFormData.ai_overview_visible}
                          onChange={e => setMonthlyFormData({ ...monthlyFormData, ai_overview_visible: e.target.value })}
                          style={{ padding: '6px', fontSize: '0.8rem' }}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
                          Submit Report
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* SEO Monthly Reports Table */}
                <h3 style={{ marginBottom: '12px', marginTop: '32px' }}>SEO & GMB Monthly Reports</h3>
                <div className="table-container" style={{ marginBottom: '32px' }}>
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
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReports.length === 0 ? (
                        <tr>
                          <td colSpan="18" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No monthly reports available.
                          </td>
                        </tr>
                      ) : (
                        monthlyReports.map(item => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 'bold' }}>{item.month}</td>
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
                            <td>{item.mom_growth_sessions !== null && item.mom_growth_sessions !== undefined ? `${(item.mom_growth_sessions * 100).toFixed(2)}%` : '-'}</td>
                            <td>{item.mom_growth_gmb_views !== null && item.mom_growth_gmb_views !== undefined ? `${(item.mom_growth_gmb_views * 100).toFixed(2)}%` : '-'}</td>
                            <td>
                              <span className={`badge badge-${item.ai_overview_visible === 'Yes' ? 'success' : 'muted'}`}>
                                {item.ai_overview_visible || 'No'}
                              </span>
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
            
            {/* Planning Cycles */}
            <h3 style={{ marginBottom: '12px' }}>Curation Planning Cycles</h3>
            <div className="table-container" style={{ marginBottom: '32px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Cycle Label</th>
                    <th>Date Range</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {planningCycles.map(cycle => (
                    <tr key={cycle.id}>
                      <td style={{ fontWeight: 'bold' }}>{cycle.cycle_label}</td>
                      <td>{cycle.start_date} to {cycle.end_date}</td>
                      <td>
                        <span className={`badge badge-${cycle.status === 'completed' || cycle.status === 'finalised' ? 'success' : 'warning'}`}>
                          {cycle.status}
                        </span>
                      </td>
                      <td>
                        {cycle.status === 'open' && (
                          <button onClick={() => finalizePlanningCycle(cycle.id)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Finalize Assignments
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>City</th>
                    <th>Contact Info</th>
                    <th>Bank Details</th>
                    <th>Rollups</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map(art => (
                    <tr key={art.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{art.artist_id}</td>
                      <td style={{ fontWeight: 'bold' }}>{art.name}</td>
                      <td>{art.category}</td>
                      <td>{art.city}</td>
                      <td>
                        <div>{art.phone}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{art.email}</div>
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
                      <td>
                        <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>Gigs: {art.total_performances}</span>
                          <span>Reliability: {art.reliability_score ? `${art.reliability_score}%` : 'N/A'}</span>
                          <span>Payment: {art.payment_status}</span>
                        </div>
                      </td>
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
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem' }}>{log.created_at}</td>
                      <td style={{ fontWeight: '500' }}>{log.actor_email || 'System'}</td>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td>{log.entity_type} #{log.entity_id}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{log.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* --- MODALS --- */}
      
      {/* Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                  <label className="form-label">Assignee</label>
                  <select
                    className="form-control"
                    value={taskFormData.assigned_to}
                    onChange={e => setTaskFormData({...taskFormData, assigned_to: e.target.value})}
                  >
                    <option value="">Select Freelancer</option>
                    {freelancers.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.specialization})</option>
                    ))}
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
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: '700px' }}>
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
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left' }}>
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

              <div className="form-group">
                <label className="form-label">Telegram Chat ID</label>
                <input
                  type="text"
                  className="form-control"
                  value={artistFormData.telegram_chat_id}
                  onChange={e => setArtistFormData({...artistFormData, telegram_chat_id: e.target.value})}
                />
              </div>

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
          <div className="modal-content glass-premium" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
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
                    <option value="Pending Client Approval">Pending Client Approval</option>
                    <option value="Client Approved">Client Approved</option>
                    <option value="Client Rejected">Client Rejected</option>
                    <option value="Posted">Posted</option>
                    <option value="Pending">Pending</option>
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
                  <label className="form-label">Script</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={contentFormData.script}
                    onChange={e => setContentFormData({ ...contentFormData, script: e.target.value })}
                  />
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

    </div>
  );
}
