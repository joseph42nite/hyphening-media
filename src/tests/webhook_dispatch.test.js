/**
 * Every webhook event reaches a real handler. The handlers were split out of
 * src/routes/webhooks.js into src/webhooks/; this sends each known event with
 * an empty payload (inside a rolled-back transaction) and expects a handler's
 * own { success, summary } answer, never "is not a function".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../database.js';
import { KNOWN_EVENTS, executeEvent } from '../routes/webhooks.js';

// agent_activity_log broadcasts through server.js, which would start the server.
const SKIP = new Set(['agent_activity_log']);

beforeAll(() => db.exec('BEGIN'));
afterAll(() => db.exec('ROLLBACK'));

describe('webhook dispatch', () => {
  it('has a handler for every known event', () => {
    for (const event of KNOWN_EVENTS.filter(e => !SKIP.has(e))) {
      const result = executeEvent(event, {});
      expect(result, event).toBeTypeOf('object');
      expect(typeof result.success, event).toBe('boolean');
      expect(result.summary || '', event).not.toMatch(/is not a function|is not defined|Unknown event/);
    }
  });

  it('refuses an event it does not know', () => {
    expect(executeEvent('no_such_event', {}).success).toBe(false);
  });
});
