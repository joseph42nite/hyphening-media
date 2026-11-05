import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createGlobalLimiter } from '../middleware/rateLimit.js';

describe('Global rate limiter', () => {
  const logs = [];
  let server;
  let base;

  beforeAll(async () => {
    const app = express();
    app.use('/api', createGlobalLimiter({ max: 3, log: (line) => logs.push(line) }));
    app.post('/api/auth/login', (req, res) => res.json({ ok: true }));
    app.get('/api/health', (req, res) => res.json({ ok: true }));
    app.get('/api/portal/:token/leads', (req, res) => res.json({ ok: true }));
    app.get('/api/clients', (req, res) => res.json({ ok: true }));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => server.close());

  it('blocks other API routes but never login or health', async () => {
    const token = 'a'.repeat(32);
    for (let i = 0; i < 3; i++) {
      expect((await fetch(`${base}/api/portal/${token}/leads`)).status).toBe(200);
    }
    expect((await fetch(`${base}/api/clients`)).status).toBe(429);
    expect((await fetch(`${base}/api/clients`)).status).toBe(429);

    expect((await fetch(`${base}/api/auth/login`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it('logs the busiest routes once per blocked IP, with tokens hidden', () => {
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('GET /api/portal/:id/leads x3');
    expect(logs[0]).not.toContain('a'.repeat(32));
  });
});
