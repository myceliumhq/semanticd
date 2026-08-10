# semanticd

[![CI](https://github.com/myceliumhq/semanticd/actions/workflows/ci.yml/badge.svg)](https://github.com/myceliumhq/semanticd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A generic semantic search sidecar. Syncs a local vector index over any source that ships a
`SourceAdapter`, loaded by module name at runtime -- `semanticd` itself has no knowledge of any
particular source (not Trilium, not paperless-ngx, not anything else).

One `semanticd` process wraps exactly one source -- run it as a sidecar next to the service it
indexes (a Trilium instance, a paperless-ngx instance, ...), each with its own port and index
file, rather than one central process that has to know about every source type.

## Install

```bash
npm install --global @myceliumhq/semanticd
```

## Configure and run

```bash
export SEMANTICD_ADAPTER_MODULE=@myceliumhq/tri/semantic-adapter
export EMBEDDING_PROVIDER=local   # zero-API-key CPU model; or openai-compatible, see below
export TRILIUM_URL=https://trilium.example.com
export TRILIUM_TOKEN=your-etapi-token

semanticd
```

See [`.env.example`](./.env.example) for the full list of env vars.

## Bring your own source

Any module can be a source for `semanticd` -- it just needs to export a zero-argument factory
returning a [`SourceAdapter`](https://github.com/myceliumhq/toolkit/tree/main/packages/index):

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

Point `SEMANTICD_ADAPTER_MODULE` at it (an installed package name, or an absolute/relative file
path -- relative paths resolve against the process's working directory). `@myceliumhq/tri` and
`@myceliumhq/ppl` both ship a `./semantic-adapter` entrypoint following this exact convention.

## HTTP API

| Endpoint | What it does |
| --- | --- |
| `GET /health` | This sidecar's index size and last-sync status -- `{ ok, sourceCount, syncing, lastSyncAt, lastError }` |
| `GET /query?q=<text>&limit=<n>` | Ranked semantic matches -- `{ query, matches: [{ sourceId, snippet, score, startLine, endLine }] }` |
| `POST /reindex` | Trigger an out-of-schedule sync pass (fire-and-forget, `202 Accepted`) |

## Config

| Env var | Required | Notes |
| --- | --- | --- |
| `SEMANTICD_ADAPTER_MODULE` | yes | Module to load the adapter from |
| `SEMANTICD_ADAPTER_EXPORT` | no | Export name of the zero-arg factory. Default `createAdapter` |
| `SEMANTICD_PORT` | no | Default `4499` |
| `SEMANTICD_INDEX_PATH` | no | Default `./semanticd.db` |
| `SEMANTICD_SYNC_INTERVAL_MS` | no | Default `900000` (15 min) |
| `EMBEDDING_PROVIDER` | no | `openai-compatible` (default) or `local` (zero-API-key CPU model) |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | for `openai-compatible` | Any OpenAI-compatible `/v1/embeddings` endpoint -- OpenAI, OpenRouter, Ollama, vLLM, LM Studio, ... |

Graceful shutdown on `SIGTERM`/`SIGINT`: stops accepting new connections, lets in-flight requests
finish, then closes the index file cleanly -- safe to redeploy in a container.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and commit conventions.
