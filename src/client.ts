import type { SemanticMatch } from "@myceliumhq/index";

export type SemanticdHealth = {
  ok: boolean;
  sourceCount: number;
  syncing: boolean;
  lastSyncAt?: string;
  lastError?: string;
};

export type SemanticdClient = {
  query: (q: string, limit?: number) => Promise<SemanticMatch[]>;
  health: () => Promise<SemanticdHealth>;
  reindex: () => Promise<void>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`semanticd request to ${url} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// A thin fetch() wrapper over semanticd's own HTTP API (GET /health,
// GET /query, POST /reindex -- see README). Every host that wants to query
// a semanticd sidecar (tri, ppl, ...) needs the exact same three calls, so
// this lives here once instead of getting reimplemented per host.
export function createSemanticdClient(baseUrl: string): SemanticdClient {
  const base = baseUrl.replace(/\/+$/, "");

  return {
    query: async (q, limit) => {
      const params = new URLSearchParams({ q });
      if (limit !== undefined) params.set("limit", String(limit));
      const body = await requestJson<{ query: string; matches: SemanticMatch[] }>(
        `${base}/query?${params}`,
      );
      return body.matches;
    },
    health: () => requestJson<SemanticdHealth>(`${base}/health`),
    reindex: async () => {
      await requestJson<{ accepted: boolean }>(`${base}/reindex`, { method: "POST" });
    },
  };
}
