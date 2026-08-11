import type { EmbeddingProviderConfig } from "@myceliumhq/embed";

// semanticd has no knowledge of any particular source -- the adapter itself
// is supplied by the caller of runSemanticd() (see index.ts), not resolved
// from anything read here. This config covers only what's genuinely
// generic across every adapter: the HTTP port, where the index lives, and
// how the embedding provider is configured.
export type SemanticdConfig = {
  port: number;
  indexPath: string;
  syncIntervalMs: number;
  // Deletion-reconcile pass interval -- deliberately much coarser than
  // syncIntervalMs: unlike incremental sync (a bounded watermark page),
  // reconcile is a full sweep of every live id at the source, so running it
  // as often as sync would multiply request volume against the source API
  // for a class of change (deletions) that isn't time-sensitive the way
  // content edits are.
  reconcileIntervalMs: number;
  embedding: EmbeddingProviderConfig;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`semanticd: missing required env var ${name}`);
  }
  return value;
}

// Parses a positive-integer env var, throwing a clear config error
// (naming the offending var) instead of letting a bad value silently
// propagate as NaN into server.listen(NaN) (a confusing RangeError
// unrelated to the real misconfiguration) or setInterval(fn, NaN) (spec-
// clamped to effectively 0, a busy-loop).
function parsePositiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`semanticd: ${name} must be a positive number, got '${raw}'`);
  }
  return value;
}

function optionalPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  return raw === undefined ? defaultValue : parsePositiveInt(name, raw);
}

function requiredPositiveInt(name: string): number {
  return parsePositiveInt(name, required(name));
}

function loadEmbeddingConfig(): EmbeddingProviderConfig {
  const provider = process.env.EMBEDDING_PROVIDER === "local" ? "local" : "openai-compatible";
  if (provider === "local") {
    return {
      provider: "local",
      model: process.env.EMBEDDING_MODEL,
      dimensions:
        process.env.EMBEDDING_DIMENSIONS !== undefined
          ? requiredPositiveInt("EMBEDDING_DIMENSIONS")
          : undefined,
    };
  }
  return {
    provider: "openai-compatible",
    baseUrl: required("EMBEDDING_BASE_URL"),
    apiKey: required("EMBEDDING_API_KEY"),
    model: required("EMBEDDING_MODEL"),
    dimensions: requiredPositiveInt("EMBEDDING_DIMENSIONS"),
  };
}

// Every field is read directly from process.env, mirroring tri/ppl's own
// env-only config convention -- no config file parsing, so a fresh sidecar
// (a container, a systemd unit) works with nothing but exported env vars.
export function loadSemanticdConfig(): SemanticdConfig {
  return {
    port: optionalPositiveInt("SEMANTICD_PORT", 4499),
    indexPath: process.env.SEMANTICD_INDEX_PATH ?? "./semanticd.db",
    syncIntervalMs: optionalPositiveInt("SEMANTICD_SYNC_INTERVAL_MS", 15 * 60_000),
    reconcileIntervalMs: optionalPositiveInt("SEMANTICD_RECONCILE_INTERVAL_MS", 6 * 60 * 60_000),
    embedding: loadEmbeddingConfig(),
  };
}
