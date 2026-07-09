# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`payload-db-sqlite-documents` is a [Payload CMS](https://payloadcms.com) database adapter. It stores data in SQLite, but in a **schemaless / "documents" style** rather than the relational style used by the official `@payloadcms/db-sqlite` adapter — closer in spirit to how `@payloadcms/db-mongodb` stores whole documents.

The primary audience is projects that run `@payloadcms/db-mongodb` in production (and therefore don't track migrations — Mongo is schemaless) but want a local-dev/preview-deployment experience that doesn't require standing up a real MongoDB instance (e.g. on DigitalOcean). Because storage is schemaless and migration-less like Mongo, but backed by a single SQLite file, this adapter also makes it practical to source-control the database file itself, which is handy for local development and preview environments. Production use isn't discouraged, but local development is the primary design target.

**Implementation is just getting started.** `src/index.ts` exports `sqliteDocumentsAdapter(args)`, wired up in Payload's factory shape: it returns a `DatabaseAdapterObj` whose `init({ payload })` consumes Payload's `createDatabaseAdapter` helper to build the adapter. Transactions use Payload's `defaultBeginTransaction()` plus no-op commit/rollback; **every data method (`create`, `find`, versions, globals, …) is currently a `notImplemented` stub that throws.** No SQLite driver is wired up yet (there's a `TODO` in `init` for the connection handle — driver still TBD, likely `better-sqlite3`). `defaultIDType` is `"text"` to match the `db-mongodb` audience.

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
- `vite.config.mjs` builds `src/index.ts` as an ES library entry to `dist/index.js`; the `rolldownOptions.external` list keeps peer/runtime dependencies out of the bundle so only `src/**` is bundled — Node builtins (with and without the `node:` prefix) plus `payload`. Each new runtime dependency (e.g. the eventual SQLite driver) must be added to this list explicitly. `package.json#exports` and `#types` point at `dist/index.js` / `dist/index.d.ts` — if new entry points are added (mirroring `db-sqlite`'s subpath exports, e.g. a `./types` export), they need to be added in three places: `vite.config.mjs` `build.lib.entry`, `tsconfig.json`/`tsconfig.build.json` (if scope changes), and `package.json#exports`.
- CI (`.github/workflows/quality-assurance.yml`) runs against Node 22/24/26. The `quality-assurance` job matrix re-runs `yarn up @types/node@<version>` per Node version before typechecking, so typechecking is validated against each supported Node's types — don't assume a single pinned `@types/node` version is authoritative.
- `.release-it.js` runs `prettier --check`, `tsc` (typecheck-only via the base config's `noEmit`), `eslint .`, and `yarn test` as pre-release gates (`before:init`), and rebuilds (`after:bump`) before publishing. Releases require a clean working directory on `main` with an upstream branch.

## Coding conventions

- **Prefer runtime narrowing over `as` type-casts** when a value's type isn't actually guaranteed — e.g. fields off `Record<string, unknown>` like `data.id` in the handlers. An `as` cast only silences the compiler and lets malformed values pass straight through; a `typeof` guard (or zod `safeParse`) validates at runtime _and_ narrows honestly. Example from `src/handlers/create.ts`: `typeof data.id === "number" || typeof data.id === "string" ? data.id : undefined`. zod is fine where a plain guard can't express the check cleanly, but it isn't a dependency yet — adding it also means updating the `external` list in `vite.config.mjs`.
- **Prefer destructured (named) params over positional arguments** for helpers and internal functions — e.g. `ensureCollectionTable({ connection, slug })` rather than `ensureCollectionTable(connection, slug)`. Named params keep call sites self-documenting and order-independent. The exception is where a signature is dictated externally: the Payload adapter methods (`create`, `find`, …) are regular functions so Payload can bind `this` to the live adapter, which necessarily occupies the first position.
