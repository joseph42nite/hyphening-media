-- Migration: 076_ads_use_claude_ads_fleet.sql
--
-- Repoints the Ads Monitor at the claude-ads plugin
-- (github.com/AgriciDaniel/claude-ads, MIT, 9.4k stars) — the same author as
-- the claude-seo plugin already serving the SEO Monitor, so the two fleets now
-- work the same way end to end.
--
-- The twelve bespoke agents this replaces analysed only what this database
-- holds. claude-ads covers twelve platforms and thirty-three skills, which is
-- far more than this installation can currently feed. That is fine, and it is
-- exactly how the SEO Monitor already behaves: every card is listed, and the
-- ones whose data source is absent are blocked WITH THE REASON rather than
-- hidden or, worse, run anyway. A skill with no data source does not fail — it
-- writes a plausible audit from training knowledge.
--
-- What does NOT change is where the numbers come from. adsFacts.js still
-- computes every figure and hands it over as the run's source evidence, which
-- is what claude-ads calls a source-grounded input. Its skills are explicitly
-- built to refuse to invent account context, so the two designs agree.

-- skill_name: the plugin skill that serves this card. Stored rather than
-- derived, because claude-ads names 'full' as 'ads-audit' and there is no rule
-- that maps one to the other — the SEO side derives it and needed a special
-- case for exactly this.
ALTER TABLE ads_agent_config ADD COLUMN skill_name TEXT;

-- The ad platform this card is about, or NULL for account-wide. Used to block
-- a platform card when no spend has ever been recorded on that platform: a
-- LinkedIn audit for an account that has never run LinkedIn produces confident
-- prose about nothing.
ALTER TABLE ads_agent_config ADD COLUMN platform TEXT;

-- A permanent block with its reason: a capability this installation does not
-- have, rather than data it happens to be missing. Distinct from `requires`,
-- which can start passing the moment a row is added. These do not change until
-- someone configures something, and two of them are deliberate safety stops.
ALTER TABLE ads_agent_config ADD COLUMN static_block TEXT;

DELETE FROM ads_agent_config;

INSERT INTO ads_agent_config
  (agent_type, skill_name, label, description, stale_after_days, requires, platform, static_block, sort_order) VALUES

-- ---------------------------------------------------------------- core audits
('audit', 'ads-audit', 'Full Ads Audit',
 'Source-grounded audit across every active platform, deterministically scored, with a ranked action list. The master run.',
 30, '["spend"]', NULL, NULL, 10),

('monitor', 'ads-monitor', 'Account Monitor',
 'Pacing, delivery, creative fatigue, tracking and policy checks. The card the daily schedule runs unattended.',
 1, '["spend"]', NULL, NULL, 20),

('math', 'ads-math', 'Unit Economics',
 'CPA, CPL, CPC, CPM, ROAS, MER and break-even targets modelled against contribution margin rather than revenue.',
 30, '["spend"]', NULL, NULL, 30),

('budget', 'ads-budget', 'Budget & Pacing',
 'Budget, bidding, pacing and marginal return, with forecasts stated as amounts.',
 14, '["spend"]', NULL, NULL, 40),

('optimize', 'ads-optimize', 'Optimisation Draft',
 'Diagnoses underperformance and drafts the changes. Drafts only — applying them needs platform API adapters this installation has not configured.',
 14, '["spend"]', NULL, NULL, 50),

-- --------------------------------------------------- platforms actually run
-- Gated on spend for that platform, not on the platform existing. An account
-- that has never run Google gets a blocked Google card with the reason.
('google', 'ads-google', 'Google Ads',
 'Measurement, Search, Shopping, Performance Max, Demand Gen and YouTube-linked inventory.',
 14, '["spend"]', 'Google', NULL, 60),

('meta', 'ads-meta', 'Meta Ads',
 'Measurement, Pixel and Conversions API, attribution, Facebook and Instagram creative and placements.',
 14, '["spend"]', 'Meta', NULL, 70),

('youtube', 'ads-youtube', 'YouTube Ads',
 'Campaign setup, video and Demand Gen inventory, Shorts, in-stream and CTV.',
 14, '["spend"]', 'YouTube', NULL, 80),

-- ------------------------------------------------------- measurement & pages
('attribution', 'ads-attribution', 'Attribution',
 'Cross-platform attribution, conversion definitions, reporting windows and GA4 alignment.',
 30, '["leads"]', NULL, NULL, 90),

('server_side_tracking', 'ads-server-side-tracking', 'Server-Side Tracking',
 'Server-side tag management, platform conversion APIs and the signal loss between browser and server.',
 90, '[]', NULL, NULL, 100),

('landing', 'ads-landing', 'Landing Pages',
 'Message match, mobile experience, performance, accessibility and tracking on the pages paid traffic lands on.',
 30, '["landing"]', NULL, NULL, 110),

-- -------------------------------------------------------------- creative side
('creative', 'ads-creative', 'Creative Audit',
 'Copy, images, video, hooks, format coverage and platform-native fit for the creative currently running.',
 30, '["content"]', NULL, NULL, 120),

('create', 'ads-create', 'Campaign Concepts',
 'New campaign concepts, messaging, copy and creative briefs, grounded in the brand profile.',
 9999, '[]', NULL, NULL, 130),

