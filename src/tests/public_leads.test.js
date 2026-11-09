import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import db from '../../database.js';
import publicLeadsRouter, { flagNewDomain } from '../routes/publicLeads.js';
import {
  issueFormToken,
  checkFormToken,
  validateLeadInput,
  detectSpamContent,
  checkDomainAge,
} from '../services/leadSpam.js';
import {
  emailDomain,
  lookupDomainCreated,
  parseRdapCreated,
  parseWhoisCreated,
  parseWhoisReferral,
} from '../services/domainAge.js';

describe('Lead bot checks', () => {
  it('accepts a token older than 3s and rejects fast, forged or missing ones', () => {
    const now = Date.now();
    const token = issueFormToken(now - 10_000);
    expect(checkFormToken(token, now)).toBeNull();
    expect(checkFormToken(issueFormToken(now - 500), now)).toMatch(/after load/);
    expect(checkFormToken(`${now - 10_000}.deadbeefdeadbeefdeadbeefdeadbeef`, now)).toBe('invalid form token');
    expect(checkFormToken(undefined, now)).toBe('missing form token');
    expect(checkFormToken(issueFormToken(now - 25 * 3600_000), now)).toBe('form token expired');
  });

  it('validates required fields and lengths', () => {
    expect(validateLeadInput({ email: 'a@b.com' }).error).toMatch(/name/);
    expect(validateLeadInput({ name: 'A', email: 'nope' }).error).toMatch(/email/);
    expect(validateLeadInput({ name: 'A', email: 'a@b.com', message: 'x'.repeat(5001) }).error).toMatch(/too long/);
    expect(validateLeadInput({ name: ' Ana ', email: 'ANA@Brand.com ' }).data).toMatchObject({ name: 'Ana', email: 'ana@brand.com' });
  });

  it('flags spammy content but not normal enquiries', () => {
    const ok = { name: 'Priya Shah', company: 'acme.in', message: 'We run 3 clinics in Pune and want reels. See https://acme.in' };
    expect(detectSpamContent(ok)).toBeNull();
    expect(detectSpamContent({ ...ok, message: 'http://a.com http://b.com http://c.com' })).toMatch(/links/);
    expect(detectSpamContent({ ...ok, message: 'Cheap [url=http://x]backlinks[/url]' })).toBeTruthy();
    expect(detectSpamContent({ ...ok, name: 'xKq8ZpLm2vRt9WqA' })).toBe('random-string name');
  });
});

describe('Email domain age', () => {
  const now = Date.parse('2026-11-08T08:14:31Z');

  it('warns on domains under 90 days old and passes older ones', () => {
    expect(checkDomainAge(new Date('2026-11-07T05:20:36Z'), now)).toBe('email domain registered 1 day ago (2026-11-07)');
    expect(checkDomainAge(new Date('2026-11-08T01:00:00Z'), now)).toMatch(/registered today/);
    expect(checkDomainAge(new Date('2026-09-01T00:00:00Z'), now)).toMatch(/68 days ago/);
    expect(checkDomainAge(new Date('2026-08-01T00:00:00Z'), now)).toBeNull();
    expect(checkDomainAge(null, now)).toBeNull();
  });

  it('parses RDAP and WHOIS registration dates', () => {
    expect(parseRdapCreated({ events: [{ eventAction: 'last changed', eventDate: '2026-11-07T05:20:37Z' }, { eventAction: 'registration', eventDate: '2026-11-07T05:20:36Z' }] }).toISOString())
      .toBe('2026-11-07T05:20:36.000Z');
    expect(parseRdapCreated({ errorCode: 404 })).toBeNull();
    expect(parseWhoisCreated('Domain Name: cocopat.us\nUpdated Date: 2026-11-07T05:20:37Z\nCreation Date: 2026-11-07T05:20:36Z\n').toISOString())
      .toBe('2026-11-07T05:20:36.000Z');
    expect(parseWhoisCreated('No match for domain')).toBeNull();
    expect(parseWhoisReferral('domain: US\nwhois:        whois.nic.us\n')).toBe('whois.nic.us');
  });

  it('skips free mail and reserved domains without a lookup', async () => {
    expect(emailDomain('Ana@Brand.co.in')).toBe('brand.co.in');
    expect(await lookupDomainCreated('someone@gmail.com')).toBeNull();
    expect(await lookupDomainCreated('someone@example.com')).toBeNull();
  });

  it('marks a saved lead with the warning but keeps it New', async () => {
    const email = `lead-test-newdomain-${Date.now()}@example.com`;
    const { lastInsertRowid: id } = db.prepare(`INSERT INTO leads (client_name, email, status, source, created_at, updated_at) VALUES ('Scam Co', ?, 'New', 'website:kage', datetime('now'), datetime('now'))`).run(email);
    const fresh = async () => new Date(Date.now() - 86_400_000);
    expect(await flagNewDomain(id, email, fresh)).toMatch(/1 day ago/);
    expect(db.prepare('SELECT status, spam_reason FROM leads WHERE id = ?').get(id)).toMatchObject({ status: 'New', spam_reason: expect.stringMatching(/email domain registered/) });
    expect(await flagNewDomain(id, email, async () => { throw new Error('whois down'); })).toBeNull();
  });
});

describe('POST /api/public/leads', () => {
  let server;
  let base;
  const testEmail = `lead-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/public/leads', publicLeadsRouter);
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/public/leads`;
  });

  afterAll(() => {
    db.prepare('DELETE FROM leads WHERE email LIKE ?').run('lead-test-%@example.com');
    server?.close();
  });

  const post = (body) => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('saves a clean lead as New with its source, and dedupes a resubmit', async () => {
    const body = { name: 'Test Person', email: testEmail, company: 'Test Co', message: 'Hello', source: 'footer', token: issueFormToken(Date.now() - 10_000) };
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);

    const rows = db.prepare('SELECT * FROM leads WHERE email = ?').all(testEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'New', source: 'website:footer', spam_reason: null });
  });

  it('stores a too-fast submission as Spam but still answers ok', async () => {
    const email = `lead-test-fast-${Date.now()}@example.com`;
    const res = await post({ name: 'Fast Bot', email, message: 'hi', source: 'kage', token: issueFormToken() });
    expect(await res.json()).toEqual({ ok: true });
    expect(db.prepare('SELECT status FROM leads WHERE email = ?').get(email).status).toBe('Spam');
  });

  it('drops honeypot hits without storing anything', async () => {
    const email = `lead-test-honey-${Date.now()}@example.com`;
    const res = await post({ name: 'Bot', email, website_url: 'http://spam.example', token: issueFormToken(Date.now() - 10_000) });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT id FROM leads WHERE email = ?').get(email)).toBeUndefined();
  });

  it('returns 400 for invalid input', async () => {
    expect((await post({ name: '', email: 'x' })).status).toBe(400);
  });
});
