# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`payload-db-sqlite-documents` is a [Payload CMS](https://payloadcms.com) database adapter. It stores data in SQLite, but in a **schemaless / "documents" style** rather than the relational style used by the official `@payloadcms/db-sqlite` adapter — closer in spirit to how `@payloadcms/db-mongodb` stores whole documents.

The primary audience is projects that run `@payloadcms/db-mongodb` in production (and therefore don't track migrations — Mongo is schemaless) but want a local-dev/preview-deployment experience that doesn't require standing up a real MongoDB instance (e.g. on DigitalOcean). Because storage is schemaless and migration-less like Mongo, but backed by a single SQLite file, this adapter also makes it practical to source-control the database file itself, which is handy for local development and preview environments. Production use isn't discouraged, but local development is the primary design target.

**Current state.** `src/index.ts` exports `sqliteDocumentsAdapter(args)`, wired up in Payload's factory shape: it returns a `DatabaseAdapterObj` whose `init({ payload })` consumes Payload's `createDatabaseAdapter` helper to build the adapter. The SQLite driver is Node's built-in `node:sqlite` (`DatabaseSync`), opened on the `filename` arg (default `":memory:"`); the handle is surfaced on the adapter as `connection` and every data method reaches it via `this.connection`. `defaultIDType` is `"text"` to match the `db-mongodb` audience.

**All data methods are implemented** — collections (`create`/`find`/`findOne`/`count`/`findDistinct`/`updateOne`/`updateMany`/`deleteOne`/`deleteMany`/`upsert`), globals, versions, and global versions — each a handler in `src/handlers/` built on a shared helper layer in `src/helpers/` (`whereToSqlFragment`, `sortToSqlFragment`, `fieldToColumnSqlFragment`, `buildPaginationMeta`, `readVersionsPage`, the `ensure*Table` creators, `quoteSqliteIdentifier`). Storage is schemaless: each collection gets its own table with a text `id` column and the whole document as JSON in a `doc` column; globals share a `payload_globals` table (keyed by slug) and all versions share a `payload_versions` table (scoped by `collection_slug`/`global_slug`). Queries compile a Payload `Where` to parameterised SQL over `json_extract(doc, …)`. Transactions are real (`createTransactionManager`): `BEGIN`/`COMMIT`/`ROLLBACK` on the single shared connection, with `SAVEPOINT`s for nesting — an open transaction scopes every handler's writes automatically, so handlers need no `req` plumbing.

Known gaps: the `where`/`sort` operators cover the common scalar and array set (`equals`, `not_equals`, comparisons, `in`/`not_in`, `all`, `exists`, `contains`/`like`) but not the geo operators (`within`, `intersects`, `near`), which throw; the single shared connection means genuinely concurrent transactions aren't isolated (a local-dev tradeoff).

## API design target

Payload has no official guide for writing custom database adapters — the closest thing to documentation is the [`BaseDatabaseAdapter` interface](https://github.com/payloadcms/payload/blob/main/packages/payload/src/database/types.ts) in `payloadcms/payload`.

The best reference implementation to study is [`@payloadcms/db-sqlite`](https://github.com/payloadcms/payload/tree/main/packages/db-sqlite). This adapter's public API (exported functions, adapter options, generated types) should aim for **near-parity with `db-sqlite`**, even though the internal storage strategy is different (documents/schemaless here vs. relational/schema-based there).

## Repository layout

This is a **Yarn workspaces monorepo** with two workspaces:

- **`packages/db-sqlite-documents/`** — the published library (`name: payload-db-sqlite-documents`). Everything the package ships lives here: `src/`, the tsconfigs, `vite.config.mjs`, `vitest.config.mjs`, `eslint.config.mjs`, `.release-it.js`, `README.md`. **Throughout this doc, unqualified `src/…` paths refer to `packages/db-sqlite-documents/src/…`.**
- **`sandbox/`** — a private (never-published) Next + Payload app that consumes the library via `"payload-db-sqlite-documents": "workspace:*"` to exercise it during local development. It imports the library's **built `dist/`**, so run `yarn build` before/while working in the sandbox. Its Payload admin scaffolding lives under `sandbox/src/app/(payload)/`; a `payload.config.ts` wires up `sqliteDocumentsAdapter`.

The **root** `package.json` is private, holds the `workspaces` array and thin delegating scripts, and keeps repo-wide tooling (`prettier`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`). Yarn config (`.yarnrc.yml`, `.yarn/`) and the single `yarn.lock` stay at the root.

## Commands

Run from the repo root. The root scripts delegate to the library workspace:

```sh
yarn build       # → library: vite build (bundles src -> dist/index.js) + tsc (emits dist/index.d.ts)
yarn test        # → library: vitest run — single run, used in CI
yarn test:watch  # → library: vitest — watch mode
yarn lint        # → library: eslint .
yarn tsc         # → library: typecheck only (base tsconfig sets noEmit; declarations are emitted by `yarn build`)
yarn release     # → library: release-it — bumps version, tags, publishes to npm, creates GitHub release
yarn sandbox         # sandbox: next dev  (build the library first)
yarn sandbox:build   # sandbox: next build
```

Any of these can also be run directly against a workspace, e.g. `yarn workspace payload-db-sqlite-documents test` or `yarn workspace sandbox dev`. Formatting is repo-wide from the root: `yarn prettier . --check`.

To run a single test file: `yarn workspace payload-db-sqlite-documents vitest run src/index.test.mjs`. To run tests matching a name: append `-t "pattern"`.

**After making any code changes, format the touched files:**

```sh
yarn prettier <path> --write
```

## Tooling notes

- Package manager is **Yarn Berry (4.17.1)**, pinned via `packageManager` in the root `package.json` and vendored at `.yarn/releases/yarn-4.17.1.cjs`, with `nodeLinker: node-modules` (in `.yarnrc.yml`). Use `yarn`, not `npm`. There is one `yarn.lock` at the root covering every workspace.
- The library's source is **TypeScript** (`.ts`) in `packages/db-sqlite-documents/src/`. Vite compiles/bundles it and `tsc --emitDeclarationOnly` generates `.d.ts` declarations. `tsconfig.json`'s `include` is scoped to `src/**/*` — its sibling config files are intentionally not typechecked by `tsc`. `allowJs` + `checkJs` are on, so the `.mjs` test files are typechecked too (Vitest still transforms/runs them via Vite). (The `sandbox/` workspace has its own separate `tsconfig.json` for Next.)
- The library has **two tsconfigs** (both under `packages/db-sqlite-documents/`): `tsconfig.json` is typecheck-only (`noEmit: true`) and covers everything under `src/` including `*.test.mjs` — this is what `yarn tsc` uses. `tsconfig.build.json` extends it, flips `noEmit` off (`emitDeclarationOnly`), and excludes test files; this is what `yarn build`'s `tsc` step uses, so test declarations never leak into `dist/` (and thus into the published package).
- `vite.config.mjs` builds `src/index.ts` as an ES library entry to `dist/index.js`; the `rolldownOptions.external` list keeps peer/runtime dependencies out of the bundle so only `src/**` is bundled — Node builtins (with and without the `node:` prefix) plus `payload`. **`node:sqlite` is externalized explicitly** (as both `"sqlite"` and `"node:sqlite"`) because it is still experimental and Node omits `"sqlite"` from `module.builtinModules`; without that, Vite treats it as a bare dependency and stubs it out "for browser compatibility", leaving `DatabaseSync` undefined in the built `dist/` (the library's own tests wouldn't catch this — they run against `src/`, not `dist/`; the `sandbox` consuming `dist/` is what surfaces it). Each new runtime dependency must be added to this list explicitly. `package.json#exports` and `#types` point at `dist/index.js` / `dist/index.d.ts` — if new entry points are added (mirroring `db-sqlite`'s subpath exports, e.g. a `./types` export), they need to be added in three places: `vite.config.mjs` `build.lib.entry`, `tsconfig.json`/`tsconfig.build.json` (if scope changes), and `package.json#exports`.
- CI (`.github/workflows/quality-assurance.yml`) runs against Node 22/24/26. The `quality-assurance` job matrix runs `yarn workspace payload-db-sqlite-documents test` on each Node version; the `formatting` job runs `yarn workspace payload-db-sqlite-documents build`, `… lint`, `… tsc`, and the repo-wide `yarn prettier . --check` on Node 22. Install (`yarn install --immutable`) happens once at the root and provisions all workspaces (including the sandbox's Next/Payload deps).
- `.release-it.js` lives in `packages/db-sqlite-documents/` and releases run from that workspace. It runs `prettier . --check`, `tsc` (typecheck-only via the base config's `noEmit`), `eslint .`, and `yarn test` as pre-release gates (`before:init`), and rebuilds (`after:bump`) before publishing. Releases require a clean working directory on `main` with an upstream branch.

## Coding conventions

- **Prefer runtime narrowing over `as` type-casts** when a value's type isn't actually guaranteed — e.g. fields off `Record<string, unknown>` like `data.id` in the handlers. An `as` cast only silences the compiler and lets malformed values pass straight through; a `typeof` guard (or zod `safeParse`) validates at runtime _and_ narrows honestly. Example from `src/handlers/create.ts`: `typeof data.id === "number" || typeof data.id === "string" ? data.id : undefined`. zod is fine where a plain guard can't express the check cleanly, but it isn't a dependency yet — adding it also means updating the `external` list in `vite.config.mjs`.
- **Prefer destructured (named) params over positional arguments** for helpers and internal functions — e.g. `ensureCollectionTable({ connection, slug })` rather than `ensureCollectionTable(connection, slug)`. Named params keep call sites self-documenting and order-independent. The exception is where a signature is dictated externally: the Payload adapter methods (`create`, `find`, …) are regular functions so Payload can bind `this` to the live adapter, which necessarily occupies the first position.
- **Name helper modules after their primary named export** — `src/helpers/ensureCollectionTable.ts` exports `ensureCollectionTable`, `src/helpers/quoteSqliteIdentifier.ts` exports `quoteSqliteIdentifier`. The filename should match the export it's named for exactly (camelCase), so a module is findable by its export name and vice versa.
