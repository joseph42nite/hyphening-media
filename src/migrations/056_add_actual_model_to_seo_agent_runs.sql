-- Migration: 056_add_actual_model_to_seo_agent_runs.sql
-- Records which model ACTUALLY ran, as reported by OpenClaw, alongside the one
-- we configured.
--
-- OpenClaw is adding per-skill fallback chains (Ultra:free -> Super:free ->
-- Kimi K2.7, a paid model). A fallback fires on 429/503, which is exactly what
-- happens when the OpenRouter free-tier daily cap is hit — so a run can
-- silently escalate from $0 to a paid model with nothing on the dashboard
-- indicating it. Storing what actually ran makes that visible instead of
-- surfacing later as an unexplained invoice.

ALTER TABLE seo_agent_runs ADD COLUMN actual_model TEXT;
