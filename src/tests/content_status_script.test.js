import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import router from '../routes/marketing.js';

// One transaction rolled back at the end, so the local database is left as it was.
beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

// The PATCH handler itself, past the auth middleware.
const patchContent = router.stack
  .find(l => l.route?.path === '/:id/marketing/content/:contentId' && l.route.methods.patch)
  .route.stack.at(-1).handle;

function call(clientId, contentId, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
    };
    patchContent({
      params: { id: String(clientId), contentId: String(contentId) },
      body,
      user: { id: 1, email: 'test@example.test', role: 'admin' },
      ip: '127.0.0.1',
    }, res);
  });
}

function setup() {
  const clientId = db.prepare(
    "INSERT INTO crm_clients (name, client_type, is_active) VALUES (?, 'marketing', 1)",
  ).run(`Status client ${Math.random()}`).lastInsertRowid;
  const scriptId = db.prepare(
    "INSERT INTO marketing_scripts (client_id, month, title, script_text, status) VALUES (?, '2026-11', 'Script title', 'text', 'Client Approved')",
  ).run(clientId).lastInsertRowid;
  const otherScriptId = db.prepare(
    "INSERT INTO marketing_scripts (client_id, month, title, script_text, status) VALUES (?, '2026-11', 'Other script', 'text', 'Client Approved')",
  ).run(clientId).lastInsertRowid;
  const contentId = db.prepare(
    "INSERT INTO marketing_content_tracker (client_id, platform, post_type, title, status) VALUES (?, 'instagram', 'Static', 'Script title', 'Client Approved')",
  ).run(clientId).lastInsertRowid;
  db.prepare('INSERT INTO marketing_content_script_relation (content_id, script_id) VALUES (?, ?)').run(contentId, scriptId);
  return { clientId, scriptId, otherScriptId, contentId };
}

const statusOf = (id) => db.prepare('SELECT status, title FROM marketing_content_tracker WHERE id = ?').get(id);

describe('content status with a linked script', () => {
  it('keeps Posted when the edit form re-sends the same script_id', async () => {
    const { clientId, scriptId, contentId } = setup();
    const r = await call(clientId, contentId, { status: 'Posted', title: 'Edited title', script_id: scriptId });
    expect(r.status).toBe(200);
    expect(statusOf(contentId)).toEqual({ status: 'Posted', title: 'Edited title' });
  });

  it('keeps Posted from the status pill', async () => {
    const { clientId, contentId } = setup();
    await call(clientId, contentId, { status: 'Posted' });
    expect(statusOf(contentId).status).toBe('Posted');
  });

  it('still copies a newly linked script, unless the status was changed in the same save', async () => {
    const { clientId, otherScriptId, contentId } = setup();
    await call(clientId, contentId, { status: 'Client Approved', script_id: otherScriptId });
    expect(statusOf(contentId)).toEqual({ status: 'Client Approved', title: 'Other script' });

    const second = setup();
    await call(second.clientId, second.contentId, { status: 'Posted', script_id: second.otherScriptId });
    expect(statusOf(second.contentId).status).toBe('Posted');
  });
});
