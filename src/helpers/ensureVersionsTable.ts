import type { DatabaseSync } from "node:sqlite";

import { quoteSqliteIdentifier } from "./quoteSqliteIdentifier.js";

/**
 * Lazily create the shared table that backs all versions and return its quoted
 * name.
 *
 * One table holds both collection and global versions, scoped by whichever of
 * `collection_slug` / `global_slug` is set; each version's `TypeWithVersion`
 * record is serialised whole into `doc`. That `doc`-column shape lets the `where`
 * helpers match version fields (`json_extract(doc, '$.parent')`,
 * `'$.version.title'`, …) unchanged, and the real `id` column keeps id-based
 * lookups on the index. The name is namespaced (`payload_versions`) to stay
 * clear of collection tables, which are named after their slug.
 *
 * Both scope columns exist from the start deliberately: the SQLite file is meant
 * to be source-controlled without migrations, so adding one later would be
 * awkward.
 */
export const ensureVersionsTable = ({
  connection,
}: {
  connection: DatabaseSync;
}): string => {
  const table = quoteSqliteIdentifier("payload_versions");
  connection.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, collection_slug TEXT, global_slug TEXT, doc TEXT NOT NULL)`,
  );
  return table;
};
