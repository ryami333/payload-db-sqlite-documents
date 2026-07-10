import type { CountGlobalVersions } from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Count the version records for a global matching `where`.
 *
 * The global counterpart of {@link import("./countVersions.js").countVersions}:
 * the same `COUNT(*)` over {@link whereToSqlFragment}, scoped to `global_slug`.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const countGlobalVersions: CountGlobalVersions =
  async function countGlobalVersions(
    this: SQLiteDocumentsAdapter,
    { global, where },
  ) {
    const table = ensureVersionsTable({ connection: this.connection });

    const { sql, params } = whereToSqlFragment(where);

    const row = this.connection
      .prepare(
        `SELECT COUNT(*) AS total FROM ${table} WHERE global_slug = ? AND ${sql}`,
      )
      .get(global, ...params);

    const totalDocs = typeof row?.total === "number" ? row.total : 0;

    return { totalDocs };
  };
