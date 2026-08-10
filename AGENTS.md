# AGENTS.md

@README.md has what this service does and how to configure/run it.
@CONTRIBUTING.md has dev setup, the commit convention, and the release process — read it before committing or touching CI.

## Layout

- `src/config.ts` — env-only config loading for what's generic across every adapter (port, index
  path, sync interval, embedding provider). Has **zero knowledge of any particular source** —
  don't add a source-specific env var or default here, ever; that's exactly the coupling this
  library is designed to avoid.
- `src/engine.ts` — wires a caller-supplied adapter to an open `@myceliumhq/index` vector index
  (sync + search). Entirely generic over the adapter's `TId`.
- `src/server.ts` — plain `node:http` server: `GET /health`, `GET /query`, `POST /reindex`. No
  source-selecting param anywhere — one process wraps exactly one adapter.
- `src/index.ts` — the public library entrypoint: `runSemanticd(adapter, options?)` wires config →
  embedding provider → engine → periodic sync loop → HTTP server → (by default)
  SIGTERM/SIGINT graceful shutdown, and returns a `{ close }` handle. Also re-exports the lower-
  level pieces (`loadSemanticdConfig`, `createEngine`, `createSemanticdServer`) for callers that
  want to compose their own wiring instead.

## Things not to re-derive

- **No source-specific code, ever, anywhere in this repo** — not even as a descriptive example in
  a comment or the package description. The adapter is always supplied by `runSemanticd`'s caller;
  if you're tempted to add source-specific code here, it belongs in that source's own
  `semantic-adapter.ts` (e.g. `@myceliumhq/tri`'s), not here.
- **`server.listen()`'s error handling matters**: a bind failure (`EADDRINUSE`, permission denied)
  emits `'error'` on the `http.Server`, not the `listen()` callback — with no listener, Node's
  default behavior is to throw and crash the process outside `runSemanticd`'s own caller. `server
  .ts`'s `listen()` wires `server.once('error', reject)` before calling `.listen()` — don't remove
  that.
- **Numeric env vars are validated, not `Number()`-coerced blindly** — an unvalidated `NaN` doesn't
  fail cleanly: it propagates into `server.listen(NaN)` (a confusing `RangeError`) or
  `setInterval(fn, NaN)` (spec-clamped to effectively 0, a busy loop). `config.ts`'s
  `parsePositiveInt`/`optionalPositiveInt`/`requiredPositiveInt` exist for exactly this — use them
  for any new numeric config, don't add a bare `Number(process.env.X)`.
