#!/usr/bin/env node
/**
 * Online backup of the dashboard database before a deploy, to
 * data/ops_dashboard.db.bak-predeploy-<timestamp>. Run on the server from the
 * app folder; the deploy manifest's first command.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = path.join(ROOT, 'data', `ops_dashboard.db.bak-predeploy-${ts}`);
const db = new Database(path.join(ROOT, 'data', 'ops_dashboard.db'), { readonly: true });
await db.backup(target);
db.close();
console.log(`backup ok ${path.basename(target)}`);
