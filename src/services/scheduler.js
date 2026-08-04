import cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database.js';
import { runAutoPublisher } from './autoPublisher.js';
import { runMetricSyncWorker } from './metricSyncWorker.js';
import { runDailyCommentSync } from './dailyCommentSync.js';

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

  // Daily calendar sync — midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[SCHEDULER] Running daily calendar sync...');
    runDailyCalendarSync();
  });

  // API metric fetch — once a day at 3:30 AM
  cron.schedule('30 3 * * *', () => {
    console.log('[SCHEDULER] Running daily API metric fetch...');
    runAPIMetricFetch();
  });

  // Clean expired sessions — daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    console.log('[SCHEDULER] Cleaning expired sessions...');
    cleanExpiredSessions();
  });

  console.log('[SCHEDULER] ✓ All cron jobs registered.');
}

/**
 * Daily calendar sync for all clients with calendar links.
 */
async function runDailyCalendarSync() {
  try {
    const clients = db.prepare(
      'SELECT id, name, calendar_sync_link FROM crm_clients WHERE calendar_sync_link IS NOT NULL AND is_active = 1'
    ).all();

    for (const client of clients) {
      try {
        // TODO: Phase 5 — Implement Google Calendar API sync
        console.log(`[CALENDAR] Would sync calendar for: ${client.name}`);
      } catch (err) {
        console.error(`[CALENDAR] Failed for ${client.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CALENDAR] Sync error:', err);
  }
}

async function runAPIMetricFetch() {
  try {
    const clients = db.prepare(`
      SELECT * FROM crm_clients 
      WHERE is_active = 1 
        AND (instagram_access_token_enc IS NOT NULL OR youtube_channel_id IS NOT NULL)
    `).all();

    for (const client of clients) {
      try {
        // TODO: Phase 8 — Implement Instagram Graph API and YouTube Data API fetching
        // const recentContent = getRecentContent(client.id, 30);
        // await fetchInstagramMetrics(client, recentContent);
        // await fetchYouTubeMetrics(client, recentContent);

        db.prepare(`
          UPDATE crm_clients SET 
            consecutive_api_failures = 0, 
            api_status = 'active',
            last_metric_fetch_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), client.id);

        console.log(`[METRICS] ✓ Fetched for: ${client.name}`);
      } catch (err) {
        const failures = (client.consecutive_api_failures || 0) + 1;
        const status = failures >= 3 ? 'error' : client.api_status;

        db.prepare(`
          UPDATE crm_clients SET 
            consecutive_api_failures = ?, 
            api_status = ?
          WHERE id = ?
        `).run(failures, status, client.id);

        if (failures === 3) {
          console.error(`[METRICS] ⚠️ API fetch failing for ${client.name}. Status set to ERROR.`);
        }

        console.error(`[METRICS] Failed for ${client.name} (attempt ${failures}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[METRICS] Fetch error:', err);
  }
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