('dna', 'ads-dna', 'Brand Profile',
 'A public-safe brand and offer profile extracted from the client website. Run once per client; everything creative reads it.',
 90, '[]', NULL, NULL, 140),

-- ------------------------------------------------------ strategy & reporting
('plan', 'ads-plan', 'Strategy Plan',
 'Objectives, economics, platform selection and measurement plan. Quarterly.',
 90, '["spend"]', NULL, NULL, 150),

('test', 'ads-test', 'Experiment Design',
 'Hypotheses, randomisation units, sample size and decision rules for paid tests.',
 30, '["spend"]', NULL, NULL, 160),

('competitor', 'ads-competitor', 'Competitor Research',
 'Competitor paid presence, messaging, creative, formats and landing pages.',
 30, '[]', NULL, NULL, 170),

('report', 'ads-report', 'Client Report',
 'The month rendered for the client from a validated run bundle.',
 30, '["spend"]', NULL, NULL, 180),

-- -------------------------------------------------------------- housekeeping
('setup', 'ads-setup', 'Client Setup',
 'Client, brand, account, data-source, privacy and mutation-guardrail profile. Run once per client before anything else.',
 9999, '[]', NULL, NULL, 190),

('validate', 'ads-validate', 'Contract Validation',
 'Validates run bundles, scoring inputs, capabilities and source freshness. The check on whether the other cards can be trusted.',
 30, '[]', NULL, NULL, 200),

('research', 'ads-research', 'Platform Research',
 'Refreshes the plugin''s platform, API, policy and benchmark knowledge against current sources.',
 30, '[]', NULL, NULL, 210),

-- ============================================================ blocked cards
-- Listed rather than omitted, so the fleet shows what claude-ads can do and
-- exactly what this installation would have to add to use it.

-- Mutation. These are the two skills that can change a live ad account, and
-- both stay off until someone deliberately configures an adapter and a
-- mutation gate. An agent that can spend money is not something to enable by
-- forgetting to disable it.
('launch', 'ads-launch', 'Campaign Launch',
 'Drafts or applies a campaign launch through capability-gated platform adapters.',
 9999, '[]', NULL,
 'Applies changes to live ad accounts. No platform API adapter or mutation gate is configured, and enabling one is a deliberate decision — not a default.', 220),

-- Image generation needs a provider key this installation does not hold.
('generate', 'ads-generate', 'Creative Generation',
 'Generates ad image assets from a validated creative brief and brand profile.',
 9999, '[]', NULL,
 'Requires an image provider (ADS_IMAGE_PROVIDER and its API key), which is not configured.', 230),

('photoshoot', 'ads-photoshoot', 'Product Photography',
 'Generates rights-cleared product photography variants from an authorised source image.',
 9999, '[]', NULL,
 'Requires an image provider (ADS_IMAGE_PROVIDER and its API key), which is not configured.', 240),

-- Platforms this agency does not run. marketing_ad_campaigns only accepts
-- Google, Meta and YouTube, so these cannot become unblocked by data alone —
-- the schema would have to change first. Saying so is more useful than a card
-- that silently never goes green.
('linkedin', 'ads-linkedin', 'LinkedIn Ads',
 'Insight Tag and conversions, professional audiences, lead generation forms.',
 14, '[]', 'LinkedIn',
 'No LinkedIn spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 300),

('tiktok', 'ads-tiktok', 'TikTok Ads',
 'Pixel and Events API, mobile-first creative, audiences, Smart+.',
 14, '[]', 'TikTok',
 'No TikTok spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 310),

('microsoft', 'ads-microsoft', 'Microsoft Ads',
 'UET, search and audience campaigns, Google import sync.',
 14, '[]', 'Microsoft',
 'No Microsoft Advertising spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 320),

('apple', 'ads-apple', 'Apple Ads',
 'AdServices and AdAttributionKit, campaign and keyword structure.',
 14, '[]', 'Apple',
 'No Apple Ads spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 330),

('amazon', 'ads-amazon', 'Amazon Ads',
 'Sponsored Products, Brands, Display and DSP.',
 14, '[]', 'Amazon',
 'No Amazon Ads spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 340),

('pinterest', 'ads-pinterest', 'Pinterest Ads',
 'Pinterest Tag and Conversions API, catalog and shopping readiness.',
 14, '[]', 'Pinterest',
 'No Pinterest spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 350),

('reddit', 'ads-reddit', 'Reddit Ads',
 'Measurement, community and interest targeting, creative-native fit.',
 14, '[]', 'Reddit',
 'No Reddit spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 360),

('snapchat', 'ads-snapchat', 'Snapchat Ads',
 'Snap Pixel and Conversions API, mobile and app campaigns.',
 14, '[]', 'Snapchat',
 'No Snapchat spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 370),

('x', 'ads-x', 'X Ads',
 'X Pixel and Conversions API, campaign objectives, keyword and conversation targeting.',
 14, '[]', 'X',
 'No X spend is recorded. marketing_ad_campaigns accepts Google, Meta and YouTube only, so this needs a schema change before it can run.', 380);
