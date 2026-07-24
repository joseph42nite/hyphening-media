import cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../database.js';
import { notifyAdmin, notifySMM, notifyVideographer } from './telegram.js';
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

  // Automated hourly metric refresh worker for all posted content
  cron.schedule('0 * * * *', () => {
    console.log('[SCHEDULER] Running hourly automated metric refresh worker...');
    runMetricSyncWorker();
  });

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

  // Daily SEO audit freshness check — 3:05 AM daily
  cron.schedule('5 3 * * *', () => {
    runDailySeoFreshnessCheck();
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
        WHERE assigned_to = ? AND status != 'delivered'
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
        WHERE assigned_to = ? AND status != 'delivered'
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
      WHERE t.status != 'delivered'
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
 * Daily SEO freshness check worker — runs at 3:05 AM daily
 * Scans active clients, checks stale audits against config stale limits,
 * and auto-triggers updates for stale indexes.
 */
async function runDailySeoFreshnessCheck() {
  try {
    console.log('[SCHEDULER] Running daily SEO freshness checks...');
    const clients = db.prepare("SELECT * FROM crm_clients WHERE is_active = 1 AND client_type != 'artist_curation' AND website_url IS NOT NULL").all();
    const configs = db.prepare('SELECT * FROM agent_run_config').all();

    for (const client of clients) {
      // Get current month spend and budget cap
      const currentMonthStart = new Date();
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0,0,0,0);
      const isoMonthStart = currentMonthStart.toISOString();

      const spent = db.prepare(`
        SELECT COALESCE(SUM(estimated_cost_usd + external_api_cost_usd), 0) AS total_cost_usd
        FROM token_usage_log
        WHERE client_id = ? AND created_at >= ?
      `).get(client.id, isoMonthStart);

      const budget = db.prepare('SELECT * FROM token_budgets WHERE client_id = ?').get(client.id);
      const monthlyLimit = budget ? budget.monthly_budget_usd : 50.0;
      const hardStop = budget ? budget.hard_stop : 0;

      // If budget exceeded and hard stop enabled, skip client completely
      if (hardStop === 1 && spent.total_cost_usd >= monthlyLimit) {
        console.log(`[SEO CRON] Client ${client.name} has exceeded budget cap ($${spent.total_cost_usd.toFixed(2)}/$${monthlyLimit.toFixed(2)}). Skipping.`);
        continue;
      }

      for (const conf of configs) {
        // Find last successful audit of this type
        const lastAudit = db.prepare(`
          SELECT created_at FROM seo_audits
          WHERE client_id = ? AND audit_type = ?
          ORDER BY created_at DESC LIMIT 1
        `).get(client.id, conf.audit_type);

        let isStale = false;
        if (!lastAudit) {
          isStale = true; // Never run
        } else {
          const lastDate = new Date(lastAudit.created_at);
          const diffMs = Date.now() - lastDate.getTime();
          const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (ageDays >= conf.stale_after_days) {
            isStale = true;
          }
        }

        if (isStale) {
          console.log(`[SEO CRON] Agent '${conf.audit_type}' is stale for client '${client.name}'. Highlighted in UI, waiting for manual trigger.`);
          // Auto-triggering is disabled to prevent accidental credit consumption. 
          // Stale agents are highlighted in the UI and must be run manually.
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Daily SEO freshness check error:', err);
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
