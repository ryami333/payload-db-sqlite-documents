import type { FindGlobal } from "payload";

import { ensureGlobalsTable } from "../helpers/ensureGlobalsTable.js";
import { whereToSqlClause } from "../helpers/whereToSqlClause.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Fetch a global's document by `slug`, or `null` if it hasn't been created.
 *
 * A `where` (rare for a singleton, but Payload allows it) is ANDed onto the slug
 * lookup via {@link whereToSqlClause}, matching against the JSON `doc` the same
 * way collection reads do — so it acts as a "return the global only if it also
 * matches" filter. Ensuring the table exists first keeps a lookup before any
 * global has been written from throwing.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const findGlobal: FindGlobal = async function findGlobal(
  this: SQLiteDocumentsAdapter,
  { slug, where },
) {
  const table = ensureGlobalsTable({ connection: this.connection });

  const { clause, params } = whereToSqlClause(where);

  const row = this.connection
    .prepare(`SELECT doc FROM ${table} WHERE slug = ? AND ${clause} LIMIT 1`)
    .get(slug, ...params);

  // `doc` is typed as SQLite's loose output union; narrow to the string we
  // wrote rather than trusting it. JSON.parse returns `any`, which satisfies the
  // method's generic return.
  return row && typeof row.doc === "string" ? JSON.parse(row.doc) : null;
};
