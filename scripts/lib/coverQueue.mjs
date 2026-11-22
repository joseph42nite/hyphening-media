/**
 * Blog covers drawn by Antigravity, unattended, on the user's own plan.
 *
 * The blog worker can't call Antigravity (its agent server only serves the
 * app's own add-ons), so the two meet in a folder:
 *
 *   1. When a draft is written, the worker leaves a request:
 *        ~/.hyphening/covers/requests/run-<id>.json   { status: 'pending', prompt, output, ... }
 *   2. Antigravity's "Hyphening Blog Covers" scheduled automation (03:00 and
 *      06:00 IST) draws each pending request's image, saves it at `output`
 *      (~/.hyphening/covers/images/run-<id>.png) and sets status 'drawn'.
 *   3. The blog worker, on every pass (the Mac connector sweeps every 10 min),
 *      attaches drawn covers to their drafts (attach_blog_cover) and sets
 *      status 'attached'. A draft 007 already approved keeps its Unsplash
 *      cover: the request is closed as 'too_late'.
 *
 *   COVER_QUEUE_DIR   the folder (default ~/.hyphening/covers)
 *   COVERS_VIA_ANTIGRAVITY=0   stop writing requests
 */

import os from 'os';
import path from 'path';
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';

export const QUEUE_DIR = process.env.COVER_QUEUE_DIR || path.join(os.homedir(), '.hyphening', 'covers');
export const enabled = () => process.env.COVERS_VIA_ANTIGRAVITY !== '0';

const reqDir = (dir) => path.join(dir, 'requests');
const imgDir = (dir) => path.join(dir, 'images');

/** Leave a request for Antigravity. Returns its file path. */
export async function requestCover({ runId, client, title, topic, prompt }, dir = QUEUE_DIR) {
  await mkdir(reqDir(dir), { recursive: true });
  await mkdir(imgDir(dir), { recursive: true });
  const file = path.join(reqDir(dir), `run-${runId}.json`);
  const request = {
    run_id: runId,
    status: 'pending',
    client,
    title,
    topic: topic || null,
    prompt,
    output: path.join(imgDir(dir), `run-${runId}.png`),
    requested_at: new Date().toISOString(),
  };
  await writeFile(file, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  return file;
}

/** Every request, oldest first, with its file path. Unreadable files are skipped. */
export async function listRequests(dir = QUEUE_DIR) {
  if (!existsSync(reqDir(dir))) return [];
  const out = [];
  for (const name of (await readdir(reqDir(dir))).filter((n) => /^run-\d+\.json$/.test(n)).sort()) {
    const file = path.join(reqDir(dir), name);
    try { out.push({ file, ...JSON.parse(await readFile(file, 'utf8')) }); } catch { /* half-written; next pass */ }
  }
  return out.sort((a, b) => a.run_id - b.run_id);
}

async function close(req, status, note) {
  const { file, ...rest } = req;
  await writeFile(file, `${JSON.stringify({ ...rest, status, note: note || undefined, closed_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

/**
 * Attach every drawn cover. `attach(runId, buf, mime)` posts it and resolves
 * the server's reply. Returns [{ run_id, status, note }] for what it did.
 * A request whose image exists counts as drawn even if Antigravity didn't
 * get round to updating the status.
 */
export async function attachDrawn(attach, { dir = QUEUE_DIR, shrink = async (img) => img, maxAgeDays = 14 } = {}) {
  const done = [];
  for (const req of await listRequests(dir)) {
    if (['attached', 'too_late', 'failed'].includes(req.status)) {
      // Keep two weeks of history, then tidy the request and its image.
      const age = (Date.now() - Date.parse(req.closed_at || req.requested_at || 0)) / 86400000;
      if (age > maxAgeDays) {
        await rm(req.file, { force: true });
        if (req.output) await rm(req.output, { force: true });
      }
      continue;
    }
    const output = req.output && existsSync(req.output) ? req.output : null;
    if (!output) continue;
    if ((await stat(output)).size < 1024) continue; // still being written
    const buf = await readFile(output);
    const mime = buf[0] === 0xff ? 'image/jpeg' : buf.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/png';
    const img = await shrink({ buf, mime });
    let reply;
    try { reply = await attach(req.run_id, img.buf, img.mime); } catch (err) { reply = { success: false, summary: err.message }; }
    if (reply?.success) {
      await close(req, 'attached');
      done.push({ run_id: req.run_id, status: 'attached' });
    } else if (/ is (approved|published|rejected|failed)\b/.test(reply?.summary || '') || /not found/.test(reply?.summary || '')) {
      await close(req, 'too_late', reply.summary);
      done.push({ run_id: req.run_id, status: 'too_late', note: reply.summary });
    } else {
      // A network blip or a bad image: try again next pass, up to a day.
      const age = (Date.now() - Date.parse(req.requested_at || 0)) / 86400000;
      if (age > 1) { await close(req, 'failed', reply?.summary); done.push({ run_id: req.run_id, status: 'failed', note: reply?.summary }); }
    }
  }
  return done;
}
