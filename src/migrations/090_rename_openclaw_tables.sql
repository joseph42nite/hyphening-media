-- Migration 090: Rename OpenClaw tables to generic agent/webhook names
-- 1. Pending Actions
ALTER TABLE openclaw_pending_actions RENAME TO pending_actions;
CREATE VIEW IF NOT EXISTS openclaw_pending_actions AS SELECT * FROM pending_actions;

-- 2. Skills Inventory
ALTER TABLE openclaw_skills RENAME TO agent_skills;
CREATE VIEW IF NOT EXISTS openclaw_skills AS SELECT * FROM agent_skills;

-- 3. Skill Reports
ALTER TABLE openclaw_skill_reports RENAME TO agent_skill_reports;
CREATE VIEW IF NOT EXISTS openclaw_skill_reports AS SELECT * FROM agent_skill_reports;

-- 4. Operational Knowledge
ALTER TABLE openclaw_operational_knowledge RENAME TO agent_operational_knowledge;
CREATE VIEW IF NOT EXISTS openclaw_operational_knowledge AS SELECT * FROM agent_operational_knowledge;

-- 5. Activity Log
ALTER TABLE openclaw_activity_log RENAME TO agent_activity_log;
CREATE VIEW IF NOT EXISTS openclaw_activity_log AS SELECT * FROM agent_activity_log;

-- 6. Webhook Replay Nonces
ALTER TABLE openclaw_nonces RENAME TO webhook_nonces;
CREATE VIEW IF NOT EXISTS openclaw_nonces AS SELECT * FROM webhook_nonces;
