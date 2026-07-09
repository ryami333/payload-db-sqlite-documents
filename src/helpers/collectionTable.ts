import type { DatabaseSync } from "node:sqlite";

import { quoteSqliteIdentifier } from "./quoteSqliteIdentifier.js";

/**
 * Lazily create the backing table for a collection and return its quoted name.
 *
 * Storage is schemaless / "documents" style, in the spirit of
 * `@payloadcms/db-mongodb`: each collection gets its own table with one row per
 * document — a text primary-key `id` plus the whole document serialised to JSON
 * in `doc`. Creating on demand keeps `init` cheap and means the file only ever
 * contains tables for collections that have actually been written to.
 */
export const ensureCollectionTable = (
  connection: DatabaseSync,
  slug: string,
): string => {
  const table = quoteSqliteIdentifier(slug);
  connection.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`,
  );
  return table;
};
