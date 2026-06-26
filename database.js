/**
 * Marketing Ops Center — Database Layer
 * Uses better-sqlite3 with application-level encryption for sensitive fields.
 * Runs migration files from src/migrations/ on startup.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || './data/ops_dashboard.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB memory cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB memory mapping


/**
 * Run all pending SQL migration files in order.
 * Tracks which migrations have been run in a `_migrations` table.
 */
function runMigrations() {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(__dirname, 'src', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found, skipping.');
    return;
  }

  const appliedMigrations = db.prepare('SELECT filename FROM _migrations').all()
    .map(row => row.filename);

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Alphabetical = numeric order with 001_, 002_ prefixes

  const pending = migrationFiles.filter(f => !appliedMigrations.includes(f));

  if (pending.length === 0) {
    console.log('[DB] All migrations are up to date.');
    return;
  }

  const insertMigration = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

  for (const filename of pending) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`[DB] Running migration: ${filename}`);

    const runMigration = db.transaction(() => {
      // Split on semicolons and run each statement (better-sqlite3 exec handles multi-statement)
      db.exec(sql);
      insertMigration.run(filename);
    });

    try {
      runMigration();
      console.log(`[DB] ✓ Applied: ${filename}`);
    } catch (err) {
      console.error(`[DB] ✗ Failed: ${filename}`, err.message);
      throw err; // Halt on migration failure
    }
  }
}

/**
 * Sync any existing marketing content tracker entries that don't have corresponding kanban tasks.
 * Run on server startup to handle seeded data and direct database insertions.
 */
function syncExistingContentTracker(dbInstance) {
  try {
    // Check if tables exist first
    const tableCheck = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='marketing_content_tracker'").get();
    if (!tableCheck) return;

    const unsynced = dbInstance.prepare(`
      SELECT t.*, r.script_id, s.title AS script_title
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      WHERE t.kanban_task_id IS NULL
    `).all();

    if (unsynced.length === 0) return;

    console.log(`[DB] Found ${unsynced.length} unsynced content tracker entries. Syncing to Kanban board...`);

    const insertTask = dbInstance.prepare(`
      INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, status, due_date, completed_at)
      VALUES (?, ?, ?, 'medium', 'social', ?, ?, ?)
    `);

    const updateContent = dbInstance.prepare(`
      UPDATE marketing_content_tracker 
      SET kanban_task_id = ? 
      WHERE id = ?
    `);

    const runSync = dbInstance.transaction(() => {
      for (const content of unsynced) {
        // If content is Client Rejected, it shouldn't show on board, keep kanban_task_id null
        if (content.status === 'Client Rejected') continue;

        const pendingStatuses = ['Draft', 'Pending Client Approval', 'Client Approved', 'Pending'];
        const isPending = pendingStatuses.includes(content.status);
        const isPosted = content.status === 'Posted';

        const taskTitle = `Post: ${content.title || ('Content Plan - ' + formatDateStr(content.date))} (${content.platform || 'social'})`;
        const scriptInfo = content.script_title ? `\nScript: ${content.script_title}` : '';
        const taskDesc = `Auto-generated from Content Tracker.\nPlatform: ${content.platform || ''}\nPost Type: ${content.post_type || ''}\nCaption: ${content.caption || ''}${scriptInfo}`;

        let status = 'backlog'; // Pending content maps to backlog
        let completedAt = null;

        if (isPosted) {
          status = 'delivered';
          completedAt = content.date ? content.date + 'T12:00:00.000Z' : new Date().toISOString();
        }

        const result = insertTask.run(
          content.client_id,
          taskTitle,
          taskDesc,
          status,
          content.date || null,
          completedAt
        );

        updateContent.run(result.lastInsertRowid, content.id);
      }
    });

    runSync();
    console.log(`[DB] ✓ Synced content tracker entries to Kanban.`);
  } catch (err) {
    console.error('[DB] Error syncing existing content tracker entries:', err);
  }
}

function formatDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const monthName = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ][parseInt(month, 10) - 1];
  return `${parseInt(day, 10)} ${monthName} ${year}`;
}

/**
 * Scan existing tasks in the database and fix any titles that contain raw YYYY-MM-DD dates.
 */
function fixExistingTaskTitles(dbInstance) {
  try {
    const tasks = dbInstance.prepare("SELECT id, title FROM kanban_tasks WHERE title LIKE 'Post: Content Plan - %'").all();
    const updateStmt = dbInstance.prepare("UPDATE kanban_tasks SET title = ? WHERE id = ?");

    const runFix = dbInstance.transaction(() => {
      for (const task of tasks) {
        // e.g. "Post: Content Plan - 2026-07-01 (youtube)"
        // Match YYYY-MM-DD pattern
        const match = task.title.match(/Content Plan - (\d{4}-\d{2}-\d{2})/);
        if (match) {
          const rawDate = match[1];
          const formattedDate = formatDateStr(rawDate);
          const newTitle = task.title.replace(rawDate, formattedDate);
          updateStmt.run(newTitle, task.id);
        }
      }
    });
    runFix();
    console.log(`[DB] ✓ Verified and formatted existing task titles.`);
  } catch (err) {
    console.error('[DB] Error fixing existing task titles:', err);
  }
}

// Run migrations on import
runMigrations();
syncExistingContentTracker(db);
fixExistingTaskTitles(db);

export default db;
