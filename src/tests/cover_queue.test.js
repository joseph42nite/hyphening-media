/**
 * The Antigravity cover queue (scripts/lib/coverQueue.mjs): the blog worker
 * leaves requests, Antigravity's scheduled automation draws them, the worker
 * attaches what was drawn. Antigravity is played by writing the image file.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { requestCover, listRequests, attachDrawn } from '../../scripts/lib/coverQueue.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-queue-')); });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000, 7)]);
const draw = (req, status = 'drawn') => {
  fs.writeFileSync(req.output, PNG);
  fs.writeFileSync(req.file, JSON.stringify({ ...JSON.parse(fs.readFileSync(req.file, 'utf8')), status }));
};

describe('cover queue', () => {
  it('leaves a pending request with the prompt and where to save the image', async () => {
    const file = await requestCover({ runId: 11, client: 'Dr. Test', title: 'Sunscreen', topic: 'sun', prompt: 'Subject: bottles' }, dir);
    expect(file).toBe(path.join(dir, 'requests', 'run-11.json'));
    const [req] = await listRequests(dir);
    expect(req).toMatchObject({ run_id: 11, status: 'pending', client: 'Dr. Test', prompt: 'Subject: bottles', output: path.join(dir, 'images', 'run-11.png') });
  });

  it('waits while nothing is drawn, then attaches the drawn cover once', async () => {
    await requestCover({ runId: 12, client: 'C', title: 'T', prompt: 'p' }, dir);
    const calls = [];
    const attach = async (runId, buf, mime) => { calls.push({ runId, size: buf.length, mime }); return { success: true }; };
    expect(await attachDrawn(attach, { dir })).toEqual([]);

    draw((await listRequests(dir))[0]);
    expect(await attachDrawn(attach, { dir })).toEqual([{ run_id: 12, status: 'attached' }]);
    expect(calls).toEqual([{ runId: 12, size: PNG.length, mime: 'image/png' }]);
    expect((await listRequests(dir))[0].status).toBe('attached');
    // A second pass does nothing.
    expect(await attachDrawn(attach, { dir })).toEqual([]);
  });

  it('takes an image Antigravity saved but forgot to mark drawn', async () => {
    await requestCover({ runId: 13, client: 'C', title: 'T', prompt: 'p' }, dir);
    draw((await listRequests(dir))[0], 'pending');
    expect((await attachDrawn(async () => ({ success: true }), { dir }))[0].status).toBe('attached');
  });

  it('closes a request whose draft was already approved, and retries a blip', async () => {
    await requestCover({ runId: 14, client: 'C', title: 'T', prompt: 'p' }, dir);
    await requestCover({ runId: 15, client: 'C', title: 'T', prompt: 'p' }, dir);
    for (const r of await listRequests(dir)) draw(r);
    const attach = async (runId) => (runId === 14 ? { success: false, summary: 'Blog run #14 is published' } : { success: false, summary: 'fetch failed' });
    const done = await attachDrawn(attach, { dir });
    expect(done).toEqual([{ run_id: 14, status: 'too_late', note: 'Blog run #14 is published' }]);
    const byId = Object.fromEntries((await listRequests(dir)).map((r) => [r.run_id, r.status]));
    expect(byId).toEqual({ 14: 'too_late', 15: 'drawn' });
  });

  it('tidies closed requests and their images after two weeks', async () => {
    await requestCover({ runId: 16, client: 'C', title: 'T', prompt: 'p' }, dir);
    const [req] = await listRequests(dir);
    fs.writeFileSync(req.output, PNG);
    const { file, ...rest } = req;
    fs.writeFileSync(file, JSON.stringify({ ...rest, status: 'attached', closed_at: '2020-01-01T00:00:00Z' }));
    await attachDrawn(async () => ({ success: true }), { dir });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(req.output)).toBe(false);
  });

  it('skips a half-written request file instead of failing the pass', async () => {
    fs.mkdirSync(path.join(dir, 'requests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'requests', 'run-17.json'), '{"run_id": 17,');
    expect(await listRequests(dir)).toEqual([]);
  });
});
