import type { DatabaseSync } from "node:sqlite";

import { quoteSqliteIdentifier } from "./quoteSqliteIdentifier.js";

/**
 * Lazily create the shared table that backs all globals and return its quoted
 * name.
 *
 * Globals are singletons, so — unlike collections, which get a table each (see
 * {@link ensureCollectionTable}) — they all live in one table keyed by `slug`,
 * each with its document serialised to JSON in `doc`. Reusing the same
 * `doc`-column shape means the `where` helpers (`json_extract(doc, …)`) work
 * against globals unchanged. The name is namespaced (`payload_globals`) to keep
 * it clear of collection tables, which are named directly after their slug.
 */
export const ensureGlobalsTable = ({
  connection,
}: {
  connection: DatabaseSync;
}): string => {
  const table = quoteSqliteIdentifier("payload_globals");
  connection.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (slug TEXT PRIMARY KEY, doc TEXT NOT NULL)`,
  );
  return table;
};
