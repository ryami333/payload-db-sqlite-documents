import { randomUUID } from "node:crypto";

import type { CreateGlobal, CreateGlobalArgs } from "payload";

import { ensureGlobalsTable } from "../helpers/ensureGlobalsTable.js";
import { globalTimestampsEnabled } from "../helpers/globalTimestampsEnabled.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Insert a global's document into the shared `payload_globals` table, keyed by
 * `slug`, and return it (or `null` when `returning` is `false`).
 *
 * Mirrors {@link import("./create.js").create}: the whole record is serialised
 * to JSON in `doc`, taking an `id` from the data when present and otherwise
 * generating one to match the text `defaultIDType` this adapter advertises.
 * Payload calls this only for a not-yet-created global, so a plain `INSERT` is
 * used — a duplicate slug throws, as it should;
 * {@link import("./updateGlobal.js").updateGlobal} is the upserting path.
 *
 * Written as a generic function so the constructed document can be returned as
 * `T` (the caller's global shape); no runtime narrowing can produce an arbitrary
 * `T`. Declared as a regular function (not an arrow) so Payload binds `this` to
 * the live adapter, exposing the connection handle opened in `init`.
 */
export const createGlobal: CreateGlobal = async function createGlobal<
  T extends Record<string, unknown>,
>(
  this: SQLiteDocumentsAdapter,
  { slug, data, returning }: CreateGlobalArgs<T>,
): Promise<T> {
  const table = ensureGlobalsTable({ connection: this.connection });

  const dataId =
    typeof data.id === "number" || typeof data.id === "string"
      ? data.id
      : undefined;
  const id = dataId ?? randomUUID();
  const doc: Record<string, unknown> = { ...data, id };

  // Payload adds `createdAt`/`updatedAt` to globals but leaves them for the
  // adapter to fill (see globalTimestampsEnabled). Stamp both on insert, without
  // clobbering values a caller supplied explicitly.
  if (globalTimestampsEnabled({ payload: this.payload, slug })) {
    const now = new Date().toISOString();
    if (doc.createdAt == null) doc.createdAt = now;
    if (doc.updatedAt == null) doc.updatedAt = now;
  }

  // Store id in its own column (as text, like collections) so a `where` on id
  // resolves; slug remains the key.
  this.connection
    .prepare(`INSERT INTO ${table} (slug, id, doc) VALUES (?, ?, ?)`)
    .run(slug, String(id), JSON.stringify(doc));

  return (returning === false ? null : doc) as T;
};
