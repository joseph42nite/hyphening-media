-- CRM Clients: Standardized Multi-Platform Account References
ALTER TABLE crm_clients ADD COLUMN composio_entity_id TEXT;
ALTER TABLE crm_clients ADD COLUMN facebook_page_id TEXT;
ALTER TABLE crm_clients ADD COLUMN linkedin_organization_id TEXT;
ALTER TABLE crm_clients ADD COLUMN x_account_id TEXT;

-- Content Tracker: Standardized Multi-Platform Post IDs & Metadata
ALTER TABLE marketing_content_tracker ADD COLUMN scheduled_at DATETIME;
ALTER TABLE marketing_content_tracker ADD COLUMN platform_post_id TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN linkedin_post_id TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN x_tweet_id TEXT;
ALTER TABLE marketing_content_tracker ADD COLUMN platform_metadata TEXT;

-- Composio Quota Monitoring & Budget Management
CREATE TABLE IF NOT EXISTS sys_composio_quota_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_name TEXT NOT NULL,
    client_id INTEGER,
    called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    remaining_quota INTEGER
);
