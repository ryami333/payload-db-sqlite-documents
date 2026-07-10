import type { Count } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Count the documents in a collection matching `where`.
 *
 * Reuses {@link whereToSqlFragment} to compile the same parameterised clause the
 * reads use, then runs `COUNT(*)` over it. Ensuring the table exists first means
 * counting a never-written-to collection returns `0` rather than throwing. This
 * is also the count `find` leans on for its `totalDocs`/`totalPages` pagination
 * metadata.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const count: Count = async function count(
  this: SQLiteDocumentsAdapter,
  { collection, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const { sql, params } = whereToSqlFragment(where);

  const row = this.connection
    .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${sql}`)
    .get(...params);

  // COUNT(*) always yields exactly one row with an integer; narrow the loose
  // SQLite output union to a number rather than trusting its static type.
  const totalDocs = typeof row?.total === "number" ? row.total : 0;

  return { totalDocs };
};
