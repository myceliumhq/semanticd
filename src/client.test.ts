import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemanticdClient } from "./client.js";

describe("createSemanticdClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("query() sends q/limit and returns the matches array, stripping trailing slashes from baseUrl", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ query: "book", matches: [{ sourceId: "a", snippet: "s", score: 0.9 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createSemanticdClient("http://localhost:4499/");
    const matches = await client.query("book", 5);

    expect(matches).toEqual([{ sourceId: "a", snippet: "s", score: 0.9 }]);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("http://localhost:4499/query?q=book&limit=5");
  });

  it("query() omits limit from the query string when not given", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ query: "x", matches: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await createSemanticdClient("http://localhost:4499").query("x");

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("http://localhost:4499/query?q=x");
  });

  it("health() returns the parsed health payload", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, sourceCount: 3, syncing: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const health = await createSemanticdClient("http://localhost:4499").health();

    expect(health).toEqual({ ok: true, sourceCount: 3, syncing: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4499/health");
  });

  it("reindex() POSTs and resolves without a return value", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ accepted: true }, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSemanticdClient("http://localhost:4499").reindex()).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4499/reindex");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ method: "POST" });
  });

  it("throws with status and body text on a non-ok response", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("missing required query param: q", { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSemanticdClient("http://localhost:4499").query("")).rejects.toThrow(
      /400.*missing required query param/,
    );
  });
});
