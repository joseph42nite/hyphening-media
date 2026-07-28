-- Migration: 057_add_agent_id_routing.sql
-- Per-skill model routing, decided on our side.
--
-- OpenClaw resolves the model from agent.defaults.model.primary on whichever
-- agent serves the request, and SKILL.md cannot override it. But the agent is
-- chosen per-request, in the hook payload — so routing a skill to a different
-- model is simply a matter of naming a different agent.
--
--   main (default) -> openrouter/deepseek/deepseek-v4-flash
--   seo            -> nemotron-3-ultra:free
--                     -> nemotron-3-super:free -> deepseek-v4-flash
--
-- NULL means "use OPENCLAW_AGENT_ID, or 'main'". Setting agent_id on a single
-- skill is what makes an A/B test possible without a global switch or restart.

ALTER TABLE agent_run_config ADD COLUMN agent_id TEXT;

-- Records which agent actually served a run, so the audit trail survives a
-- later config change.
ALTER TABLE seo_agent_runs ADD COLUMN agent_id TEXT;
