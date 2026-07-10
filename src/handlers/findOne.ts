import type { FindOne } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Fetch the first document in a collection matching `where`, or `null`.
 *
 * The stored JSON `doc` is read back and parsed; the `where` is compiled to a
 * parameterised clause by {@link whereToSqlFragment}. Ensuring the table exists
 * first keeps a query against a never-written-to collection from throwing — it
 * simply finds nothing.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const findOne: FindOne = async function findOne(
  this: SQLiteDocumentsAdapter,
  { collection, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const { sql, params } = whereToSqlFragment(where);

  const row = this.connection
    .prepare(`SELECT doc FROM ${table} WHERE ${sql} LIMIT 1`)
    .get(...params);

  // `doc` is typed as SQLite's loose output union; narrow to the string we
  // wrote rather than trusting it, so a non-string can't reach JSON.parse.
  if (!row || typeof row.doc !== "string") return null;

  return JSON.parse(row.doc);
};
