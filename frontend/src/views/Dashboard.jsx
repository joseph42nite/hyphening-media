import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, authFetch } from '../api.js';
import logoImg from '../assets/logo.png';
import {
  Users, Folder, Calendar, Shield, LogOut, FileSpreadsheet,
  X, MessageSquare, FileText, Bell, BellOff, Cpu, Megaphone, Menu, UserPlus, Award
} from 'lucide-react';

import LeadsTab from '../components/dashboard/LeadsTab.jsx';
import TasksTab from '../components/dashboard/TasksTab.jsx';
import FreelancersTab from '../components/dashboard/FreelancersTab.jsx';
import ArtistCurationTab from '../components/dashboard/ArtistCurationTab.jsx';
import ScriptTrackerTab from '../components/dashboard/ScriptTrackerTab.jsx';
import MarketingDataTab from '../components/dashboard/MarketingDataTab.jsx';
import AuditLogsTab from '../components/dashboard/AuditLogsTab.jsx';
import ChatTab from '../components/dashboard/ChatTab.jsx';
import ContentModal from '../components/dashboard/ContentModal.jsx';
import BlogTab from '../components/dashboard/BlogTab.jsx';
import CaseStudiesTab from '../components/dashboard/CaseStudiesTab.jsx';
import ClientsTab from '../components/dashboard/ClientsTab.jsx';
import SeoMonitorTab from '../components/dashboard/SeoMonitorTab.jsx';
import AdsMonitorTab from '../components/dashboard/AdsMonitorTab.jsx';
import { CONTENT_FORM_DEFAULTS, buildContentPayload, buildContentFormState } from '../components/dashboard/contentFormHelper.js';


/** Tabs the server keeps a count for — mirrors BADGED_TABS in tabNotifications.js. */
const BADGED_TABS = ['seo', 'ads', 'scripts', 'tasks', 'blog'];

/**
 * Count badge on a nav tab.
 *
 * One component for every tab so they cannot drift apart visually — the Client
 * Workspace badge already looked like this, and each new one was going to be
 * another copy of the same twenty lines of positioning.
 *
 * Renders nothing at zero: a badge showing 0 is a permanent decoration, and the
 * point is that it appears only when there is something to do.
 */
function TabBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      position: 'absolute',
      top: '-6px',
      right: '-4px',
      background: 'var(--accent)',
      color: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '9999px',
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      fontSize: '0.65rem',
      fontWeight: '800',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(224, 35, 28, 0.5)',
      zIndex: 20,
      pointerEvents: 'none',
      whiteSpace: 'nowrap'
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

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

  const userRole = auth?.role || 'ops_video_editor';
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const isSMM = userRole === 'ops_social_media_manager';
  const isVideoEditor = userRole === 'ops_video_editor';
  
  // Tab states
  const [activeTab, setActiveTab] = useState('calendar');
  const [leadRemindersCount, setLeadRemindersCount] = useState(0);
  const [leadRemindersDismissed, setLeadRemindersDismissed] = useState(false);
  
  // Data states
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(25);
  const [totalAuditLogs, setTotalAuditLogs] = useState(0);
  const [artists, setArtists] = useState([]);
  const [venues, setVenues] = useState([]);
  const [gigs, setGigs] = useState([]);

  // Selected client for marketing reports
  const [selectedClientForReports, setSelectedClientForReports] = useState({ id: 'all', name: 'All Clients' });
  const [allClientsOverview, setAllClientsOverview] = useState([]);
  const [overviewMonths, setOverviewMonths] = useState([]);
  const [overviewMonth, setOverviewMonth] = useState('');
  const [marketingContent, setMarketingContent] = useState([]);
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [availableAdMonths, setAvailableAdMonths] = useState([]);
  const [selectedAdMonth, setSelectedAdMonth] = useState('');
  const [adLeadTotals, setAdLeadTotals] = useState(null);
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

  // Per-tab badge counts from /api/notifications/tabs. Replaces the daily
  // Telegram digests: visible only while the work exists, and gone once it is
  // done, rather than pushed every morning regardless.
  const [tabCounts, setTabCounts] = useState({});

  const fetchLeadReminders = async () => {
    try {
      const res = await authFetch('/api/leads/reminders');
      if (!res.ok) return;
      const data = await res.json();
      const todayStr = new Date().toLocaleDateString('en-CA');
      const isAfter12PM = new Date().getHours() >= 12;
      const activeReminders = (data.leads || []).filter(l => {
        if (!l.follow_up_date) return false;
        if (l.follow_up_date < todayStr) return true;
        if (l.follow_up_date === todayStr) return isAfter12PM;
        return false;
      });
      setLeadRemindersCount(activeReminders.length);
    } catch {
      // Affordance
    }
  };

  const fetchTabCounts = async () => {
    try {
      const res = await authFetch('/api/notifications/tabs');
      if (!res.ok) return;
      const data = await res.json();
      setTabCounts(data.tabs || {});
    } catch {
      // Badges are an affordance; a failed fetch just leaves them as they were.
    }
  };

  /**
   * Opening a tab dismisses its badge for good — the server records the moment,
   * and the count restarts at 1 the next time something new shows up (a client
   * replies to a script, an audit ages out, a task goes overdue). This used to
   * be a `viewedTabs` object in React state, which lost the dismissal on every
   * reload and, worse, hid the badge for the rest of the session so genuinely
   * new work never showed at all.
   *
   * The response carries the recomputed counts, so the badge clears in one
   * round trip instead of waiting for the next poll.
   */
  const markTabSeen = async (tabName) => {
    if (!BADGED_TABS.includes(tabName)) return;
    setTabCounts(prev => ({ ...prev, [tabName]: 0 }));
    try {
      const res = await authFetch(`/api/notifications/tabs/${tabName}/seen`, {
        method: 'POST'
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.tabs) setTabCounts(data.tabs);
    } catch {
      // The optimistic clear above stands until the next poll corrects it.
    }
  };

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    if (tabName === 'leads') {
      setLeadRemindersDismissed(true);
    }
    if (tabName === 'scripts') {
      if (selectedScriptClient) fetchMarketingData(selectedScriptClient.id);
      const pendingScript = (marketingScripts || []).find(s => s.has_unseen_changes === 1 || s.content_status === 'Pending Client Approval');
      if (pendingScript && pendingScript.month) {
        setScriptMonth(pendingScript.month);
      }
    }
  };

  // Nothing to badge on the tab you are already looking at.
  const getTabBadgeCount = (tabName, count) => (activeTab === tabName ? 0 : count || 0);

  // SSE State
  const [sseConnected, setSseConnected] = useState(false);

  // Search/Filters
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);

  // Calendar states
  const [calendarClientFilter, setCalendarClientFilter] = useState('');
  const [calendarMarketingContent, setCalendarMarketingContent] = useState([]);

  // Modals state
  const [showContentModal, setShowContentModal] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [contentFormData, setContentFormData] = useState({ ...CONTENT_FORM_DEFAULTS });

  // Script Tracker states
  const [selectedScriptClient, setSelectedScriptClient] = useState(null);
  const [scriptMonth, setScriptMonth] = useState(new Date().toISOString().substring(0, 7));

  // Refs to avoid closing EventSource connection when selected client / client list changes
  const selectedClientForReportsRef = useRef(selectedClientForReports);
  selectedClientForReportsRef.current = selectedClientForReports;

  const selectedScriptClientRef = useRef(selectedScriptClient);
  selectedScriptClientRef.current = selectedScriptClient;

  const selectedChatClientRef = useRef(selectedChatClient);
  selectedChatClientRef.current = selectedChatClient;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  const chatContainerRef = useRef(null);

  // Auto-scroll only the chat messages container (not the page)
  // Badge counts: whenever the tab changes and on a slow timer for anything
  // that changes server-side. Opening a badged tab marks it seen first — that
  // call returns the fresh counts, so the plain fetch is only for the others.
  useEffect(() => {
    fetchLeadReminders();
    if (BADGED_TABS.includes(activeTab)) {
      markTabSeen(activeTab);
    } else {
      fetchTabCounts();
    }
    const t = setInterval(() => {
      fetchTabCounts();
      fetchLeadReminders();
    }, 120000);
    return () => { clearInterval(t); };
  }, [activeTab]);

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

  // Clear unseen counts when active client or active tab changes
  useEffect(() => {
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
    fetchFreelancers();
    if (isAdmin || isSMM) {
      fetchCurationData();
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

    es.addEventListener('content_approved', () => {
      showToast(`Content approved by client!`, 'success');
      if (selectedClientForReportsRef.current) {
        fetchMarketingData(selectedClientForReportsRef.current.id);
      }
      fetchCalendarMarketingContent();
    });

    es.addEventListener('script_updated', () => {
      if (selectedScriptClientRef.current) {
        fetchMarketingData(selectedScriptClientRef.current.id);
      }
      fetchTabCounts();
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
          if (marketingClients.length > 0) {
            if (!selectedClientForReports || (selectedClientForReports.id !== 'all' && !marketingClients.some(c => c.id === selectedClientForReports.id))) {
              const allClientsOption = { id: 'all', name: 'All Clients' };
              setSelectedClientForReports(allClientsOption);
              fetchMarketingData('all');
            } else if (selectedClientForReports.id === 'all') {
              fetchMarketingData('all');
            }
            // Scripts stay closed to video editors, so there is no client to preselect.
            if (!isVideoEditor && (!selectedScriptClient || !marketingClients.some(c => c.id === selectedScriptClient.id))) {
              setSelectedScriptClient(marketingClients[0]);
            }
          } else {
            setSelectedClientForReports({ id: 'all', name: 'All Clients' });
            setSelectedScriptClient(null);
          }
          if (!selectedChatClient || !allClients.some(c => c.id === selectedChatClient.id)) {
            setSelectedChatClient(allClients[0]);
            fetchChats(allClients[0].id);
          }
        } else {
          setSelectedClientForReports({ id: 'all', name: 'All Clients' });
          setSelectedScriptClient(null);
          setSelectedChatClient(null);
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

  // The leaderboard's period is its own: it spans every client, so it has no
  // reason to move when the single-client ad month does.
  const fetchAllClientsOverview = async (month = overviewMonth) => {
    const oRes = await authFetch(`/api/clients/marketing/all-overview${month ? `?month=${month}` : ''}`);
    if (!oRes.ok) return;
    const oData = await oRes.json();
    setAllClientsOverview(oData.overview || []);
    if (oData.available_months?.length > 0) setOverviewMonths(oData.available_months);
    // Mirror the month the server applied, so the label can never claim a
    // period the numbers below it don't belong to.
    setOverviewMonth(oData.selected_month ?? '');
  };

  const fetchMarketingData = async (clientId, monthFilter = selectedAdMonth) => {
    try {
      if (clientId === 'all') {
        await fetchAllClientsOverview();
        return;
      }
      const cRes = await authFetch(`/api/clients/${clientId}/marketing/content`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setMarketingContent(cData.content || []);
      }
      const adUrl = `/api/clients/${clientId}/marketing/ads${monthFilter ? `?month=${monthFilter}` : ''}`;
      const adRes = await authFetch(adUrl);
      if (adRes.ok) {
        const adData = await adRes.json();
        setAdCampaigns(adData.ads || []);
        setAdLeadTotals(adData.lead_totals || null);
        if (adData.available_months && adData.available_months.length > 0) {
          setAvailableAdMonths(adData.available_months);
        }
        // Always mirror the month the server actually applied, so the selector label
        // can never claim a month the numbers below it don't belong to.
        if (adData.selected_month) {
          setSelectedAdMonth(adData.selected_month);
        }
      }
      const rRes = await authFetch(`/api/clients/${clientId}/marketing/monthly`);
      if (rRes.ok) {
        const rData = await rRes.json();
        setMonthlyReports(rData.reports || []);
      }
      // Scripts stay closed to video editors.
      if (!isVideoEditor) {
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

  // --- CONTENT TRACKER MANUAL CRUD ---
  const openContentModal = (content = null, defaultDate = null) => {
    if (content) {
      setEditingContent(content);
      const client = clients.find(c => c.id === content.client_id);
      if (client) {
        setSelectedClientForReports(client);
        fetchMarketingData(client.id);
      }
      setContentFormData(buildContentFormState(content));
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
        ...CONTENT_FORM_DEFAULTS,
        date: defaultDate || new Date().toISOString().split('T')[0],
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

    const bodyData = buildContentPayload(contentFormData);

    try {
      const res = await authFetch(url, {
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

  const handleDeleteContent = async (contentId, skipConfirm = false) => {
    if (!selectedClientForReports || !contentId) return;
    if (!skipConfirm && !window.confirm('Are you sure you want to delete this content item? This action cannot be undone.')) return;

    try {
      const res = await authFetch(`/api/clients/${selectedClientForReports.id}/marketing/content/${contentId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete content item');

      showToast('Content item deleted successfully', 'success');
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

  return (
    <div className="dashboard-wrapper">
      {/* Kyoto Ambient Atmospheric Layers */}
      <div className="dashboard-ambient-glow" />
      <div className="dashboard-vignette" />

      {/* Top Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <div className="dashboard-header-left">
            <span
              onClick={() => navigate('/dashboard')}
              style={{ display: 'flex', alignItems: 'center', height: '40px', cursor: 'pointer' }}
            >
              <img src={logoImg} alt="Hyphening Media" style={{ height: '80px', width: 'auto' }} />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: sseConnected ? 'var(--success)' : 'var(--danger)',
                boxShadow: sseConnected ? '0 0 10px rgba(16, 185, 129, 0.7)' : '0 0 10px rgba(224, 35, 28, 0.7)'
              }} />
              <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>{sseConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
            </div>
          </div>

          {/* Desktop Header Actions */}
          <div className="dashboard-header-right dashboard-header-desktop-right">
            <button 
              onClick={notificationPermission === 'default' ? handleRequestPermission : toggleSound}
              className={`btn ${soundEnabled && notificationPermission === 'granted' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ 
                padding: '8px 14px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                cursor: 'pointer',
                fontSize: '0.82rem'
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

            <div className="dashboard-user-info">
              <div className="dashboard-user-name">{auth?.name}</div>
              <div className="dashboard-user-role">
                {userRole.replace('ops_', '').replace('_', ' ')}
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary btn-logout">
              <LogOut size={16} /> <span>Logout</span>
            </button>
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <button 
            className="dashboard-mobile-menu-toggle"
            onClick={() => setMobileHeaderMenuOpen(!mobileHeaderMenuOpen)}
            aria-label="Toggle user menu"
          >
            {mobileHeaderMenuOpen ? <X size={20} strokeWidth={3} /> : <Menu size={20} strokeWidth={3} />}
          </button>
        </div>

        {/* Mobile Drawer Dropdown Menu */}
        {mobileHeaderMenuOpen && (
          <div className="dashboard-mobile-drawer">
            <div className="dashboard-mobile-drawer-user">
              <div>
                <div className="dashboard-mobile-drawer-name">{auth?.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{auth?.email}</div>
              </div>
              <span className="dashboard-mobile-drawer-role">
                {userRole.replace('ops_', '').replace('_', ' ')}
              </span>
            </div>

            <button 
              onClick={() => {
                if (notificationPermission === 'default') handleRequestPermission();
                else toggleSound();
              }}
              className={`btn ${soundEnabled && notificationPermission === 'granted' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ 
                padding: '10px 14px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '8px', 
                width: '100%',
                fontSize: '0.85rem'
              }}
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

            <button 
              onClick={handleLogout} 
              className="btn btn-secondary" 
              style={{ width: '100%', justifyContent: 'center', background: 'rgba(224, 35, 28, 0.15)', color: '#ff6b6b', borderColor: 'rgba(224, 35, 28, 0.4)', fontWeight: 'bold', height: '40px' }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        )}
      </header>

      {/* Tabs Menu */}
      <div className="dashboard-tabs">
        {/* 1. Calendar */}
        <button onClick={() => handleTabClick('calendar')} className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}>
          <Calendar size={16} /> Calendar
        </button>

        {/* 2. Client Workspace */}
        <button 
          onClick={() => handleTabClick('client-workspaces')} 
          className={`btn ${activeTab === 'client-workspaces' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <MessageSquare size={16} /> Client Workspace
          <TabBadge count={getTabBadgeCount('client-workspaces', Object.values(unseenCounts).reduce((a, c) => a + (c || 0), 0))} />
        </button>

        {/* 3. Marketing Data */}
        {(isAdmin || isSMM || isVideoEditor) && (
          <button onClick={() => handleTabClick('reports')} className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}>
            <FileSpreadsheet size={16} /> Marketing Data
          </button>
        )}

        {/* SEO Monitor */}
        {(isAdmin || isSMM) && (
          <button onClick={() => handleTabClick('seo')} className={`btn ${activeTab === 'seo' ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'relative', overflow: 'visible' }} title={tabCounts.seo ? `${tabCounts.seo} audit(s) due` : undefined}>
            <Cpu size={16} /> SEO Monitor
            <TabBadge count={getTabBadgeCount('seo', tabCounts.seo)} />
          </button>
        )}

        {/* Ads Monitor */}
        {(isAdmin || isSMM) && (
          <button onClick={() => handleTabClick('ads')} className={`btn ${activeTab === 'ads' ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'relative', overflow: 'visible' }} title={tabCounts.ads ? `${tabCounts.ads} ads action(s) waiting` : undefined}>
            <Megaphone size={16} /> Ads Monitor
            <TabBadge count={getTabBadgeCount('ads', tabCounts.ads)} />
          </button>
        )}

        {/* 4. Scripts */}
        {(isAdmin || isSMM) && (
          <button onClick={() => handleTabClick('scripts')} className={`btn ${activeTab === 'scripts' ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'relative', overflow: 'visible' }} title={tabCounts.scripts ? `${tabCounts.scripts} script change(s) pending review` : undefined}>
            <FileText size={16} /> Scripts
            <TabBadge count={getTabBadgeCount('scripts', tabCounts.scripts)} />
          </button>
        )}

        {/* 5. Artist Curation */}
        {(isAdmin || isSMM) && (
          <button onClick={() => handleTabClick('curation')} className={`btn ${activeTab === 'curation' ? 'btn-primary' : 'btn-secondary'}`}>
            <Calendar size={16} /> Artist Curation
          </button>
        )}

        {/* 6. Leads */}
        <button 
          onClick={() => {
            handleTabClick('leads');
            setLeadRemindersDismissed(true);
          }} 
          className={`btn ${activeTab === 'leads' ? 'btn-primary' : 'btn-secondary'}`} 
          style={{ position: 'relative', overflow: 'visible' }} 
          title={!leadRemindersDismissed && leadRemindersCount ? `${leadRemindersCount} lead follow-up reminder(s)` : undefined}
        >
          <UserPlus size={16} /> Leads
          <TabBadge count={leadRemindersDismissed ? 0 : leadRemindersCount} />
        </button>

        {/* 7. Blogs */}
        {isAdmin && (
          <button onClick={() => handleTabClick('blog')} className={`btn ${activeTab === 'blog' ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'relative', overflow: 'visible' }} title={tabCounts.blog ? `${tabCounts.blog} draft post(s)` : undefined}>
            <FileText size={16} /> Blogs
            <TabBadge count={getTabBadgeCount('blog', tabCounts.blog)} />
          </button>
        )}

        {/* 7b. Case Studies */}
        {isAdmin && (
          <button onClick={() => handleTabClick('casestudies')} className={`btn ${activeTab === 'casestudies' ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'relative', overflow: 'visible' }}>
            <Award size={16} /> Case Studies
          </button>
        )}

        {/* 8. Clients */}
        {isAdmin && (
          <button onClick={() => handleTabClick('clients')} className={`btn ${activeTab === 'clients' ? 'btn-primary' : 'btn-secondary'}`}>
            <Folder size={16} /> Clients
          </button>
        )}

        {/* 9. Freelancers */}
        {isAdmin && (
          <button onClick={() => handleTabClick('freelancers')} className={`btn ${activeTab === 'freelancers' ? 'btn-primary' : 'btn-secondary'}`}>
            <Users size={16} /> Freelancers
          </button>
        )}


        {/* 10. Audit Log */}
        {isAdmin && (
          <button onClick={() => handleTabClick('audit')} className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}>
            <Shield size={16} /> Audit Log
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

        {activeTab === 'leads' && (
          <LeadsTab
            auth={auth}
            showToast={showToast}
            onRemindersCountChange={setLeadRemindersCount}
            remindersDismissed={leadRemindersDismissed}
            onDismissReminders={() => setLeadRemindersDismissed(true)}
          />
        )}

        {activeTab === 'calendar' && (
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
            venues={venues}
            fetchCurationData={fetchCurationData}
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
            fetchTabCounts={fetchTabCounts}
          />
        )}

        {activeTab === 'reports' && (
          <MarketingDataTab
            auth={auth}
            clients={clients}
            allClientsOverview={allClientsOverview}
            overviewMonths={overviewMonths}
            overviewMonth={overviewMonth}
            onOverviewMonthChange={fetchAllClientsOverview}
            marketingContent={marketingContent}
            adCampaigns={adCampaigns}
            availableAdMonths={availableAdMonths}
            selectedAdMonth={selectedAdMonth}
            setSelectedAdMonth={setSelectedAdMonth}
            adLeadTotals={adLeadTotals}
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
            freelancers={freelancers}
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

        {/* CASE STUDIES TAB */}
        {activeTab === 'casestudies' && (
          <CaseStudiesTab showToast={showToast} />
        )}

        {/* SEO MONITOR TAB */}
        {activeTab === 'seo' && (isAdmin || isSMM) && (
          <SeoMonitorTab
            auth={auth}
            clients={clients}
            showToast={showToast}
          />
        )}

        {/* ADS MONITOR TAB */}
        {activeTab === 'ads' && (isAdmin || isSMM) && (
          <AdsMonitorTab
            auth={auth}
            clients={clients}
            showToast={showToast}
          />
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
          handleDeleteContent={handleDeleteContent}
          clients={clients}
          staffUsers={staffUsers}
          marketingScripts={marketingScripts}
          freelancers={freelancers}
        />
      )}


    </div>
  );
}
