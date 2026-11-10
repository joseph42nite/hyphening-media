/**
 * Every webhook event reaches a real handler. The handlers were split out of
 * src/routes/webhooks.js into src/webhooks/; this sends each known event with
 * an empty payload (inside a rolled-back transaction) and expects a handler's
 * own { success, summary } answer, never "is not a function".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { KNOWN_EVENTS, executeEvent } from '../routes/webhooks.js';

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

describe('webhook dispatch', () => {
  it('has a handler for every known event', () => {
    for (const event of KNOWN_EVENTS) {
      const result = executeEvent(event, {});
      expect(result, event).toBeTypeOf('object');
      expect(typeof result.success, event).toBe('boolean');
      expect(result.summary || '', event).not.toMatch(/is not a function|is not defined|Unknown event/);
    }
  });

  it('refuses an event it does not know', () => {
    expect(executeEvent('no_such_event', {}).success).toBe(false);
  });

  it('no longer accepts the removed OpenClaw-only events', () => {
    for (const gone of ['create_task', 'upsert_monthly_report', 'create_client', 'send_chat_message', 'skill_inventory_report', 'agent_activity_log']) {
      expect(KNOWN_EVENTS, gone).not.toContain(gone);
      expect(executeEvent(gone, {}).success, gone).toBe(false);
    }
  });
});
