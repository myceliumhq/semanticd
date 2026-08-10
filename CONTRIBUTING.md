# Contributing

## Dev setup

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run test
```

`build`'s `tsc` excludes `*.test.ts` and `src/test-fixtures/**` (test files and fixtures shouldn't
end up in the published `dist/`), so it never type-checks tests. `typecheck` runs the same
compiler over the whole program, tests included, via `tsconfig.test.json`. `vitest run` itself
doesn't type-check either -- it transpiles with esbuild, which strips types without checking them
-- so `typecheck` is the only step that would catch a type error confined to a test file.

Node version is pinned in `.nvmrc`.

## Commit messages

This repo releases via [semantic-release](https://semantic-release.gitbook.io/semantic-release/):
every commit message on `main` must follow [Conventional Commits](https://www.conventionalcommits.org/),
because the release automation reads the commit history to decide what to publish. There is no
manual version bump -- don't edit `version` in `package.json`.

| Prefix | Effect |
| --- | --- |
| `fix: ...` | patch release |
| `feat: ...` | minor release |
| `feat!: ...` or a `BREAKING CHANGE:` footer | major release |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:` | no release |

## Release process

Merging to `main` runs [`.github/workflows/release.yml`](./.github/workflows/release.yml), which
calls [myceliumhq/.github](https://github.com/myceliumhq/.github)'s reusable release workflow:
build, test, then `semantic-release` (config in `.releaserc.json`) computes the next version from
commits since the last release tag, publishes to npm, and creates a GitHub release with generated
notes.

Requires an `NPM_TOKEN` secret (an npm automation token with publish access to `@myceliumhq`) on
this repo or inherited from an org-level secret -- releases fail cleanly with a clear error until
that's configured.
