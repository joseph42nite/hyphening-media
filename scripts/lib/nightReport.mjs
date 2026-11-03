/**
 * The vault's night report (Companies/Hyphening/Docs/Hyphening - Night Report.md):
 * one line per thing the night workers did or couldn't do, newest at the
 * bottom. Moneypenny and 007 read it in the morning. A failed write is logged,
 * never fatal: a lost report line must not stop the work.
 */

import path from 'path';
import { existsSync } from 'fs';
import { appendFile, writeFile } from 'fs/promises';

const HEADER = '---\ntype: night-report\ncompany: "Hyphening"\n---\n# Hyphening: night report\n\n'
  + 'Appended by the night workers (blog, SEO fixes, deploys, outreach), newest at the bottom. Do not hand-edit. '
  + 'Approve in the portal: Blog Monitor, and SEO Monitor (Last night, Outreach).\n\n';

export async function appendNightReport(line) {
  const file = path.join(process.env.VAULT_DIR || '/Volumes/Mac Valhalla/Vault', 'Companies/Hyphening/Docs/Hyphening - Night Report.md');
  try {
    if (!existsSync(file)) await writeFile(file, HEADER, 'utf8');
    await appendFile(file, `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${line}\n`, 'utf8');
  } catch (err) {
    console.error(`[night-report] Could not write: ${err.message}`);
  }
}
