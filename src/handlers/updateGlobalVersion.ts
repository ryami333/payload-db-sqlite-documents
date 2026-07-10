import type { UpdateGlobalVersion } from "payload";

import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Update a single global version record — located by `id` or `where` — and
 * return it (or `null` when `returning` is `false`, or when nothing matched).
 *
 * The global counterpart of {@link import("./updateVersion.js").updateVersion},
 * scoped to `global_slug`: `versionData`'s defined fields are shallow-merged over
 * the existing record (so a stray `undefined` can't clobber), and the record's
 * `id` is preserved. This is the path Payload uses to toggle `latest`.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const updateGlobalVersion: UpdateGlobalVersion =
  async function updateGlobalVersion(
    this: SQLiteDocumentsAdapter,
    { id, global, returning, versionData, where },
  ) {
    const table = ensureVersionsTable({ connection: this.connection });

    const { sql, params } =
      id === undefined
        ? whereToSqlFragment(where)
        : whereToSqlFragment({ id: { equals: String(id) } });

    const row = this.connection
      .prepare(
        `SELECT doc FROM ${table} WHERE global_slug = ? AND ${sql} LIMIT 1`,
      )
      .get(global, ...params);

    const existing =
      row && typeof row.doc === "string" ? JSON.parse(row.doc) : null;

    // Only the defined keys of versionData should override; a stray `undefined`
    // must not wipe an existing field.
    const patch = Object.fromEntries(
      Object.entries(versionData).filter(([, value]) => value !== undefined),
    );
    const doc = existing ? { ...existing, ...patch, id: existing.id } : null;

    if (doc) {
      this.connection
        .prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`)
        .run(JSON.stringify(doc), doc.id);
    }

    return returning === false ? null : doc;
  };
