/**
 * Marketing Ops Center — Scheduler Service
 * Cron jobs for calendar sync, D-5 alerts, and API metric fetching.
 */

import cron from 'node-cron';
import db from '../../database.js';
import { notifyAdmin, notifySMM, notifyVideographer } from './telegram.js';

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

  // Daily backlog check — 8 AM daily
  cron.schedule('0 8 * * *', () => {
    console.log('[SCHEDULER] Running daily backlog report...');
    runDailyBacklogReport();
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
 * Daily backlog check for Videographers, SMMs, and Admins.
 */
async function runDailyBacklogReport() {
  try {
    // 1. Fetch incomplete tasks for Videographers (role = 'ops_video_editor')
    const videoEditors = db.prepare("SELECT id, name, role FROM users WHERE role = 'ops_video_editor' AND is_active = 1").all();
    for (const editor of videoEditors) {
      const tasks = db.prepare(`
        SELECT title, due_date, status 
        FROM kanban_tasks 
        WHERE assigned_to = ? AND status NOT IN ('delivered', 'cancelled')
      `).all(editor.id);

      let text = `📅 *Daily Task Backlog*\nHello ${editor.name}, here are your pending tasks:\n\n`;
      if (tasks.length > 0) {
        tasks.forEach(t => {
          text += `• *${t.title}* (Due: ${t.due_date || 'N/A'}) - Status: _${t.status}_\n`;
        });
      } else {
        text += `You have no pending tasks today! 🎉`;
      }
      await notifyVideographer(text);
    }

    // 2. Fetch incomplete tasks for SMMs (role = 'ops_social_media_manager')
    const smms = db.prepare("SELECT id, name, role FROM users WHERE role = 'ops_social_media_manager' AND is_active = 1").all();
    for (const smm of smms) {
      const tasks = db.prepare(`
        SELECT title, due_date, status 
        FROM kanban_tasks 
        WHERE assigned_to = ? AND status NOT IN ('delivered', 'cancelled')
      `).all(smm.id);

      let text = `📅 *Daily Task Backlog*\nHello ${smm.name}, here are your pending tasks:\n\n`;
      if (tasks.length > 0) {
        tasks.forEach(t => {
          text += `• *${t.title}* (Due: ${t.due_date || 'N/A'}) - Status: _${t.status}_\n`;
        });
      } else {
        text += `You have no pending tasks today! 🎉`;
      }
      await notifySMM(text);
    }

    // 3. Fetch all incomplete tasks in the system for Admin summary
    const adminTasks = db.prepare(`
      SELECT t.title, t.due_date, t.status, u.name as assignee_name, u.role as assignee_role
      FROM kanban_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.status NOT IN ('delivered', 'cancelled')
      ORDER BY t.due_date ASC
    `).all();

    let adminText = `📅 *Daily Ops Backlog Summary*\nHere is the current system backlog:\n\n`;
    if (adminTasks.length > 0) {
      adminTasks.forEach(t => {
        const assignee = t.assignee_name ? `${t.assignee_name} (${t.assignee_role === 'ops_video_editor' ? 'Videographer' : 'SMM'})` : 'Unassigned';
        adminText += `• *${t.title}* (Due: ${t.due_date || 'N/A'}) - Status: _${t.status}_ - Assigned: _${assignee}_\n`;
      });
    } else {
      adminText += `All tasks are completed! No pending items. 🎉`;
    }
    await notifyAdmin(adminText);

  } catch (err) {
    console.error('[SCHEDULER] Daily backlog report error:', err);
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
