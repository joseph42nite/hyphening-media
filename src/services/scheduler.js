import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database.js';
import { runAutoPublisher } from './autoPublisher.js';
import { runMetricSyncWorker } from './metricSyncWorker.js';
import { runDailyCommentSync } from './dailyCommentSync.js';
import { runDailyAdsWatch, runWeeklyAdsSweep } from './adsScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize all scheduled jobs.
 */
export function initScheduler() {
  console.log('[SCHEDULER] Initializing cron jobs...');

  // Auto-Publisher worker — runs every minute
  cron.schedule('* * * * *', () => {
    runAutoPublisher();
  });

  // Daily comment ingestion cron — 2 AM daily
  cron.schedule('0 2 * * *', () => {
    console.log('[SCHEDULER] Running daily comment sync...');
    runDailyCommentSync();
  });

  // Daily metric refresh worker for content tracker (Composio / Meta Graph API) — 3:00 AM daily
  // Configured to run ONCE a day to keep monthly API calls under Composio free tier limit (20,000 tool calls/mo)
  cron.schedule('0 3 * * *', () => {
    console.log('[SCHEDULER] Running daily automated metric refresh worker (Composio Free Tier Safe)...');
    runMetricSyncWorker();
  });

  // Ads anomaly watch — 6:30 AM daily, so a break that happened overnight is
  // already analysed by the time anyone opens the dashboard. Only clients with
  // more than one month of spend are queued; the rest have nothing to compare.
  cron.schedule('30 6 * * *', () => {
    console.log('[SCHEDULER] Running daily ads anomaly watch...');
    runDailyAdsWatch();
  });

  // Weekly sweep of stale ads agents — Monday 7 AM, capped per client so a
  // neglected account catches up over a month rather than in one expensive
  // night. Everything else in the fleet stays manual.
  cron.schedule('0 7 * * 1', () => {
    console.log('[SCHEDULER] Running weekly ads sweep...');
    runWeeklyAdsSweep();
  });

  // Clean expired sessions — daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    console.log('[SCHEDULER] Cleaning expired sessions...');
    cleanExpiredSessions();
  });

  console.log('[SCHEDULER] ✓ All cron jobs registered.');
}


/**
 * Clean up expired sessions.
 */
function cleanExpiredSessions() {
  try {
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now') OR revoked = 1").run();
    console.log(`[SESSIONS] Cleaned ${result.changes} expired sessions`);
  } catch (err) {
    console.error('[SESSIONS] Cleanup error:', err);
  }
}
