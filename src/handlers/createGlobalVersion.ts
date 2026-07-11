import { randomUUID } from "node:crypto";

import type {
  CreateGlobalVersion,
  CreateGlobalVersionArgs,
  JsonObject,
  TypeWithVersion,
} from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Insert a new version record for a global into the shared `payload_versions`
 * table, and return it (or `null` when `returning` is `false`).
 *
 * The global counterpart of {@link import("./createVersion.js").createVersion}:
 * same stored shape and the same latest-flag ownership, but scoped to
 * `global_slug` and with no `parent` (a global is a singleton, so every version
 * shares one lineage). The new version becomes `latest` and the flag is cleared
 * from the global's other versions.
 *
 * Written as a generic function so the constructed record returns as
 * `Omit<TypeWithVersion<T>, "parent">`. Declared as a regular function (not an
 * arrow) so Payload binds `this` to the live adapter, exposing the connection.
 */
export const createGlobalVersion: CreateGlobalVersion =
  async function createGlobalVersion<T extends JsonObject = JsonObject>(
    this: SQLiteDocumentsAdapter,
    {
      autosave,
      createdAt,
      globalSlug,
      publishedLocale,
      returning,
      snapshot,
      updatedAt,
      versionData,
    }: CreateGlobalVersionArgs<T>,
  ): Promise<Omit<TypeWithVersion<T>, "parent">> {
    const table = ensureVersionsTable({ connection: this.connection });

    const id = randomUUID();
    const doc: Record<string, unknown> = {
      id,
      autosave,
      createdAt,
      latest: true,
      updatedAt,
      version: versionData,
      ...(publishedLocale !== undefined ? { publishedLocale } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
    };

    this.connection
      .prepare(`INSERT INTO ${table} (id, global_slug, doc) VALUES (?, ?, ?)`)
      .run(id, globalSlug, JSON.stringify(doc));

    // This is now the latest version for the global — drop the flag from its
    // other versions so exactly one stays `latest`.
    this.connection
      .prepare(
        `UPDATE ${table} SET doc = json_remove(doc, '$.latest') WHERE global_slug = ? AND id != ?`,
      )
      .run(globalSlug, id);

    return (returning === false ? null : doc) as Omit<
      TypeWithVersion<T>,
      "parent"
    >;
  };
