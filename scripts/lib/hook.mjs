/**
 * One signed call to the Ops Center webhook (/api/openclaw/webhook), the same
 * HMAC channel every worker uses. The secret comes from the repo .env and is
 * never printed. Returns the parsed reply; throws on an error status.
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

export const API = (process.env.HYPHENING_API_URL || 'https://hypheningmedia.com').replace(/\/$/, '');
const SECRET = process.env.HYPHENING_HMAC_SECRET || process.env.OPENCLAW_HMAC_SECRET;

// A 429 is refused before the server does anything, so it's safe to retry.
// 09/11/2026 every worker died on its first 429 and the night's work never ran.
const RETRY_WAIT_MS = 60_000;
const RETRIES = 2;

export async function hook(event_type, payload, attempt = 0) {
  if (!SECRET) throw new Error('HYPHENING_HMAC_SECRET is not set in the repo .env');
  const body = JSON.stringify({ event_type, payload });
  const res = await fetch(`${API}/api/openclaw/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openclaw-signature': crypto.createHmac('sha256', SECRET).update(body).digest('hex'),
      'x-openclaw-timestamp': new Date().toISOString(),
      'x-openclaw-nonce': crypto.randomUUID(),
    },
    body,
  });
  if (res.status === 429 && attempt < RETRIES) {
    console.warn(`[hook] ${event_type} -> HTTP 429, retrying in ${RETRY_WAIT_MS / 1000} s`);
    await new Promise(r => setTimeout(r, RETRY_WAIT_MS));
    return hook(event_type, payload, attempt + 1); // signed afresh: new timestamp and nonce
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${event_type} -> HTTP ${res.status}: ${json.message || json.error || JSON.stringify(json).slice(0, 300)}`);
  return json;
}
