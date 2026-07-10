import type { CountVersions } from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Count the version records for a collection matching `where`.
 *
 * The versions counterpart of {@link import("./count.js").count}: the same
 * `COUNT(*)` over {@link whereToSqlFragment}, on the shared `payload_versions`
 * table scoped to this collection.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const countVersions: CountVersions = async function countVersions(
  this: SQLiteDocumentsAdapter,
  { collection, where },
) {
  const table = ensureVersionsTable({ connection: this.connection });

  const whereFragment = whereToSqlFragment(where);

  const row = this.connection
    .prepare(
      `SELECT COUNT(*) AS total FROM ${table} WHERE collection_slug = ? AND ${whereFragment.sql}`,
    )
    .get(collection, ...whereFragment.params);

  const totalDocs = typeof row?.total === "number" ? row.total : 0;

  return { totalDocs };
};
