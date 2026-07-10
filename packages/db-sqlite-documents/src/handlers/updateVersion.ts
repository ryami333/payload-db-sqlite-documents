import type { UpdateVersion } from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update a single version record — located by `id` or `where` — and return it
 * (or `null` when `returning` is `false`, or when nothing matched).
 *
 * `versionData`'s fields (`version`, `latest`, `parent`, `createdAt`,
 * `updatedAt`, `publishedLocale`) map onto the record's top level, so it's a
 * shallow merge over the existing record — this is the path Payload uses to
 * toggle `latest` and to overwrite the snapshot. `undefined` fields are dropped
 * so they don't clobber existing values; the record's `id` is preserved.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const updateVersion: UpdateVersion = async function updateVersion(
  this: SQLiteDocumentsAdapter,
  { id, collection, returning, versionData, where },
) {
  const table = ensureVersionsTable({ connection: this.connection });

  const whereFragment =
    id === undefined
      ? whereToSqlFragment(where)
      : whereToSqlFragment({ id: { equals: String(id) } });

  const row = this.connection
    .prepare(
      `SELECT doc FROM ${table} WHERE collection_slug = ? AND ${whereFragment.sql} LIMIT 1`,
    )
    .get(collection, ...whereFragment.params);

  const existing =
    row && typeof row.doc === "string" ? JSON.parse(row.doc) : null;

  // Only the defined keys of versionData should override; a stray `undefined`
  // must not wipe an existing field.
  const patch = Object.fromEntries(
    Object.entries(versionData).filter(([, value]) => value !== undefined),
  );
  const doc = existing ? { ...existing, ...patch, id: existing.id } : null;

  if (doc) {
    this.connection
      .prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`)
      .run(JSON.stringify(doc), doc.id);
  }

  return returning === false ? null : doc;
};
