import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAdapter } from "./adapter-loader.js";

// loadAdapter now resolves a relative moduleSpecifier against
// process.cwd() (see adapter-loader.ts), so these fixture paths must be
// relative to a stubbed cwd rather than to this test file's own location
// -- otherwise the tests would depend on whatever directory vitest
// happens to be invoked from.
const fixturesDir = fileURLToPath(new URL("./test-fixtures", import.meta.url));

let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  process.chdir(fixturesDir);
});
afterEach(() => {
  process.chdir(originalCwd);
});

describe("loadAdapter", () => {
  it("dynamically imports a module and calls the named export to get a SourceAdapter", async () => {
    const adapter = await loadAdapter("./good-adapter.js", "createAdapter");
    expect(adapter.name).toBe("fixture");
    expect(typeof adapter.listChanged).toBe("function");
    expect(typeof adapter.fetchContent).toBe("function");
  });

  it("awaits an async factory", async () => {
    const adapter = await loadAdapter("./good-adapter.js", "createAdapterAsync");
    expect(adapter.name).toBe("fixture");
  });

  it("throws when the named export doesn't exist", async () => {
    await expect(loadAdapter("./good-adapter.js", "doesNotExist")).rejects.toThrow(/doesNotExist/);
  });

  it("throws when the named export isn't a function", async () => {
    await expect(loadAdapter("./good-adapter.js", "notAFunction")).rejects.toThrow(/notAFunction/);
  });

  it("throws when the factory doesn't return a SourceAdapter shape", async () => {
    await expect(loadAdapter("./bad-adapter.js", "createAdapter")).rejects.toThrow(
      /did not return a SourceAdapter/,
    );
  });

  it("resolves an absolute path specifier without consulting cwd", async () => {
    const absolutePath = join(fixturesDir, "good-adapter.js");
    const adapter = await loadAdapter(absolutePath, "createAdapter");
    expect(adapter.name).toBe("fixture");
  });
});
