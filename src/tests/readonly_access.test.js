import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';

// auth.js reads the secret when it loads; tests don't load .env, so give it one first.
process.env.JWT_ACCESS_SECRET ||= 'readonly-access-test-secret';
const { default: db } = await import('../../database.js');
const { authenticate } = await import('../middleware/auth.js');

// One transaction, rolled back at the end: the local database is left as it was.
let token;
beforeAll(() => {
  db.exec('BEGIN');
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const fields = { email: 'readonly-test@test.localhost', password_hash: 'x', name: 'Read only test', role: 'api_readonly', is_active: 1 };
  const keys = Object.keys(fields).filter((k) => cols.includes(k));
  const id = db.prepare(`INSERT INTO users (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => fields[k])).lastInsertRowid;
  token = jwt.sign({ userId: Number(id) }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
});
afterAll(() => db.exec('ROLLBACK'));

function call(method, baseUrl, path) {
  let status = null;
  let passed = false;
  const req = { method, baseUrl, path, cookies: { access_token: token }, ip: '127.0.0.1' };
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  authenticate(req, res, () => { passed = true; });
  return passed ? 200 : status;
}

describe('the read-only login', () => {
  it('may read plugin versions and Q\'s reviews (Q checks them before an install)', () => {
    expect(call('GET', '/api/plugins', '/')).toBe(200);
    expect(call('GET', '/api/plugins', '')).toBe(200);
  });

  it('may not press Update or read anything else new', () => {
    expect(call('POST', '/api/plugins', '/marketing-skills/update')).toBe(403);
    expect(call('GET', '/api/clients', '/8/brain')).toBe(403);
    expect(call('GET', '/api/clients', '/8/outbound/leads')).toBe(403);
  });
});
