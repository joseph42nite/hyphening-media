-- Migration: 094_add_client_blog_pipeline.sql
-- What each client's blog pipeline includes, so a night run reads it instead
-- of a bot working it out. 086 says how a client sounds; this says what gets
-- made and where it goes. Flat columns on crm_clients, same convention as
-- 084/086. Admin-only (PATCH-style PUT /api/clients/:id/blog-pipeline),
-- except the blog_pref_* fields, which the client fills in from the portal
-- as requests: they never switch anything on by themselves.
-- Decisions: 007, 2026-11-03 (vault: Group/Decisions - 2026-11-03 Automation).

-- Where an approved post goes. Picks the publish adapter SOP in the vault.
ALTER TABLE crm_clients ADD COLUMN blog_publish_target TEXT NOT NULL DEFAULT 'handoff'
  CHECK (blog_publish_target IN ('hyphening_webhook', 'cms_api', 'repo_file', 'handoff'));
-- Path of the client's site repo on the Mac that runs the workers. A path, never a credential.
ALTER TABLE crm_clients ADD COLUMN repo_path TEXT;
-- Live blog index, for the duplicate check and internal links.
ALTER TABLE crm_clients ADD COLUMN blog_site_url TEXT;
-- JSON array of language codes, stringified like 086's array fields.
ALTER TABLE crm_clients ADD COLUMN blog_languages TEXT NOT NULL DEFAULT '["en"]';
ALTER TABLE crm_clients ADD COLUMN blog_audio_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN blog_review_required TEXT NOT NULL DEFAULT 'none'
  CHECK (blog_review_required IN ('none', 'client', 'clinician'));
-- healthcare raises the quality bar to 80 and adds the compliance check.
ALTER TABLE crm_clients ADD COLUMN blog_compliance_profile TEXT NOT NULL DEFAULT 'general'
  CHECK (blog_compliance_profile IN ('general', 'healthcare'));
ALTER TABLE crm_clients ADD COLUMN blog_author_name TEXT;
ALTER TABLE crm_clients ADD COLUMN blog_reviewer_name TEXT;
ALTER TABLE crm_clients ADD COLUMN blog_posts_per_month INTEGER NOT NULL DEFAULT 0;
-- No auto-publish option on purpose: no client publishes without 007 (decision 0.3).
ALTER TABLE crm_clients ADD COLUMN blog_publish_mode TEXT NOT NULL DEFAULT 'approve_batch'
  CHECK (blog_publish_mode IN ('approve_each', 'approve_batch'));

-- Client-side requests from the portal.
ALTER TABLE crm_clients ADD COLUMN blog_pref_reviewer_name TEXT;
ALTER TABLE crm_clients ADD COLUMN blog_pref_topics_avoid TEXT;
ALTER TABLE crm_clients ADD COLUMN blog_pref_requests TEXT;
ALTER TABLE crm_clients ADD COLUMN blog_prefs_updated_at TEXT;

-- Fleets the night schedule will check. Manual until 007 flips them.
INSERT OR IGNORE INTO automation_modes (scope, mode) VALUES ('seo', 'manual');
INSERT OR IGNORE INTO automation_modes (scope, mode) VALUES ('blog', 'manual');
