-- Migration: 086_add_client_onboarding.sql
-- Client-onboarding intake so a new client's brand/voice/strategy setup is
-- captured once and reused by every blog run, instead of being re-derived
-- by hand each time. Maps 1:1 to the claude-blog plugin's blog-brand and
-- blog-persona skill inputs. Deliberately NOT rendered to BRAND.md/VOICE.md/
-- persona.json files on disk — 007 wants this pulled live via
-- GET /api/clients/:id/onboarding at the moment a blog skill run needs it,
-- so it's always current with the portal and there's no EC2/Mac file-sync
-- gap to manage. Flat columns on crm_clients, matching the existing
-- convention for strictly 1:1 per-client fields (see
-- 084_add_client_control_flags.sql, 077_client_ads_properties.sql) rather
-- than a side-table. JSON-array fields are stored as stringified TEXT, same
-- convention as blog_posts.internal_links/tags.

-- blog-brand inputs
ALTER TABLE crm_clients ADD COLUMN brand_audience_primary TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_audience_secondary TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_audience_expertise TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_positioning TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_editorial_do TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_editorial_dont TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_taboo_phrases TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_competitor_differentiation TEXT;

-- blog-persona inputs
ALTER TABLE crm_clients ADD COLUMN persona_tone_funny_serious REAL;
ALTER TABLE crm_clients ADD COLUMN persona_tone_formal_casual REAL;
ALTER TABLE crm_clients ADD COLUMN persona_tone_respectful_irreverent REAL;
ALTER TABLE crm_clients ADD COLUMN persona_tone_enthusiastic_matter_of_fact REAL;
ALTER TABLE crm_clients ADD COLUMN persona_sentence_length_mean INTEGER;
ALTER TABLE crm_clients ADD COLUMN persona_sentence_length_std INTEGER;
ALTER TABLE crm_clients ADD COLUMN persona_vocabulary_tier TEXT CHECK (persona_vocabulary_tier IS NULL OR persona_vocabulary_tier IN ('consumer', 'professional', 'technical'));
ALTER TABLE crm_clients ADD COLUMN persona_contraction_frequency REAL;
ALTER TABLE crm_clients ADD COLUMN persona_summary_label TEXT;

-- One-time kickoff trigger inputs (blog-cluster / blog-calendar) — not
-- re-used per post like the fields above, just stored so they're ready
-- for a kickoff run instead of being re-asked for.
ALTER TABLE crm_clients ADD COLUMN brand_niche_keywords TEXT;
ALTER TABLE crm_clients ADD COLUMN brand_publishing_cadence TEXT;

ALTER TABLE crm_clients ADD COLUMN brand_onboarded_at TEXT;
