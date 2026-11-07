import { describe, it, expect, afterAll } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import { attachMacConnector, connectorStatus } from '../services/macConnector.js';

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
  });
});
