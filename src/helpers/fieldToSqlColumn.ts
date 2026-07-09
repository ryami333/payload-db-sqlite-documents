import { quoteSqliteIdentifier } from "./quoteSqliteIdentifier.js";

/**
 * Map a Payload field path to the SQL expression that reads it, plus any
 * parameters that expression binds.
 *
 * `id` is a real, indexed primary-key column, so it's referenced directly (as a
 * quoted identifier). Every other field lives inside the JSON `doc` blob and is
 * pulled out with `json_extract(doc, '$.path')` — where the extraction path is
 * returned as a *bound parameter* rather than interpolated, so a field name can
 * never break out of the surrounding SQL. Dotted paths (`author.name`) pass
 * straight through as a nested JSON path.
 *
 * Shared by the `where` ({@link whereToSqlClause}) and `sort`
 * ({@link sortToSqlClause}) translations so both agree on how a field name
 * becomes SQL.
 */
export const fieldToSqlColumn = (
  fieldPath: string,
): { column: string; params: string[] } =>
  fieldPath === "id"
    ? { column: quoteSqliteIdentifier("id"), params: [] }
    : { column: "json_extract(doc, ?)", params: [`$.${fieldPath}`] };
