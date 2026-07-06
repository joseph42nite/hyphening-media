/**
 * Marketing Ops Center — Database Layer
 * Uses better-sqlite3 with application-level encryption for sensitive fields.
 * Runs migration files from src/migrations/ on startup.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncContentToKanbanTask, formatDateStr } from './src/services/kanbanSync.js';

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

    const runSync = dbInstance.transaction(() => {
      for (const content of unsynced) {
        syncContentToKanbanTask(content.id, dbInstance);
      }
    });

    runSync();
    console.log(`[DB] ✓ Synced content tracker entries to Kanban.`);
  } catch (err) {
    console.error('[DB] Error syncing existing content tracker entries:', err);
  }
}

/**
 * Scan existing tasks in the database and fix any titles that contain raw YYYY-MM-DD dates or full month names.
 */
function fixExistingTaskTitles(dbInstance) {
  try {
    const tasks = dbInstance.prepare("SELECT id, title FROM kanban_tasks").all();
    const updateStmt = dbInstance.prepare("UPDATE kanban_tasks SET title = ? WHERE id = ?");

    const fullMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const shortMonths = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const runFix = dbInstance.transaction(() => {
      for (const task of tasks) {
        let newTitle = task.title;

        // 1. Convert any raw YYYY-MM-DD dates to short formatted dates (if they were somehow missed)
        const match = newTitle.match(/Content Plan - (\d{4}-\d{2}-\d{2})/);
        if (match) {
          const rawDate = match[1];
          const formattedDate = formatDateStr(rawDate);
          newTitle = newTitle.replace(rawDate, formattedDate);
        }

        // 2. Convert full month names to short 3-letter month names
        for (let i = 0; i < fullMonths.length; i++) {
          if (newTitle.includes(` ${fullMonths[i]} `)) {
            newTitle = newTitle.replace(` ${fullMonths[i]} `, ` ${shortMonths[i]} `);
          }
        }

        if (newTitle !== task.title) {
          updateStmt.run(newTitle, task.id);
        }
      }
    });
    runFix();
    console.log(`[DB] ✓ Verified and formatted existing task titles to 3-letter months.`);
  } catch (err) {
    console.error('[DB] Error fixing existing task titles:', err);
  }
}

// Run migrations on import
runMigrations();
syncExistingContentTracker(db);
fixExistingTaskTitles(db);

export default db;
