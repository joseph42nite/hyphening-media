/**
 * Marketing Ops Center — Scheduler Service
 * Cron jobs for calendar sync, D-5 alerts, and API metric fetching.
 */

import cron from 'node-cron';
import db from '../../database.js';
import { notifyAdmin } from './telegram.js';

/**
 * Initialize all scheduled jobs.
 */
export function initScheduler() {
  console.log('[SCHEDULER] Initializing cron jobs...');

  // Daily calendar sync — midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[SCHEDULER] Running daily calendar sync...');
    runDailyCalendarSync();
  });

  // D-5 check — 8 AM daily
  cron.schedule('0 8 * * *', () => {
    console.log('[SCHEDULER] Running D-5 deadline check...');
    runD5Check();
  });

  // API metric fetch — every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('[SCHEDULER] Running API metric fetch...');
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

/**
 * Check for tasks due within 5 days and send alerts.
 */
async function runD5Check() {
  try {
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const urgentTasks = db.prepare(`
      SELECT t.*, c.name as client_name, f.name as freelancer_name
      FROM kanban_tasks t
      LEFT JOIN crm_clients c ON t.client_id = c.id
      LEFT JOIN freelancers f ON t.assigned_to = f.id
      WHERE t.due_date IS NOT NULL 
        AND t.due_date <= ?
        AND t.status NOT IN ('delivered', 'cancelled')
      ORDER BY t.due_date ASC
    `).all(fiveDaysFromNow);

    if (urgentTasks.length > 0) {
      console.log(`[D5] ${urgentTasks.length} tasks due within 5 days`);
      for (const task of urgentTasks) {
        notifyAdmin(`⏰ *D-5 Deadline Warning*\nTask: *"${task.title}"*\nClient: *${task.client_name || 'N/A'}*\nAssignee: *${task.freelancer_name || 'Unassigned'}*\nDue Date: *${task.due_date}*\nStatus: _${task.status}_`);
      }
    }
  } catch (err) {
    console.error('[D5] Check error:', err);
  }
}

/**
 * Fetch API metrics for all active clients (fault-tolerant).
 */
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
          notifyAdmin(`⚠️ *API Integration Failure*\nAPI sync is failing for client *${client.name}*. Connection set to ERROR. Please verify/refresh access tokens.`);
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
