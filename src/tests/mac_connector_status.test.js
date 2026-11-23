import { describe, it, expect, afterAll } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import { attachMacConnector, connectorStatus, lastNightConnection } from '../services/macConnector.js';
import db from '../../database.js';

process.env.MAC_CONNECTOR_SECRET = 'test-secret';
const server = http.createServer();
attachMacConnector(server);
await new Promise(res => server.listen(0, res));
afterAll(() => new Promise(res => server.close(res)));

const wait = (cond) => new Promise((res, rej) => {
  const t0 = Date.now();
  const tick = () => (cond() ? res() : Date.now() - t0 > 3000 ? rej(new Error('timed out')) : setTimeout(tick, 20));
  tick();
});

describe('connectorStatus', () => {
  it('is offline until a connector dials in, online while connected, offline again after', async () => {
    expect(connectorStatus().online).toBe(false);
    const ws = new WebSocket(`ws://localhost:${server.address().port}/ws/mac-connector?token=test-secret`);
    await wait(() => connectorStatus().online);
    const onlineSince = connectorStatus().since;
    ws.close();
    await wait(() => !connectorStatus().online);
    expect(connectorStatus().since >= onlineSince).toBe(true);
    // The connection is on record for every cluster process, and closed.
    const row = db.prepare('SELECT * FROM mac_connector_sessions ORDER BY id DESC LIMIT 1').get();
    await wait(() => db.prepare('SELECT disconnected_at FROM mac_connector_sessions WHERE id = ?').get(row.id).disconnected_at);
    db.prepare('DELETE FROM mac_connector_sessions WHERE id = ?').run(row.id);
  });
});

describe('lastNightConnection', () => {
  // Kept to one transaction so the local database is left as it was.
  const at = (iso) => iso.replace('T', ' ').slice(0, 19);
  const add = (from, to) => db.prepare('INSERT INTO mac_connector_sessions (connected_at, last_seen_at, disconnected_at) VALUES (?, ?, ?)').run(at(from), at(to), at(to));

  it('checks 00:30-03:00 IST of the last finished night, and says nothing before any session is on record', () => {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM mac_connector_sessions').run();
      // 23 Nov 08:40 IST: last night is 23 Nov 00:30-03:00 IST = 22 Nov 19:00-21:30 UTC.
      const now = new Date('2026-11-23T03:10:00Z');
      let r = lastNightConnection(now);
      expect(r.window_start).toBe('2026-11-22T19:00:00.000Z');
      expect(r.window_end).toBe('2026-11-22T21:30:00.000Z');
      expect(r.tracked).toBe(false);

      // Connected the day before, 11:00-18:00 IST only: last night was missed.
      add('2026-11-22T05:30:00Z', '2026-11-22T12:30:00Z');
      r = lastNightConnection(now);
      expect(r).toMatchObject({ tracked: true, connected: false });

      // Connected at 00:55 IST: fine.
      add('2026-11-22T19:25:00Z', '2026-11-23T00:00:00Z');
      expect(lastNightConnection(now).connected).toBe(true);

      // At 02:00 IST the night isn't over, so the check is still the night before.
      expect(lastNightConnection(new Date('2026-11-22T20:30:00Z')).window_end).toBe('2026-11-21T21:30:00.000Z');
    } finally {
      db.exec('ROLLBACK');
    }
  });
});
