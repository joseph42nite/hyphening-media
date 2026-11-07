-- 104_models_sonnet_5_5.sql
-- The SEO and ads workers run every skill through the Claude CLI on the Mac
-- (the Claude subscription), pinned to claude-sonnet-5-5: they can't run the
-- OpenRouter ids stored here. Every run's actual_model already says
-- claude-sonnet-5-5, so the stored defaults now say the same instead of
-- "openrouter/deepseek/deepseek-v4-flash".
UPDATE agent_run_config SET default_model = 'claude-sonnet-5-5';
UPDATE ads_agent_config SET default_model = 'claude-sonnet-5-5';
