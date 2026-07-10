import { randomUUID } from "node:crypto";

import type { UpdateGlobal } from "payload";

import { ensureGlobalsTable } from "../helpers/ensureGlobalsTable.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update a global's document, or create it if it doesn't exist yet — returning
 * the resulting document (or `null` when `returning` is `false`).
 *
 * Upserts, because Payload may call this for a global that was never explicitly
 * created: the existing `doc` (if any) is shallow-merged with `data` — the
 * `$set` semantics {@link import("./updateOne.js").updateOne} uses — and written
 * with `INSERT … ON CONFLICT(slug) DO UPDATE`. An existing global keeps its
 * `id`; a freshly-created one takes `data.id` or a generated one.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const updateGlobal: UpdateGlobal = async function updateGlobal(
  this: SQLiteDocumentsAdapter,
  { slug, data, returning },
) {
  const table = ensureGlobalsTable({ connection: this.connection });

  const row = this.connection
    .prepare(`SELECT doc FROM ${table} WHERE slug = ?`)
    .get(slug);

  const existingDoc =
    row && typeof row.doc === "string" ? JSON.parse(row.doc) : {};

  const dataId =
    typeof data.id === "number" || typeof data.id === "string"
      ? data.id
      : undefined;
  const id = existingDoc.id ?? dataId ?? randomUUID();
  const doc = { ...existingDoc, ...data, id };

  // Keep the id column (text, like collections) in step with doc.id so a
  // `where` on id resolves; slug remains the key.
  this.connection
    .prepare(
      `INSERT INTO ${table} (slug, id, doc) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET id = excluded.id, doc = excluded.doc`,
    )
    .run(slug, String(id), JSON.stringify(doc));

  return returning === false ? null : doc;
};
