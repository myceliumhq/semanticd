# semanticd

[![CI](https://github.com/myceliumhq/semanticd/actions/workflows/ci.yml/badge.svg)](https://github.com/myceliumhq/semanticd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A library for running a semantic search sidecar over any source that ships a
[`SourceAdapter`](https://github.com/myceliumhq/toolkit/tree/main/packages/index) --
`semanticd` itself has no knowledge of any particular source (not Trilium, not paperless-ngx, not
anything else). It has no executable of its own: the package that owns an adapter (e.g.
`@myceliumhq/tri`, `@myceliumhq/ppl`) imports `runSemanticd()`, passes its own adapter in
directly, and ships its own thin binary and container image (`tri-semanticd`, `ppl-semanticd`) --
the adapter is wired in as real, compile-time-checked TypeScript, not resolved by a runtime
module specifier.

One sidecar process wraps exactly one source -- run it next to the service it indexes (a Trilium
instance, a paperless-ngx instance, ...), each with its own port and index file, rather than one
central process that has to know about every source type.

## Use

```ts
import { runSemanticd } from "@myceliumhq/semanticd";
import { createAdapter } from "./my-source-adapter.js";

const handle = await runSemanticd(createAdapter());
// handle.close() stops the sync timer, stops accepting new HTTP connections
// (letting in-flight ones finish), and closes the index file. Wired to
// SIGTERM/SIGINT automatically -- pass { handleSignals: false } to opt out
// and call close() yourself instead.
```

`runSemanticd`'s config (port, index path, sync interval, embedding provider) is read from env
vars by default (`loadSemanticdConfig()`, exported separately if you want to inspect or override
it before calling `runSemanticd`) -- see [`.env.example`](./.env.example) for the full list.

## Bring your own source

Any package can be a source -- it just needs a factory returning a `SourceAdapter`:

```ts
import type { SourceAdapter } from "@myceliumhq/index";

export function createAdapter(): SourceAdapter<string | number> {
  // Read your own connection config from env vars/files here -- semanticd
  // never sees it, only the adapter this function returns.
  return {
    name: "my-source",
    async *listChanged(since) {
      // yield { id, contentHash, modifiedAt } for everything changed since `since`
    },
    async fetchContent(id) {
      // return the full text content for `id`
    },
  };
}
```

Then build a thin binary around it with `runSemanticd(createAdapter())`, the same way
`@myceliumhq/tri` and `@myceliumhq/ppl` each do.

## Querying a deployed sidecar

Anything that wants to *query* a running sidecar (rather than run one itself) uses
`createSemanticdClient` instead of hand-rolling the fetch() calls:

```ts
import { createSemanticdClient } from "@myceliumhq/semanticd";

const client = createSemanticdClient("http://tri-semanticd:4499");
const matches = await client.query("book recommendations", 5);
const health = await client.health();
await client.reindex();
```

This is how `tri`'s and `ppl`'s own standalone MCP servers talk to their `tri-semanticd`/
`ppl-semanticd` sidecars (`TRILIUM_SEMANTICD_URL`/`PAPERLESS_SEMANTICD_URL`) instead of running a
second, redundant embedding/index engine in-process.

## HTTP API

| Endpoint | What it does |
| --- | --- |
| `GET /health` | This sidecar's index size and last-sync status -- `{ ok, sourceCount, syncing, lastSyncAt, lastError }` |
| `GET /query?q=<text>&limit=<n>` | Ranked semantic matches -- `{ query, matches: [{ sourceId, snippet, score, startLine, endLine }] }` |
| `POST /reindex` | Trigger an out-of-schedule sync pass (fire-and-forget, `202 Accepted`) |

## Config

| Env var | Required | Notes |
| --- | --- | --- |
| `SEMANTICD_PORT` | no | Default `4499` |
| `SEMANTICD_INDEX_PATH` | no | Default `./semanticd.db` |
| `SEMANTICD_SYNC_INTERVAL_MS` | no | Default `900000` (15 min) |
| `EMBEDDING_PROVIDER` | no | `openai-compatible` (default) or `local` (zero-API-key CPU model) |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | for `openai-compatible` | Any OpenAI-compatible `/v1/embeddings` endpoint -- OpenAI, OpenRouter, Ollama, vLLM, LM Studio, ... |

Graceful shutdown on `SIGTERM`/`SIGINT`: stops accepting new connections, lets in-flight requests
finish, then closes the index file cleanly -- safe to redeploy in a container.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and commit conventions.
