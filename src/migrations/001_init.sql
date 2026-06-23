-- Marketing Ops Center — Initial Schema
-- Migration: 001_init.sql

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'ops_video_editor', 'ops_social_media_manager')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SESSIONS (refresh token tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ============================================================
-- CRM CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'marketing' CHECK (client_type IN ('marketing', 'artist_curation', 'both')),
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  calendar_sync_link TEXT,
  drive_folder_link TEXT,
  
  -- API credentials (encrypted at application layer)
  instagram_access_token_enc TEXT,
  instagram_business_account_id TEXT,
  youtube_channel_id TEXT,
  youtube_api_key_enc TEXT,
  google_ads_customer_id TEXT,
  
  -- API health tracking
  consecutive_api_failures INTEGER DEFAULT 0,
  api_status TEXT DEFAULT 'active' CHECK (api_status IN ('active', 'warning', 'error')),
  last_metric_fetch_at TEXT,
  
  -- Portal
  portal_token TEXT UNIQUE,
  portal_enabled INTEGER DEFAULT 0,
  portal_pin TEXT,
  portal_last_accessed_at TEXT,
  
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- FREELANCERS
-- ============================================================
CREATE TABLE IF NOT EXISTS freelancers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  telegram_chat_id TEXT,
  specialization TEXT,
  rate_per_video REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- KANBAN TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS kanban_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN (
    'backlog', 'todo', 'in_progress', 'review', 'revision', 'approved', 'delivered', 'cancelled'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  task_type TEXT DEFAULT 'video' CHECK (task_type IN ('video', 'graphic', 'social', 'other')),
  assigned_to INTEGER,
  due_date TEXT,
  completed_at TEXT,
  
  -- Video workflow specific
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 3,
  drive_link TEXT,
  
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES freelancers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON kanban_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON kanban_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON kanban_tasks(assigned_to);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  diff TEXT, -- JSON string of changes
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);

-- ============================================================
-- OPENCLAW OPERATIONAL KNOWLEDGE
-- ============================================================
CREATE TABLE IF NOT EXISTS openclaw_operational_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  knowledge_type TEXT NOT NULL,
  content TEXT NOT NULL, -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CALENDAR EVENTS (synced from Google Calendar)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  google_event_id TEXT,
  title TEXT,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  location TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_client ON calendar_events(client_id);

-- ============================================================
-- MARKETING CONTENT TRACKER
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_content_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT CHECK (platform IN ('instagram', 'youtube')),
  media_id TEXT,
  date TEXT,
  post_type TEXT CHECK (post_type IN ('Story', 'Static', 'Carousel', 'Reel', 'Youtube', 'Short')),
  title TEXT,
  script TEXT,
  status TEXT DEFAULT 'Draft' CHECK (status IN (
    'Draft', 'Pending Client Approval', 'Client Approved', 'Client Rejected', 'Posted', 'Pending'
  )),
  client_comments TEXT,
  client_approved INTEGER DEFAULT 0,
  is_tracked INTEGER DEFAULT 1,
  metric_override TEXT, -- JSON: {"views": true, "likes": true}
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'api_discovered', 'migration')),
  
  -- Metrics
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  avg_watch_time_pct REAL,
  
  -- Auto-computed (set by backend)
  skip_rate_pct REAL,
  engagement_rate_pct REAL,
  save_rate_pct REAL,
  content_score REAL,
  
  boosted TEXT DEFAULT 'No',
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_client ON marketing_content_tracker(client_id);
CREATE INDEX IF NOT EXISTS idx_content_platform ON marketing_content_tracker(platform);
CREATE INDEX IF NOT EXISTS idx_content_tracked ON marketing_content_tracker(is_tracked);

-- ============================================================
-- MARKETING MONTHLY REPORT
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_monthly_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- 'YYYY-MM'
  website_traffic INTEGER,
  map_views INTEGER,
  mom_growth_sessions REAL,
  mom_growth_gmb_views REAL,
  ai_overview_visible TEXT DEFAULT 'No' CHECK (ai_overview_visible IN ('Yes', 'No')),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE,
  UNIQUE(client_id, month)
);

-- ============================================================
-- MARKETING AD CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_ad_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  platform TEXT CHECK (platform IN ('YouTube', 'Meta', 'Google')),
  ad_campaign_name TEXT,
  leads INTEGER DEFAULT 0,
  total_ad_spend_inr REAL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  
  -- Auto-computed (set by backend)
  ctr_pct REAL,
  cpc_inr REAL,
  cpl_inr REAL,
  revenue_generated REAL DEFAULT 0,
  roas REAL,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ads_client ON marketing_ad_campaigns(client_id);

-- ============================================================
-- CLIENT PORTAL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS client_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  request_type TEXT DEFAULT 'feedback',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE
);

-- ============================================================
-- ARTISTS (Roster)
-- ============================================================
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id TEXT UNIQUE NOT NULL, -- Format: UPPER(LEFT(name,3)) + RIGHT(phone,4)
  name TEXT NOT NULL,
  category TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  telegram_chat_id TEXT,
  bank_details_enc TEXT, -- AES-256-GCM encrypted
  is_active INTEGER DEFAULT 1,
  
  -- Roster rollups (auto-calculated)
  total_performances INTEGER DEFAULT 0,
  average_fee_inr REAL DEFAULT 0,
  total_amount_paid_inr REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'No Records',
  reliability_score REAL,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- GIG STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS gig_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  artist_id INTEGER NOT NULL,
  venue_id INTEGER,
  planning_cycle_id INTEGER,
  gig_date TEXT NOT NULL,
  fee_inr REAL DEFAULT 0,
  advance_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Paid', 'Pending', 'Advance Paid', 'Cancelled', 'Hold', 'Confirmed')),
  confirmation_token TEXT,
  token_expires_at TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
  FOREIGN KEY (planning_cycle_id) REFERENCES artist_planning_cycles(id) ON DELETE SET NULL
);

-- ============================================================
-- VENUES
-- ============================================================
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  map_link TEXT,
  poc_name TEXT,
  poc_phone TEXT,
  gig_confirmed_message TEXT, -- Template for Telegram DM
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ARTIST PLANNING CYCLES
-- ============================================================
CREATE TABLE IF NOT EXISTS artist_planning_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_label TEXT NOT NULL, -- e.g. "July 2024 - Cycle 1"
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'admin_approved', 'finalised', 'completed')),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- OPENCLAW WEBHOOK NONCES (replay prevention)
-- ============================================================
CREATE TABLE IF NOT EXISTS openclaw_nonces (
  nonce TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- MIGRATION METADATA (for Python script version checking)
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO migration_metadata (key, value) VALUES ('schema_version', '1');
