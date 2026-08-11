import { createEmbeddingProvider } from "@myceliumhq/embed";
import type { SourceAdapter } from "@myceliumhq/index";
import { loadSemanticdConfig, type SemanticdConfig } from "./config.js";
import { createEngine } from "./engine.js";
import { createSemanticdServer, type SyncState } from "./server.js";

// The client side: every host that wants to query a deployed semanticd
// sidecar over HTTP (rather than run one itself) uses this instead of
// reimplementing the three-endpoint fetch() calls per host.
export { createSemanticdClient, type SemanticdClient, type SemanticdHealth } from "./client.js";
export type { SemanticdConfig } from "./config.js";
export { loadSemanticdConfig } from "./config.js";
export type { Engine, SyncLogger, SyncSummary } from "./engine.js";
export { createEngine } from "./engine.js";
export { createSemanticdServer, type SyncState } from "./server.js";

export type RunSemanticdOptions = {
  config?: SemanticdConfig;
  // On by default -- a sidecar gets SIGTERM routinely (every container
  // redeploy/rescale), not exceptionally, and every real caller wants the
  // same graceful-shutdown behavior (stop the sync timer, stop accepting
  // new HTTP connections, let in-flight ones finish, close the index file)
  // rather than reimplementing it per package. Set false only if the
  // embedding process already owns SIGTERM/SIGINT itself and will call the
  // returned handle's close() on its own.
  handleSignals?: boolean;
};

export type SemanticdHandle = { close: () => Promise<void> };

// The whole sidecar (embedding provider, index, periodic sync, HTTP
// server) wired to a caller-supplied adapter -- real TypeScript, checked
// at compile time by whichever package owns the adapter (tri, ppl, ...),
// not a module specifier/export name resolved by a runtime import().
export async function runSemanticd(
  adapter: SourceAdapter<string | number>,
  options: RunSemanticdOptions = {},
): Promise<SemanticdHandle> {
  const config = options.config ?? loadSemanticdConfig();
  const handleSignals = options.handleSignals ?? true;

  const embeddingProvider = createEmbeddingProvider(config.embedding);
  const engine = await createEngine(adapter, embeddingProvider, config.indexPath);

  const syncState: SyncState = { running: false };
  const runSync = async (): Promise<void> => {
    if (syncState.running) return;
    syncState.running = true;
    try {
      const summary = await engine.sync({
        warn: (msg) => console.warn(`[semanticd] ${msg}`),
        info: (msg) => console.log(`[semanticd] ${msg}`),
      });
      syncState.lastSyncAt = new Date().toISOString();
      syncState.lastError = undefined;
      console.log(
        `[semanticd] sync complete (processed=${summary.processed}, skipped=${summary.skipped}, failed=${summary.failed})`,
      );
    } catch (error) {
      syncState.lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[semanticd] sync failed: ${syncState.lastError}`);
    } finally {
      syncState.running = false;
    }
  };

  const runReconcile = async (): Promise<void> => {
    try {
      const result = await engine.reconcile();
      if (!result.supported) return; // adapter has no listAllIds -- nothing to do
      syncState.lastReconcileAt = new Date().toISOString();
      syncState.lastReconcileDeleted = result.deleted;
      console.log(
        `[semanticd] reconcile complete (checked=${result.checked}, deleted=${result.deleted})`,
      );
    } catch (error) {
      console.warn(
        `[semanticd] reconcile failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Kick off an initial pass in the background rather than blocking server
  // startup on a full backfill -- /health reports sync progress meanwhile.
  void runSync();
  const interval = setInterval(() => void runSync(), config.syncIntervalMs);
  interval.unref?.();

  // Reconcile is a full sweep of live ids, unlike sync's bounded watermark
  // page, so it runs on its own, coarser interval (see config.ts). Not run
  // on startup alongside the initial sync -- that first backfill pass can
  // itself take a while, and reconcile's deletion sweep isn't time-critical
  // the way getting first content indexed is.
  const reconcileInterval = setInterval(() => void runReconcile(), config.reconcileIntervalMs);
  reconcileInterval.unref?.();

  const server = createSemanticdServer(engine, syncState, runSync);
  await server.listen(config.port);
  console.log(`semanticd listening on :${config.port}`);

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearInterval(reconcileInterval);
    try {
      await server.close();
    } catch (error) {
      console.warn(
        `[semanticd] error closing server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    engine.index.close();
  };

  if (handleSignals) {
    const shutdown = (signal: string) => {
      console.log(`[semanticd] ${signal} received, shutting down`);
      void close().then(() => process.exit(0));
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  return { close };
}
