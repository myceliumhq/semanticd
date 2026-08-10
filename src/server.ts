import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Engine } from "./engine.js";

export type SyncState = { lastSyncAt?: string; lastError?: string; running: boolean };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readQuery(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams;
}

// GET /health -- this sidecar's index size and last-sync status, so a
// caller can tell "up but still doing its first backfill" apart from
// "down".
function handleHealth(engine: Engine, syncState: SyncState, res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    sourceCount: engine.index.sourceCount(),
    syncing: syncState.running,
    lastSyncAt: syncState.lastSyncAt,
    lastError: syncState.lastError,
  });
}

// GET /query?q=<text>&limit=<n> -- ranked matches. No source-selecting
// param -- each sidecar wraps exactly one adapter, so the URL alone
// (which sidecar you're talking to) already picks it.
async function handleQuery(
  engine: Engine,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const query = readQuery(req);
  const q = query.get("q");
  const limitRaw = query.get("limit");

  if (!q) return sendJson(res, 400, { error: "missing required query param: q" });
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 100) : 10;
  if (Number.isNaN(limit)) return sendJson(res, 400, { error: "limit must be a number" });

  try {
    const matches = await engine.index.search(q, limit);
    sendJson(res, 200, { query: q, matches });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

// POST /reindex -- triggers an out-of-schedule sync pass (e.g. right after
// a bulk change at the source) instead of waiting for the next
// SEMANTICD_SYNC_INTERVAL_MS tick. Fire-and-forget: a full backfill can
// take a while, and the caller shouldn't block on it -- /health reports
// when the pass completes.
function handleReindex(runSync: () => Promise<void>, res: ServerResponse): void {
  void runSync();
  sendJson(res, 202, { accepted: true });
}

export function createSemanticdServer(
  engine: Engine,
  syncState: SyncState,
  runSync: () => Promise<void>,
): { listen: (port: number) => Promise<void>; close: () => Promise<void> } {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      return handleHealth(engine, syncState, res);
    }
    if (req.method === "GET" && url.pathname === "/query") {
      return void handleQuery(engine, req, res);
    }
    if (req.method === "POST" && url.pathname === "/reindex") {
      return handleReindex(runSync, res);
    }
    sendJson(res, 404, { error: "not found" });
  });

  return {
    listen: (port) =>
      new Promise((resolve, reject) => {
        // A bind failure (EADDRINUSE, permission denied on a privileged
        // port, ...) emits 'error' on the server, not the listen()
        // callback -- with no listener here, Node's default EventEmitter
        // behavior is to throw, which would crash the process outside
        // index.ts's own main().catch() instead of rejecting this promise
        // cleanly. 'once' so it doesn't also fire (harmlessly, but
        // needlessly) on a later runtime error once listening succeeded.
        server.once("error", reject);
        server.listen(port, () => resolve());
      }),
    // Stops accepting new connections and waits for in-flight ones to
    // finish -- the graceful-shutdown half of a SIGTERM/SIGINT handler, so
    // a container orchestrator's routine redeploy doesn't hard-reset
    // requests mid-flight.
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
