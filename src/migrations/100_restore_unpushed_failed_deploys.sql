-- Migration: 100_restore_unpushed_failed_deploys.sql
-- The first Deploy (2026-11-03) failed at its build check, before pushing
-- anything ("vite: command not found": the deploy worker's copy of the code had
-- no node_modules). That marked its fixes failed. From now on a failure before
-- the push leaves fixes ready for Retry deploy; this puts the fixes of any
-- batch that never pushed back to ready the same way.
UPDATE seo_recommendations SET status = 'ready_to_deploy', fix_error = NULL
WHERE status = 'fix_failed' AND fix_error LIKE 'Deploy failed:%'
  AND fix_batch_id IN (
    SELECT id FROM seo_fix_batches
    WHERE status = 'deploy_failed' AND (log IS NULL OR log NOT LIKE '%pushed %')
  );
