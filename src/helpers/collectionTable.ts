import type { DatabaseSync } from "node:sqlite";

/**
 * Quote a SQLite identifier (e.g. a table name) so a collection slug that
 * happens to be a reserved word or contains unusual characters is handled
 * safely. Embedded double-quotes are doubled, per the SQL standard.
 */
export const quoteIdentifier = (name: string): string =>
  `"${name.replace(/"/g, '""')}"`;

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
  const table = quoteIdentifier(slug);
  connection.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`,
  );
  return table;
};
