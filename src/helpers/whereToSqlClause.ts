import type { Where, WhereField } from "payload";

import { fieldToSqlColumn } from "./fieldToSqlColumn.js";

/**
 * Values we know how to bind as SQLite statement parameters. Booleans are
 * normalised to `1`/`0` before they get here (see {@link toSqliteParam}), so
 * they're deliberately absent — `node:sqlite` rejects a bare boolean.
 */
type SqliteParam = bigint | number | string | null;

/**
 * A parameterised SQL fragment: a boolean `clause` suitable for dropping in
 * after `WHERE`, plus the ordered `params` its `?` placeholders bind to. An
 * empty/absent query yields the always-true clause `"1"`.
 */
export interface WhereSql {
  clause: string;
  params: SqliteParam[];
}

/**
 * Translate a Payload {@link Where} into a parameterised SQLite `WHERE` clause.
 *
 * Storage is a single JSON `doc` column per row, so non-`id` fields are matched
 * with `json_extract(doc, '$.path')`. The extraction path is itself bound as a
 * parameter (never string-interpolated), so an attacker-controlled field name
 * can't break out of the query; `id` maps straight to the indexed primary-key
 * column instead of a JSON lookup.
 *
 * This is a deliberately narrow first cut: only the `equals` operator is
 * understood (plus `and`/`or` composition). Every other operator throws rather
 * than silently returning wrong rows — the surface will grow from here. See the
 * full operator set in Payload's `validOperators`.
 */
export const whereToSqlClause = (where: Where | undefined): WhereSql => {
  if (!where) return { clause: "1", params: [] };

  const parts: string[] = [];
  const params: SqliteParam[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if ((key === "and" || key === "or") && Array.isArray(value)) {
      const nested = value.map(whereToSqlClause);
      // An empty and/or constrains nothing; fold it to the always-true clause
      // so we never emit a syntactically invalid empty `()`.
      const joined =
        nested.length === 0
          ? "1"
          : nested.map((n) => n.clause).join(key === "and" ? " AND " : " OR ");
      parts.push(`(${joined})`);
      for (const n of nested) params.push(...n.params);
      continue;
    }

    // A non-array value at this point is a field constraint (`{ equals: … }`).
    // Guard rather than cast so a stray array can't masquerade as one.
    if (Array.isArray(value)) continue;

    const field = fieldConstraintToSql(key, value);
    parts.push(field.clause);
    params.push(...field.params);
  }

  if (parts.length === 0) return { clause: "1", params: [] };
  return { clause: parts.join(" AND "), params };
};

/**
 * Translate a single field's {@link WhereField} (e.g. `{ equals: "x" }`) into a
 * SQL fragment. Multiple operators on one field are ANDed together.
 */
const fieldConstraintToSql = (
  fieldPath: string,
  constraint: WhereField,
): WhereSql => {
  const { column, params: columnParams } = fieldToSqlColumn(fieldPath);

  const parts: string[] = [];
  const params: SqliteParam[] = [];

  for (const [operator, rawValue] of Object.entries(constraint)) {
    if (rawValue === undefined) continue;
    if (operator !== "equals") {
      throw new Error(
        `payload-db-sqlite-documents: query operator "${operator}" is not supported yet`,
      );
    }

    if (rawValue === null) {
      parts.push(`${column} IS NULL`);
      params.push(...columnParams);
      continue;
    }

    parts.push(`${column} = ?`);
    params.push(...columnParams, toSqliteParam(rawValue));
  }

  if (parts.length === 0) return { clause: "1", params: [] };
  return { clause: parts.join(" AND "), params };
};

/**
 * Coerce a query value into something `node:sqlite` can bind. Booleans become
 * `1`/`0` to match how JSON booleans surface through `json_extract`; anything
 * that isn't a primitive we can compare against throws rather than binding a
 * value SQLite would silently mishandle.
 */
const toSqliteParam = (value: unknown): SqliteParam => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  throw new Error(
    `payload-db-sqlite-documents: unsupported query value ${JSON.stringify(value)}`,
  );
};
