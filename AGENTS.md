# AGENTS.md

@README.md has what this service does and how to configure/run it.
@CONTRIBUTING.md has dev setup, the commit convention, and the release process — read it before committing or touching CI.

## Layout

- `src/config.ts` — env-only config loading. Has **zero knowledge of any particular source** —
  don't add a source-specific env var or default here, ever; that's exactly the coupling this
  service is designed to avoid. `SEMANTICD_ADAPTER_MODULE`/`SEMANTICD_ADAPTER_EXPORT` are the only
  seam to a concrete source.
- `src/adapter-loader.ts` — dynamically `import()`s the module named by `SEMANTICD_ADAPTER_MODULE`
  and calls its `SEMANTICD_ADAPTER_EXPORT` (default `createAdapter`) zero-arg factory to get a
  `SourceAdapter`. A relative specifier resolves against `process.cwd()`, not this module's own
  location — see its own doc comment for why that distinction matters.
- `src/engine.ts` — wires a loaded adapter to an open `@myceliumhq/index` vector index (sync +
  search). Entirely generic over the adapter's `TId`.
- `src/server.ts` — plain `node:http` server: `GET /health`, `GET /query`, `POST /reindex`. No
  source-selecting param anywhere — one process wraps exactly one adapter.
- `src/index.ts` — entrypoint: config → adapter-loader → embedding provider → engine → periodic
  sync loop → HTTP server → SIGTERM/SIGINT graceful shutdown.
- `src/test-fixtures/` — fixture adapter modules for `adapter-loader.test.ts`. Excluded from the
  build (`tsconfig.json`'s `exclude`) so they never end up in the published `dist/`.

## Things not to re-derive

- **No source-specific code, ever, anywhere in this repo** — not even as a descriptive example in
  a comment or the package description. If you're tempted to add one, it belongs in that source's
  own `semantic-adapter.ts` (e.g. `@myceliumhq/tri`'s), not here.
- **`server.listen()`'s error handling matters**: a bind failure (`EADDRINUSE`, permission denied)
  emits `'error'` on the `http.Server`, not the `listen()` callback — with no listener, Node's
  default behavior is to throw and crash the process outside `index.ts`'s own `main().catch()`.
  `server.ts`'s `listen()` wires `server.once('error', reject)` before calling `.listen()` — don't
  remove that.
- **Numeric env vars are validated, not `Number()`-coerced blindly** — an unvalidated `NaN` doesn't
  fail cleanly: it propagates into `server.listen(NaN)` (a confusing `RangeError`) or
  `setInterval(fn, NaN)` (spec-clamped to effectively 0, a busy loop). `config.ts`'s
  `parsePositiveInt`/`optionalPositiveInt`/`requiredPositiveInt` exist for exactly this — use them
  for any new numeric config, don't add a bare `Number(process.env.X)`.
