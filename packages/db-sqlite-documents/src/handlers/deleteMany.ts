import type { DeleteMany } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Delete every document matching `where`. Returns nothing (Payload's
 * {@link DeleteMany} contract is `Promise<void>`).
 *
 * A single `DELETE ... WHERE` over the clause {@link whereToSqlFragment} compiles;
 * no read-back is needed since nothing is returned. Ensuring the table exists
 * first keeps a delete against a never-written-to collection from throwing — it
 * simply removes nothing.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const deleteMany: DeleteMany = async function deleteMany(
  this: SQLiteDocumentsAdapter,
  { collection, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const whereFragment = whereToSqlFragment(where);

  this.connection
    .prepare(`DELETE FROM ${table} WHERE ${whereFragment.sql}`)
    .run(...whereFragment.params);
};
