import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SourceAdapter } from "@myceliumhq/index";

// A relative specifier ("./adapter.js") passed straight to import() would
// resolve against this module's own location (Node/ESM semantics), not
// the process's working directory an operator naturally expects when
// setting an env var pointing at a local file -- resolve it against
// process.cwd() first so `SEMANTICD_ADAPTER_MODULE=./adapter.js` behaves
// the way a path-shaped env var normally does. Bare specifiers (package
// names) and already-absolute paths pass through untouched.
function resolveModuleSpecifier(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith(".") || isAbsolute(moduleSpecifier)) {
    return pathToFileURL(resolve(process.cwd(), moduleSpecifier)).href;
  }
  return moduleSpecifier;
}

// The one integration seam between the generic engine and a concrete
// source: `moduleSpecifier` is anything Node's dynamic import() accepts
// (an installed package name or an absolute/relative file path, the
// latter resolved against process.cwd()) and `exportName` names a
// zero-argument factory on that module returning a ready SourceAdapter --
// synchronously or via a Promise. The factory is responsible for
// resolving its own connection config (env vars, a config file, whatever)
// and constructing its own client; semanticd never sees any of that.
export async function loadAdapter(
  moduleSpecifier: string,
  exportName: string,
): Promise<SourceAdapter<string | number>> {
  const mod: Record<string, unknown> = await import(resolveModuleSpecifier(moduleSpecifier));
  const factory = mod[exportName];
  if (typeof factory !== "function") {
    throw new Error(
      `semanticd: module '${moduleSpecifier}' has no export '${exportName}' (or it isn't a function) -- ` +
        "expected a zero-argument factory returning a SourceAdapter",
    );
  }
  const adapter = await (
    factory as () => SourceAdapter<string | number> | Promise<SourceAdapter<string | number>>
  )();
  if (
    !adapter ||
    typeof adapter.listChanged !== "function" ||
    typeof adapter.fetchContent !== "function"
  ) {
    throw new Error(
      `semanticd: '${moduleSpecifier}'.${exportName}() did not return a SourceAdapter ` +
        "(missing listChanged/fetchContent)",
    );
  }
  return adapter;
}
