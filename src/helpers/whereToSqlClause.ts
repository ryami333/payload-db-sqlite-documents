import type { Where, WhereField } from "payload";

import { fieldToSqlColumn } from "./fieldToSqlColumn.js";
import type { SqlFragment, SqliteParam } from "./sqlite.types.js";

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
 * Supported operators (see {@link operatorToSql}): `equals`, `not_equals`,
 * `greater_than[_equal]`, `less_than[_equal]`, `in`, `not_in`, `all`, `exists`,
 * `contains`, `like`, `not_like`, plus `and`/`or` composition. The geospatial
 * operators (`within`, `intersects`, `near`) throw — they need geometry support
 * this JSON/SQLite storage doesn't have. Semantics track `db-mongodb` where they
 * differ from plain SQL (notably `not_equals`, which also matches absent
 * fields).
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
    const fragment = operatorToSql({
      column,
      columnParams,
      fieldPath,
      operator,
      rawValue,
    });
    parts.push(fragment.sql);
    params.push(...fragment.params);
  }

  if (parts.length === 0) return { clause: "1", params: [] };
  return { clause: parts.join(" AND "), params };
};

/**
 * Translate one `{ operator: value }` pair against a resolved column expression
 * into a self-contained {@link SqlFragment} — params included, in the order the
 * fragment's `?`s appear, so callers never have to reason about placeholder
 * counts. Each fragment prepends `columnParams` (the `json_extract` path) via
 * {@link withColumn}, except the degenerate empty-`in`/`not_in` cases which
 * don't reference the column at all.
 */
const operatorToSql = ({
  column,
  columnParams,
  fieldPath,
  operator,
  rawValue,
}: {
  column: string;
  columnParams: string[];
  fieldPath: string;
  operator: string;
  rawValue: unknown;
}): SqlFragment => {
  const withColumn = (
    sql: string,
    params: SqliteParam[] = [],
  ): SqlFragment => ({
    sql,
    params: [...columnParams, ...params],
  });

  switch (operator) {
    case "equals":
      // `= ?` deliberately does *not* match NULL; an explicit null asks for the
      // absent/null rows, which needs `IS NULL`.
      return rawValue === null
        ? withColumn(`${column} IS NULL`)
        : withColumn(`${column} = ?`, [toSqliteParam(rawValue)]);

    // NULL-safe inequality: a row whose field is missing (json_extract → NULL)
    // counts as "not equal", matching db-mongodb's `$ne`. `IS NOT ?` covers both
    // the null and non-null value cases.
    case "not_equals":
      return withColumn(`${column} IS NOT ?`, [toSqliteParam(rawValue)]);

    case "greater_than":
      return withColumn(`${column} > ?`, [toSqliteParam(rawValue)]);
    case "greater_than_equal":
      return withColumn(`${column} >= ?`, [toSqliteParam(rawValue)]);
    case "less_than":
      return withColumn(`${column} < ?`, [toSqliteParam(rawValue)]);
    case "less_than_equal":
      return withColumn(`${column} <= ?`, [toSqliteParam(rawValue)]);

    case "in":
      return inSql({ column, negated: false, rawValue, withColumn });
    case "not_in":
      return inSql({ column, negated: true, rawValue, withColumn });

    // Array-contains-all: the JSON array at the field holds every given value.
    // Expands the array with json_each per required value; unrelated to the
    // scalar `column`, so it builds its own path params (no withColumn).
    case "all":
      return allSql({ fieldPath, rawValue });

    // json_extract yields NULL for a missing key, so presence is just a null
    // check. (A key explicitly set to JSON null reads as absent here too.)
    case "exists":
      return withColumn(`${column} IS ${rawValue ? "NOT NULL" : "NULL"}`);

    // Case-insensitive substring match (SQLite LIKE is ASCII-case-insensitive).
    // `contains` and `like` behave identically here; a value containing `%`/`_`
    // acts as a wildcard — a known simplification for now.
    case "contains":
    case "like":
      return withColumn(`${column} LIKE ?`, [`%${textValue(rawValue)}%`]);
    case "not_like":
      return withColumn(`${column} NOT LIKE ?`, [`%${textValue(rawValue)}%`]);

    // Geospatial operators need geometry support SQLite/JSON storage doesn't
    // have — not a "yet", they're out of scope for this adapter.
    case "within":
    case "intersects":
    case "near":
      throw new Error(
        `payload-db-sqlite-documents: geospatial query operator "${operator}" is not supported`,
      );

    default:
      throw new Error(
        `payload-db-sqlite-documents: query operator "${operator}" is not supported yet`,
      );
  }
};

/**
 * Build an `IN` / `NOT IN` fragment. Accepts an array or a comma-separated
 * string (the shape query strings arrive in). An empty set short-circuits to a
 * constant: `in` matches nothing (`0`), `not_in` matches everything (`1`) — and
 * since neither references the column, they skip `withColumn`.
 */
const inSql = ({
  column,
  negated,
  rawValue,
  withColumn,
}: {
  column: string;
  negated: boolean;
  rawValue: unknown;
  withColumn: (sql: string, params?: SqliteParam[]) => SqlFragment;
}): SqlFragment => {
  const values = toValueList(rawValue);

  if (values.length === 0) return { sql: negated ? "1" : "0", params: [] };

  const placeholders = values.map(() => "?").join(", ");
  return withColumn(
    `${column} ${negated ? "NOT IN" : "IN"} (${placeholders})`,
    values,
  );
};

/**
 * Build an `all` fragment: the JSON array at `fieldPath` contains every listed
 * value. Each required value gets a correlated `EXISTS` over `json_each` of the
 * array, all ANDed. Builds its own `$.path` params (no `withColumn`), since it
 * reads the array with `json_each(doc, …)` rather than the scalar column. An
 * empty list is vacuously true ("contains all of nothing").
 */
const allSql = ({
  fieldPath,
  rawValue,
}: {
  fieldPath: string;
  rawValue: unknown;
}): SqlFragment => {
  const values = toValueList(rawValue);
  if (values.length === 0) return { sql: "1", params: [] };

  const path = `$.${fieldPath}`;
  const checks = values.map(
    () => `EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)`,
  );
  const params = values.flatMap((value) => [path, value]);

  return {
    sql: checks.length === 1 ? checks[0] : `(${checks.join(" AND ")})`,
    params,
  };
};

/**
 * Normalise a list-valued operand (`in`/`not_in`/`all`) to bindable params:
 * an array as-is, or a comma-separated string (the shape query strings arrive
 * in) split into parts.
 */
const toValueList = (rawValue: unknown): SqliteParam[] =>
  (Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(",")
      : [rawValue]
  ).map(toSqliteParam);

/**
 * Coerce a query value into something `node:sqlite` can bind. Booleans become
 * `1`/`0` to match how JSON booleans surface through `json_extract`; `null`
 * passes through (for NULL-safe operators like `not_equals`); anything else
 * that isn't a bindable primitive throws rather than being silently mishandled.
 */
const toSqliteParam = (value: unknown): SqliteParam => {
  if (value === null) return null;
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

/**
 * Coerce a value used in a text match (`contains`/`like`/`not_like`) to a
 * string; numbers stringify, everything non-primitive throws.
 */
const textValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  throw new Error(
    `payload-db-sqlite-documents: unsupported value for a text match: ${JSON.stringify(value)}`,
  );
};
