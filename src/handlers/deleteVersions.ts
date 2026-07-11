import type { DeleteVersions } from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Delete version records matching `where`, scoped to a collection or a global.
 * Returns nothing (Payload's {@link DeleteVersions} contract is `Promise<void>`).
 *
 * This one method serves both collection and global versions — Payload passes
 * either `collection` or `globalSlug` — so it targets the corresponding scope
 * column in the shared `payload_versions` table and ANDs the
 * {@link whereToSqlFragment} filter on top.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const deleteVersions: DeleteVersions = async function deleteVersions(
  this: SQLiteDocumentsAdapter,
  { collection, globalSlug, where },
) {
  const table = ensureVersionsTable({ connection: this.connection });

  const whereFragment = whereToSqlFragment(where);
  const scopeColumn =
    collection !== undefined ? "collection_slug" : "global_slug";
  const scopeValue = collection ?? globalSlug ?? null;

  this.connection
    .prepare(
      `DELETE FROM ${table} WHERE ${scopeColumn} = ? AND ${whereFragment.sql}`,
    )
    .run(scopeValue, ...whereFragment.params);
};
