/**
 * Values we know how to bind as SQLite statement parameters. Booleans are
 * normalised to `1`/`0` before they get here (see `toSqliteParam` in
 * {@link ./whereToSqlClause.ts}), so they're deliberately absent —
 * `node:sqlite` rejects a bare boolean.
 */
export type SqliteParam = bigint | number | string | null;

/** A parameterised SQL fragment: text plus the values its `?`s bind to. */
export interface SqlFragment {
  sql: string;
  params: SqliteParam[];
}
