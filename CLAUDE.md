# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`payload-db-sqlite-documents` is a [Payload CMS](https://payloadcms.com) database adapter. It stores data in SQLite, but in a **schemaless / "documents" style** rather than the relational style used by the official `@payloadcms/db-sqlite` adapter — closer in spirit to how `@payloadcms/db-mongodb` stores whole documents.

The primary audience is projects that run `@payloadcms/db-mongodb` in production (and therefore don't track migrations — Mongo is schemaless) but want a local-dev/preview-deployment experience that doesn't require standing up a real MongoDB instance (e.g. on DigitalOcean). Because storage is schemaless and migration-less like Mongo, but backed by a single SQLite file, this adapter also makes it practical to source-control the database file itself, which is handy for local development and preview environments. Production use isn't discouraged, but local development is the primary design target.

**No implementation exists yet.** `src/index.mjs` is currently a hello-world placeholder. Only the tooling/build setup is in place.

## API design target

Payload has no official guide for writing custom database adapters — the closest thing to documentation is the [`BaseDatabaseAdapter` interface](https://github.com/payloadcms/payload/blob/main/packages/payload/src/database/types.ts) in `payloadcms/payload`.

The best reference implementation to study is [`@payloadcms/db-sqlite`](https://github.com/payloadcms/payload/tree/main/packages/db-sqlite). This adapter's public API (exported functions, adapter options, generated types) should aim for **near-parity with `db-sqlite`**, even though the internal storage strategy is different (documents/schemaless here vs. relational/schema-based there).

## Commands

```sh
yarn build       # vite build (bundles src -> dist/index.js) + tsc (emits dist/index.d.ts)
yarn test        # vitest run — single run, used in CI
yarn test:watch  # vitest — watch mode
yarn lint        # eslint .
yarn tsc         # typecheck only (base tsconfig sets noEmit; declarations are emitted by `yarn build`)
yarn release     # release-it — bumps version, tags, publishes to npm, creates GitHub release
```

To run a single test file: `yarn vitest run src/index.test.mjs`. To run tests matching a name: `yarn vitest run -t "pattern"`.

**After making any code changes, format the touched files:**

```sh
yarn prettier <path> --write
```

## Tooling notes

- Package manager is **Yarn Berry (4.17.0)**, pinned via `packageManager` in `package.json` and vendored at `.yarn/releases/yarn-4.17.0.cjs`. Use `yarn`, not `npm`.
- Source is **TypeScript** (`.ts`) in `src/`. Vite compiles/bundles it and `tsc --emitDeclarationOnly` generates `.d.ts` declarations. `tsconfig.json`'s `include` is scoped to `src/**/*` — root-level config files are intentionally not typechecked by `tsc`. `allowJs` + `checkJs` are on, so the `.mjs` test files are typechecked too (Vitest still transforms/runs them via Vite).
- There are **two tsconfigs**: `tsconfig.json` is typecheck-only (`noEmit: true`) and covers everything under `src/` including `*.test.mjs` — this is what `yarn tsc` uses. `tsconfig.build.json` extends it, flips `noEmit` off (`emitDeclarationOnly`), and excludes test files; this is what `yarn build`'s `tsc` step uses, so test declarations never leak into `dist/` (and thus into the published package).
- `vite.config.mjs` builds `src/index.ts` as an ES library entry to `dist/index.js`; Node builtins are externalized rather than bundled. `package.json#exports` and `#types` point at `dist/index.js` / `dist/index.d.ts` — if new entry points are added (mirroring `db-sqlite`'s subpath exports, e.g. a `./types` export), they need to be added in three places: `vite.config.mjs` `build.lib.entry`, `tsconfig.json`/`tsconfig.build.json` (if scope changes), and `package.json#exports`.
- CI (`.github/workflows/quality-assurance.yml`) runs against Node 22/24/26. The `quality-assurance` job matrix re-runs `yarn up @types/node@<version>` per Node version before typechecking, so typechecking is validated against each supported Node's types — don't assume a single pinned `@types/node` version is authoritative.
- `.release-it.js` runs `prettier --check`, `tsc --noEmit`, `eslint .`, and `yarn test` as pre-release gates (`before:init`), and rebuilds (`after:bump`) before publishing. Releases require a clean working directory on `main` with an upstream branch.
