import type { DeleteOne } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { whereToSqlClause } from "../helpers/whereToSqlClause.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Delete a single document matching `where` and return it (or `null` when
 * `returning` is `false`, or when nothing matched).
 *
 * The row is read first — both to return the deleted document and to pin the
 * delete to that exact `id` (SQLite's `DELETE` has no `LIMIT`, so matching by
 * the located id is how we guarantee only one row goes). `where` is compiled by
 * {@link whereToSqlClause}.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const deleteOne: DeleteOne = async function deleteOne(
  this: SQLiteDocumentsAdapter,
  { collection, returning, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const { clause, params } = whereToSqlClause(where);

  const row = this.connection
    .prepare(`SELECT id, doc FROM ${table} WHERE ${clause} LIMIT 1`)
    .get(...params);

  // Nothing matched, or a row we can't read back as our own JSON — nothing to
  // delete.
  if (!row || typeof row.id !== "string" || typeof row.doc !== "string") {
    return null;
  }

  this.connection.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);

  return returning === false ? null : JSON.parse(row.doc);
};
