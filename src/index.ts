#!/usr/bin/env node
import { createEmbeddingProvider } from "@myceliumhq/embed";
import { loadAdapter } from "./adapter-loader.js";
import { loadSemanticdConfig } from "./config.js";
import { createEngine } from "./engine.js";
import { createSemanticdServer, type SyncState } from "./server.js";

async function main(): Promise<void> {
  const config = loadSemanticdConfig();
  const adapter = await loadAdapter(config.adapterModule, config.adapterExport);
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

  // Kick off an initial pass in the background rather than blocking server
  // startup on a full backfill -- /health reports sync progress meanwhile.
  void runSync();
  const interval = setInterval(() => void runSync(), config.syncIntervalMs);
  interval.unref?.();

  const server = createSemanticdServer(engine, syncState, runSync);
  await server.listen(config.port);
  console.log(`semanticd listening on :${config.port} -- adapter: ${config.adapterModule}`);

  // A sidecar gets SIGTERM routinely (every container redeploy/rescale),
  // not exceptionally -- without a handler, Node's default behavior is
  // immediate termination, hard-resetting in-flight requests and
  // potentially interrupting a SQLite write to the index file mid-
  // operation. Stop the timer, stop accepting new connections, let
  // in-flight ones finish, then close the index handle before exiting.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[semanticd] ${signal} received, shutting down`);
    clearInterval(interval);
    try {
      await server.close();
    } catch (error) {
      console.warn(
        `[semanticd] error closing server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    engine.index.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
