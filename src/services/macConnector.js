/**
 * One push channel to the Mac running the SEO/Ads workers.
 *
 * The workers themselves still pull from the queue (seo_worker.mjs --once,
 * ads_worker.mjs --once) exactly as before — this does not replace that, it
 * just tells the Mac connector script to run one pass right now instead of
 * waiting for the next poll, so a portal click feels instant instead of
 * landing up to 30s later. No tunnel, no inbound port on the Mac: the
 * connector dials out to us and holds the socket open, same direction as any
 * other outbound HTTP call it already makes.
 *
 * Exactly one connector is expected at a time (one Mac). A push with nobody
 * connected is a no-op — the run stays queued and gets picked up by the
 * connector's on-connect catch-up pass instead.
 */

import { WebSocketServer } from 'ws';

let macSocket = null;

export function attachMacConnector(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/mac-connector',
    verifyClient: (info, cb) => {
      const token = new URL(info.req.url, 'http://localhost').searchParams.get('token');
      const expected = process.env.MAC_CONNECTOR_SECRET;
      cb(!!expected && token === expected);
    },
  });

  wss.on('connection', (socket) => {
    // Only one connector should exist; a reconnect replaces the old socket
    // rather than running two in parallel.
    if (macSocket && macSocket.readyState === macSocket.OPEN) {
      macSocket.close();
    }
    macSocket = socket;
    console.log('[MAC CONNECTOR] Connected.');

    socket.on('close', () => {
      if (macSocket === socket) macSocket = null;
      console.log('[MAC CONNECTOR] Disconnected.');
    });
    socket.on('error', (err) => console.error('[MAC CONNECTOR] Socket error:', err.message));
  });

  return wss;
}

/**
 * Tell the connector to run one pass of the given worker now. Best-effort:
 * if nothing is connected, the queued run just waits for the next catch-up.
 */
export function pushRunSignal(kind) {
  if (!macSocket || macSocket.readyState !== macSocket.OPEN) {
    console.log(`[MAC CONNECTOR] Queued a ${kind} run but no connector is online; it will be caught up on next connect.`);
    return false;
  }
  macSocket.send(JSON.stringify({ type: 'run', kind }));
  return true;
}
