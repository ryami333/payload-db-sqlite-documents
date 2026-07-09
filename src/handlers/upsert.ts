import type { Upsert } from "payload";

import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update the document matching `where` if one exists, otherwise create a new
 * one — returning the resulting document (or `null` when `returning` is
 * `false`).
 *
 * Composed from the adapter's own methods rather than hand-rolled SQL: a
 * {@link import("./findOne.js").findOne} decides which branch to take, then
 * {@link import("./updateOne.js").updateOne} (by the located id) or
 * {@link import("./create.js").create} does the work. Branching on `findOne` is
 * deliberate — `updateOne` returns `null` both on a miss *and* under
 * `returning: false`, so its return can't tell "nothing matched" from "updated,
 * don't return it".
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter; the delegated methods are invoked as `this.*` for the same
 * reason.
 */
export const upsert: Upsert = async function upsert(
  this: SQLiteDocumentsAdapter,
  { collection, data, returning, where },
) {
  const existing = await this.findOne({ collection, where });

  return existing
    ? this.updateOne({ collection, data, id: existing.id, returning })
    : this.create({ collection, data, returning });
};
