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

// Run migrations on import
runMigrations();

export default db;
