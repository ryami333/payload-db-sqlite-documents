# payload-db-sqlite-documents

A [Payload CMS](https://payloadcms.com) database adapter that stores data in **SQLite**, but in a **schemaless / "documents" style** — each document is kept as a whole JSON blob, in the spirit of [`@payloadcms/db-mongodb`](https://github.com/payloadcms/payload/tree/main/packages/db-mongodb), rather than the relational, schema-per-field style of the official [`@payloadcms/db-sqlite`](https://github.com/payloadcms/payload/tree/main/packages/db-sqlite).

It uses Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) driver, so there are **no native dependencies** to compile.

## Why this exists

It's aimed at projects that run **`@payloadcms/db-mongodb` in production** — and therefore don't track migrations, because Mongo is schemaless — but want a local-development or preview-deployment experience that doesn't require standing up a real MongoDB instance.

Because storage is schemaless and migration-less like Mongo, yet backed by a single SQLite file, this adapter also makes it practical to **source-control the database file itself** (`git add payload.db`) — handy for reproducible local dev and preview environments where you want seed data to travel with the branch.

> **Local development is the primary design target.** Production use isn't discouraged, but see [Limitations](#limitations) before reaching for it there.

## Requirements

- **Node.js** `^22 || ^24 || ^26` — `node:sqlite` is a built-in, so no `better-sqlite3`/native build step.
- **Payload** `^3.85.2` (peer dependency).

## Installation

```sh
npm install payload-db-sqlite-documents
# or: yarn add payload-db-sqlite-documents / pnpm add payload-db-sqlite-documents
```

## Usage

Pass the adapter as `db` in your Payload config:

```ts
import { buildConfig } from "payload";
import { sqliteDocumentsAdapter } from "payload-db-sqlite-documents";

export default buildConfig({
  db: sqliteDocumentsAdapter({
    // A file path — a single, source-controllable SQLite file.
    filename: "./payload.db",
  }),
  // ...the rest of your config
});
```

For an **ephemeral** database (e.g. in tests) omit `filename` or set it to `":memory:"`:

```ts
db: sqliteDocumentsAdapter(); // defaults to ":memory:"
```

The adapter advertises `defaultIDType: "text"`, matching the `db-mongodb` audience — new collections get text (UUID) IDs unless you configure otherwise.

## Options

| Option         | Type     | Default           | Description                                                                                                                                                 |
| -------------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filename`     | `string` | `":memory:"`      | Where the SQLite database lives. Passed straight to `node:sqlite`'s `DatabaseSync`: a filesystem path (source-controllable), or `":memory:"` for ephemeral. |
| `migrationDir` | `string` | Payload's default | Directory Payload reads/writes migration files from. (Migrations are rarely relevant for the Mongo-style, schemaless target.)                               |

## How it works

Storage is schemaless — there is no per-field schema, and no migrations:

- **Collections** — each collection gets its own table with a text primary-key `id` column and the whole document serialised to JSON in a `doc` column.
- **Globals** — share a single `payload_globals` table, keyed by `slug`.
- **Versions & drafts** — share a single `payload_versions` table, scoped by `collection_slug` / `global_slug`.

Queries compile Payload's `Where` into parameterised SQL over `json_extract(doc, …)`. Field names and values are always **bound as parameters** (never string-interpolated), and table names are escaped as quoted identifiers, so slugs, field names, and values can't inject SQL.

Tables are created lazily on first write, so the file only ever contains tables for collections you've actually used.

### Query operators

The common scalar and array operators are supported:

`equals`, `not_equals`, `greater_than`, `greater_than_equal`, `less_than`, `less_than_equal`, `in`, `not_in`, `all`, `exists`, `contains`, `like`, `not_like`, plus `and` / `or` composition.

Semantics track `db-mongodb` where they differ from plain SQL:

- **`equals` / `not_equals` are array-aware** — a value matches a scalar field _or_ an element of an array field.
- **Negative operators include missing fields** — `not_equals` and `not_like` match rows where the field is absent, as Mongo does.
- **`like` splits on whitespace** — every word must appear (order-independent); `contains` is a single contiguous substring match. Both are case-insensitive (ASCII).

### Transactions

Real transactions are implemented on the single shared connection (`BEGIN` / `COMMIT` / `ROLLBACK`, with `SAVEPOINT`s for nesting), so multi-statement operations are atomic and roll back on error. Handlers need no special plumbing — an open transaction scopes every write automatically.

## Limitations

- **Geospatial operators are not supported.** `within`, `intersects`, and `near` throw — SQLite/JSON storage has no geometry support. Every other operator listed above works.
- **A single shared connection.** SQLite allows only one live transaction per connection, so genuinely concurrent transactions from separate requests are not isolated. This is fine for the local-dev / preview target, but is why production isn't the primary use case.
- **No migrations.** By design — the schemaless, Mongo-style model doesn't track them.

## Relationship to `@payloadcms/db-sqlite`

This adapter aims for **near-parity with `db-sqlite`'s public API** (exported function, adapter options, generated types), even though the internal storage strategy is completely different: documents/schemaless here vs. relational/schema-based there. If you want a production-grade, relational SQLite adapter with real migrations, use the official [`@payloadcms/db-sqlite`](https://github.com/payloadcms/payload/tree/main/packages/db-sqlite) instead.

## Development

```sh
yarn build   # bundle src -> dist/index.js (+ .d.ts declarations)
yarn test    # vitest run
yarn lint    # eslint
yarn tsc     # typecheck only
```
