import type { EmbeddingProviderConfig } from "@myceliumhq/embed";

// semanticd has no knowledge of any particular source -- it loads a
// SourceAdapter by module name at runtime (see adapter-loader.ts) and
// knows nothing about that module's own connection config (a URL+token, a
// file path, whatever). Each adapter module is responsible for reading its
// own config from its own env vars/files.
export type SemanticdConfig = {
  port: number;
  indexPath: string;
  syncIntervalMs: number;
  adapterModule: string;
  adapterExport: string;
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
  const adapterModule = required("SEMANTICD_ADAPTER_MODULE");
  const adapterExport = process.env.SEMANTICD_ADAPTER_EXPORT ?? "createAdapter";

  return {
    port: optionalPositiveInt("SEMANTICD_PORT", 4499),
    indexPath: process.env.SEMANTICD_INDEX_PATH ?? "./semanticd.db",
    syncIntervalMs: optionalPositiveInt("SEMANTICD_SYNC_INTERVAL_MS", 15 * 60_000),
    adapterModule,
    adapterExport,
    embedding: loadEmbeddingConfig(),
  };
}
