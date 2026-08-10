import type { EmbeddingProvider } from "@myceliumhq/embed";
import {
  DEFAULT_SEMANTIC_INDEX_CONFIG,
  openSemanticIndex,
  type SemanticIndex,
  type SourceAdapter,
} from "@myceliumhq/index";

export type SyncSummary = { processed: number; skipped: number; failed: number };
export type SyncLogger = { warn: (message: string) => void; info?: (message: string) => void };

export type Engine = {
  index: SemanticIndex;
  sync: (logger?: SyncLogger) => Promise<SyncSummary>;
};

// Wires a loaded adapter (any source, from adapter-loader.ts) to an open
// index -- entirely generic, no knowledge of what the adapter's TId or
// content actually represents.
export async function createEngine(
  adapter: SourceAdapter<string | number>,
  embeddingProvider: EmbeddingProvider,
  indexPath: string,
): Promise<Engine> {
  const opened = await openSemanticIndex({
    embeddingProvider,
    dbPath: indexPath,
    ...DEFAULT_SEMANTIC_INDEX_CONFIG,
  });
  if (!opened.available) {
    throw new Error(`semanticd: index unavailable: ${opened.reason}`);
  }
  return {
    index: opened.index,
    sync: (logger) =>
      opened.index.sync(adapter, logger).then((s) => ({
        processed: s.processed,
        skipped: s.skippedUnchanged,
        failed: s.failed,
      })),
  };
}
