import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSemanticdConfig } from "./config.js";

const ENV_KEYS = [
  "SEMANTICD_ADAPTER_MODULE",
  "SEMANTICD_ADAPTER_EXPORT",
  "SEMANTICD_PORT",
  "SEMANTICD_INDEX_PATH",
  "SEMANTICD_SYNC_INTERVAL_MS",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("loadSemanticdConfig", () => {
  it("throws when SEMANTICD_ADAPTER_MODULE is unset -- there is no default adapter", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    expect(() => loadSemanticdConfig()).toThrow(/SEMANTICD_ADAPTER_MODULE/);
  });

  it("defaults SEMANTICD_ADAPTER_EXPORT to 'createAdapter'", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";

    const config = loadSemanticdConfig();
    expect(config.adapterExport).toBe("createAdapter");
  });

  it("respects an explicit SEMANTICD_ADAPTER_EXPORT override", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    process.env.SEMANTICD_ADAPTER_EXPORT = "buildIt";

    const config = loadSemanticdConfig();
    expect(config.adapterExport).toBe("buildIt");
  });

  it("loads with the local embedding provider (no API key needed) and sane defaults", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";

    const config = loadSemanticdConfig();
    expect(config.adapterModule).toBe("./some-adapter.js");
    expect(config.embedding).toEqual({
      provider: "local",
      model: undefined,
      dimensions: undefined,
    });
    expect(config.port).toBe(4499);
    expect(config.indexPath).toBe("./semanticd.db");
    expect(config.syncIntervalMs).toBe(15 * 60_000);
  });

  it("requires baseUrl/apiKey/model/dimensions for the openai-compatible provider", () => {
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    // EMBEDDING_PROVIDER unset -> defaults to openai-compatible, which then
    // needs the rest of the embedding.* env vars.

    expect(() => loadSemanticdConfig()).toThrow(/EMBEDDING_BASE_URL/);
  });

  it("respects SEMANTICD_PORT/INDEX_PATH/SYNC_INTERVAL_MS overrides", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    process.env.SEMANTICD_PORT = "8080";
    process.env.SEMANTICD_INDEX_PATH = "/tmp/idx.db";
    process.env.SEMANTICD_SYNC_INTERVAL_MS = "60000";

    const config = loadSemanticdConfig();
    expect(config.port).toBe(8080);
    expect(config.indexPath).toBe("/tmp/idx.db");
    expect(config.syncIntervalMs).toBe(60000);
  });

  it("throws naming the var for a non-numeric SEMANTICD_PORT instead of propagating NaN", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    process.env.SEMANTICD_PORT = "not-a-number";

    expect(() => loadSemanticdConfig()).toThrow(/SEMANTICD_PORT/);
  });

  it("throws for a non-positive SEMANTICD_SYNC_INTERVAL_MS", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    process.env.SEMANTICD_SYNC_INTERVAL_MS = "0";

    expect(() => loadSemanticdConfig()).toThrow(/SEMANTICD_SYNC_INTERVAL_MS/);
  });

  it("throws for a non-numeric EMBEDDING_DIMENSIONS with the local provider", () => {
    process.env.EMBEDDING_PROVIDER = "local";
    process.env.SEMANTICD_ADAPTER_MODULE = "./some-adapter.js";
    process.env.EMBEDDING_DIMENSIONS = "abc";

    expect(() => loadSemanticdConfig()).toThrow(/EMBEDDING_DIMENSIONS/);
  });
});
