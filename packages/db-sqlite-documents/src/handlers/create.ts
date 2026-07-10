import { randomUUID } from "node:crypto";

import type { Create } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Insert a single document into its collection's table.
 *
 * The whole record is serialised to JSON in the `doc` column, keyed by a text
 * `id`. The id is taken from `customID` (or an `id` already present on `data`)
 * when supplied, otherwise a UUID is generated to match the text
 * `defaultIDType` this adapter advertises.
 *
 * Declared as a regular function (not an arrow) so Payload's `payload.db.create`
 * call binds `this` to the live adapter, giving access to the connection handle
 * opened in `init`.
 */
export const create: Create = async function create(
  this: SQLiteDocumentsAdapter,
  { collection, customID, data, returning },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const dataId =
    typeof data.id === "number" || typeof data.id === "string"
      ? data.id
      : undefined;

  const id = customID ?? dataId ?? randomUUID();
  const doc = { ...data, id };

  this.connection
    .prepare(`INSERT INTO ${table} (id, doc) VALUES (?, ?)`)
    .run(String(id), JSON.stringify(doc));

  return returning === false ? null : doc;
};
