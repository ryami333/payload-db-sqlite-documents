import type { UpdateMany } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { sortToSqlFragment } from "../helpers/sortToSqlFragment.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update every document matching `where`, returning the updated documents (or
 * `null` when `returning` is `false`).
 *
 * The bulk sibling of {@link import("./updateOne.js").updateOne}: each matched
 * row's stored JSON is shallow-merged with `data` (keys in `data` overwrite,
 * absent keys survive — the `$set` semantics `db-mongodb` uses) and written
 * back, with the row's own `id` preserved. `sort` orders the matches (so a
 * `limit` takes a well-defined slice) and defaults to a stable `id` order.
 *
 * No match yields an empty array, not `null` — `null` is reserved for the
 * `returning: false` case. Declared as a regular function (not an arrow) so
 * Payload binds `this` to the live adapter, exposing the connection handle.
 */
export const updateMany: UpdateMany = async function updateMany(
  this: SQLiteDocumentsAdapter,
  { collection, data, limit, returning, sort, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const whereFragment = whereToSqlFragment(where);
  const sortFragment = sortToSqlFragment(sort);

  // A positive limit caps how many matches are updated; 0/undefined means all.
  const limitClause =
    typeof limit === "number" && limit > 0
      ? { sql: " LIMIT ?", params: [limit] }
      : { sql: "", params: [] };

  const rows = this.connection
    .prepare(
      `SELECT id, doc FROM ${table} WHERE ${whereFragment.sql} ORDER BY ${sortFragment.sql}${limitClause.sql}`,
    )
    .all(
      ...whereFragment.params,
      ...sortFragment.params,
      ...limitClause.params,
    );

  const update = this.connection.prepare(
    `UPDATE ${table} SET doc = ? WHERE id = ?`,
  );

  const docs = rows.flatMap((row) => {
    // Skip anything we can't read back as our own JSON rather than trusting the
    // loose SQLite output type.
    if (typeof row.id !== "string" || typeof row.doc !== "string") return [];

    const doc = { ...JSON.parse(row.doc), ...data, id: row.id };
    update.run(JSON.stringify(doc), row.id);
    return [doc];
  });

  return returning === false ? null : docs;
};
