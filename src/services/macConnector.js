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
import db from '../../database.js';

let macSocket = null;
// When the connector last connected or dropped. Starts as the server's own
// start: until a connector dials in, it has been offline at least that long.
let changedAt = new Date();

/** { online, since }: whether a connector is connected, and since when that's been so. */
export function connectorStatus() {
  return { online: !!macSocket && macSocket.readyState === macSocket.OPEN, since: changedAt.toISOString() };
}

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
    changedAt = new Date();
    console.log('[MAC CONNECTOR] Connected.');
    const sessionId = logSession('open');
    // The connector pings every 20 s (scripts/mac_connector.mjs).
    socket.on('ping', () => logSession('seen', sessionId));

    socket.on('close', () => {
      if (macSocket === socket) { macSocket = null; changedAt = new Date(); }
      logSession('close', sessionId);
      console.log('[MAC CONNECTOR] Disconnected.');
    });
    socket.on('error', (err) => console.error('[MAC CONNECTOR] Socket error:', err.message));
  });

  return wss;
}

/**
 * mac_connector_sessions (migration 124): when the Mac was connected, readable
 * from every cluster process. Best-effort; a failed write never drops the socket.
 */
function logSession(event, id = null) {
  try {
    if (event === 'open') return db.prepare('INSERT INTO mac_connector_sessions DEFAULT VALUES').run().lastInsertRowid;
    if (!id) return null;
    const end = event === 'close' ? ", disconnected_at = datetime('now')" : '';
    db.prepare(`UPDATE mac_connector_sessions SET last_seen_at = datetime('now')${end} WHERE id = ?`).run(id);
  } catch (err) {
    console.error('[MAC CONNECTOR] Session log failed:', err.message);
  }
  return id;
}

/**
 * The deploy window (00:30-03:00 IST) of the most recent night that has
 * finished, and whether the Mac was connected at any point in it. Every night
 * step (deploys, SEO audits at 01:15, blog drafts at 01:00) runs through the
 * connector, so a night it never connected is a night nothing ran.
 */
export function lastNightConnection(now = new Date()) {
  const IST_MS = 330 * 60000;
  const ist = new Date(now.getTime() + IST_MS);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  let end = new Date(day + 3 * 3600000 - IST_MS);
  if (end > now) end = new Date(end.getTime() - 86400000);
  const start = new Date(end.getTime() - 150 * 60000);
  const sql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const seen = db.prepare(`
    SELECT 1 FROM mac_connector_sessions
    WHERE connected_at <= ? AND COALESCE(disconnected_at, last_seen_at) >= ? LIMIT 1
  `).get(sql(end), sql(start));
  // Nothing to judge before the table has a row older than that night.
  const tracked = db.prepare('SELECT 1 FROM mac_connector_sessions WHERE connected_at <= ? LIMIT 1').get(sql(start));
  return { window_start: start.toISOString(), window_end: end.toISOString(), connected: !!seen, tracked: !!tracked };
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
