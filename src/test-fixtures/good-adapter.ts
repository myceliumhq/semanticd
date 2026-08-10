import type { SourceAdapter } from "@myceliumhq/index";

export function createAdapter(): SourceAdapter<string> {
  return {
    name: "fixture",
    async *listChanged() {},
    async fetchContent() {
      return "";
    },
  };
}

export function createAdapterAsync(): Promise<SourceAdapter<string>> {
  return Promise.resolve(createAdapter());
}

export const notAFunction = 42;
