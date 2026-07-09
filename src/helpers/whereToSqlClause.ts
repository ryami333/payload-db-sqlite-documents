import type { Where, WhereField } from "payload";

import { fieldToSqlColumn } from "./fieldToSqlColumn.js";

/**
 * Values we know how to bind as SQLite statement parameters. Booleans are
 * normalised to `1`/`0` before they get here (see {@link toSqliteParam}), so
 * they're deliberately absent — `node:sqlite` rejects a bare boolean.
 */
type SqliteParam = bigint | number | string | null;

/** A parameterised SQL fragment: text plus the values its `?`s bind to. */
interface SqlFragment {
  sql: string;
  params: SqliteParam[];
}

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
 * `greater_than[_equal]`, `less_than[_equal]`, `in`, `not_in`, `exists`,
 * `contains`, `like`, `not_like`, plus `and`/`or` composition. The array/geo
 * operators (`all`, `within`, `intersects`, `near`) throw rather than silently
 * returning wrong rows. Semantics track `db-mongodb` where they differ from
 * plain SQL (notably `not_equals`, which also matches absent fields).
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
  operator,
  rawValue,
}: {
  column: string;
  columnParams: string[];
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
  const values = (
    Array.isArray(rawValue)
      ? rawValue
      : typeof rawValue === "string"
        ? rawValue.split(",")
        : [rawValue]
  ).map(toSqliteParam);

  if (values.length === 0) return { sql: negated ? "1" : "0", params: [] };

  const placeholders = values.map(() => "?").join(", ");
  return withColumn(
    `${column} ${negated ? "NOT IN" : "IN"} (${placeholders})`,
    values,
  );
};

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
