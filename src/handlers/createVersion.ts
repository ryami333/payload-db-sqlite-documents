import { randomUUID } from "node:crypto";

import type {
  CreateVersion,
  CreateVersionArgs,
  JsonObject,
  TypeWithVersion,
} from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Insert a new version record for a collection document into the shared
 * `payload_versions` table, and return it (or `null` when `returning` is
 * `false`).
 *
 * The stored record is the full `TypeWithVersion`: the snapshot under `version`,
 * plus `parent`/`createdAt`/`updatedAt`/`autosave` and any `publishedLocale` /
 * `snapshot`. A new version becomes the `latest` for its parent, so the flag is
 * set here and cleared from that parent's other versions — the adapter owns the
 * one-latest-per-parent invariant that `queryDrafts` and Payload's
 * `updateLatestVersion` rely on.
 *
 * Written as a generic function so the constructed record returns as
 * `TypeWithVersion<T>`. Declared as a regular function (not an arrow) so Payload
 * binds `this` to the live adapter, exposing the connection handle.
 */
export const createVersion: CreateVersion = async function createVersion<
  T extends JsonObject = JsonObject,
>(
  this: SQLiteDocumentsAdapter,
  {
    autosave,
    collectionSlug,
    createdAt,
    parent,
    publishedLocale,
    returning,
    snapshot,
    updatedAt,
    versionData,
  }: CreateVersionArgs<T>,
): Promise<TypeWithVersion<T>> {
  const table = ensureVersionsTable({ connection: this.connection });

  const id = randomUUID();
  const doc: Record<string, unknown> = {
    id,
    autosave,
    createdAt,
    latest: true,
    parent,
    updatedAt,
    version: versionData,
    ...(publishedLocale !== undefined ? { publishedLocale } : {}),
    ...(snapshot !== undefined ? { snapshot } : {}),
  };

  this.connection
    .prepare(`INSERT INTO ${table} (id, collection_slug, doc) VALUES (?, ?, ?)`)
    .run(id, collectionSlug, JSON.stringify(doc));

  // This is now the latest version for its parent — drop the flag from the
  // parent's other versions so exactly one stays `latest`.
  this.connection
    .prepare(
      `UPDATE ${table} SET doc = json_remove(doc, '$.latest') WHERE collection_slug = ? AND json_extract(doc, '$.parent') = ? AND id != ?`,
    )
    .run(collectionSlug, String(parent), id);

  return (returning === false ? null : doc) as TypeWithVersion<T>;
};
