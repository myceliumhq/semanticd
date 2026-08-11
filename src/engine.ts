import type { EmbeddingProvider } from "@myceliumhq/embed";
import {
  DEFAULT_SEMANTIC_INDEX_CONFIG,
  openSemanticIndex,
  type ReconcileSummary,
  type SemanticIndex,
  type SourceAdapter,
} from "@myceliumhq/index";

export type SyncSummary = { processed: number; skipped: number; failed: number };
export type SyncLogger = { warn: (message: string) => void; info?: (message: string) => void };

export type Engine = {
  index: SemanticIndex;
  sync: (logger?: SyncLogger) => Promise<SyncSummary>;
  // Deletion backstop -- diffs the adapter's full live id set against what's
  // stored and purges the difference. Resolves `{ supported: false, ... }`
  // rather than throwing when the adapter has no listAllIds, so a caller can
  // schedule this unconditionally without checking adapter capabilities
  // itself.
  reconcile: () => Promise<ReconcileSummary>;
};

// Wires a caller-supplied adapter (any source) to an open index --
// entirely generic, no knowledge of what the adapter's TId or content
// actually represents.
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
    reconcile: () => opened.index.reconcile(adapter),
  };
}
