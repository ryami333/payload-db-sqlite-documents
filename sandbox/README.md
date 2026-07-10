# sandbox

A [Next.js](https://nextjs.org) + [Payload](https://payloadcms.com) app that
consumes the sibling `payload-db-sqlite-documents` package (via
`workspace:*`) as its database adapter. It exists to exercise the adapter in a
real Payload instance during local development — it is private and never
published.

## Prerequisites

The sandbox imports the adapter from its **built** `dist/` output, so build the
package first (from the repo root):

```sh
yarn build            # builds packages/db-sqlite-documents
```

## Running

From the repo root:

```sh
yarn sandbox          # next dev  → http://localhost:3000
```

Then open http://localhost:3000/admin to create the first user and use the
admin panel. The frontend at http://localhost:3000 shows a live post count read
back through the adapter.

If you change the adapter source, rebuild it (`yarn build`, or
`yarn workspace payload-db-sqlite-documents build --watch`) so the sandbox picks
up the new `dist/`.

## Data

Data is stored in `payload-db.sqlite` (git-ignored by default). Because the
adapter stores whole documents Mongo-style, you can un-ignore that file to
source-control a seeded local database for previews.

## Codegen

```sh
yarn workspace sandbox generate:importmap   # refresh admin importMap
yarn workspace sandbox generate:types       # refresh payload-types.ts
```
