import type { UpdateOne } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { whereToSqlClause } from "../helpers/whereToSqlClause.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update a single document, located either by `id` or by a `where` query, and
 * return the updated document (or `null` when `returning` is `false`).
 *
 * The stored JSON `doc` is read, shallow-merged with `data`, and written back:
 * keys in `data` overwrite, keys absent from it survive. That mirrors the `$set`
 * semantics `db-mongodb` uses — and since Payload hands this method the complete
 * post-change document, a merge and a full replace coincide in normal use; the
 * merge is just the safer of the two. The row's own `id` is always preserved,
 * so `data` can't reassign it.
 *
 * When nothing matches, there's no row to update and `null` is returned rather
 * than throwing. Declared as a regular function (not an arrow) so Payload binds
 * `this` to the live adapter, exposing the connection handle opened in `init`.
 */
export const updateOne: UpdateOne = async function updateOne(
  this: SQLiteDocumentsAdapter,
  { id, collection, data, returning, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  // Payload's args are exclusively one or the other: target by id when given,
  // otherwise by the where query. Reusing whereToSqlClause keeps id lookups on
  // the indexed column and matches how create stores ids (as text).
  const { clause, params } =
    id === undefined
      ? whereToSqlClause(where)
      : whereToSqlClause({ id: { equals: String(id) } });

  const row = this.connection
    .prepare(`SELECT id, doc FROM ${table} WHERE ${clause} LIMIT 1`)
    .get(...params);

  // Nothing matched, or a row we can't read back as our own JSON — no update.
  if (!row || typeof row.id !== "string" || typeof row.doc !== "string") {
    return null;
  }

  const doc = { ...JSON.parse(row.doc), ...data, id: row.id };

  this.connection
    .prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`)
    .run(JSON.stringify(doc), row.id);

  return returning === false ? null : doc;
};
