import type { Where, WhereField } from "payload";

import { fieldToColumnSqlFragment } from "./fieldToColumnSqlFragment.js";
import type { SqlFragment, SqliteParam } from "./sqlite.types.js";

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
 * differ from plain SQL: `equals`/`not_equals` are array-aware (a value matches a
 * scalar field or an element of an array field), and `not_equals` also matches
 * rows missing the field.
 */
export const whereToSqlFragment = (where: Where | undefined): SqlFragment => {
  if (!where) return { sql: "1", params: [] };

  const parts: string[] = [];
  const params: SqliteParam[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if ((key === "and" || key === "or") && Array.isArray(value)) {
      const nested = value.map(whereToSqlFragment);
      // An empty and/or constrains nothing; fold it to the always-true clause
      // so we never emit a syntactically invalid empty `()`.
      const joined =
        nested.length === 0
          ? "1"
          : nested.map((n) => n.sql).join(key === "and" ? " AND " : " OR ");
      parts.push(`(${joined})`);
      for (const n of nested) params.push(...n.params);
      continue;
    }

    // A non-array value at this point is a field constraint (`{ equals: … }`).
    // Guard rather than cast so a stray array can't masquerade as one.
    if (Array.isArray(value)) continue;

    const field = fieldConstraintToSql(key, value);
    parts.push(field.sql);
    params.push(...field.params);
  }

  if (parts.length === 0) return { sql: "1", params: [] };
  return { sql: parts.join(" AND "), params };
};

/**
 * Translate a single field's {@link WhereField} (e.g. `{ equals: "x" }`) into a
 * SQL fragment. Multiple operators on one field are ANDed together.
 */
const fieldConstraintToSql = (
  fieldPath: string,
  constraint: WhereField,
): SqlFragment => {
  const columnFragment = fieldToColumnSqlFragment(fieldPath);

  const parts: string[] = [];
  const params: SqliteParam[] = [];

  for (const [operator, rawValue] of Object.entries(constraint)) {
    if (rawValue === undefined) continue;
    const fragment = operatorToSql({
      columnFragment,
      fieldPath,
      operator,
      rawValue,
    });
    parts.push(fragment.sql);
    params.push(...fragment.params);
  }

  if (parts.length === 0) return { sql: "1", params: [] };
  return { sql: parts.join(" AND "), params };
};

/**
 * Translate one `{ operator: value }` pair against a resolved column expression
 * into a self-contained {@link SqlFragment} — params included, in the order the
 * fragment's `?`s appear, so callers never have to reason about placeholder
 * counts. Each fragment prepends `columnFragment.params` (the `json_extract`
 * path) via {@link withColumn}, except the degenerate empty-`in`/`not_in` cases
 * which don't reference the column at all.
 */
const operatorToSql = ({
  columnFragment,
  fieldPath,
  operator,
  rawValue,
}: {
  columnFragment: SqlFragment;
  fieldPath: string;
  operator: string;
  rawValue: unknown;
}): SqlFragment => {
  const withColumn = (
    sql: string,
    params: SqliteParam[] = [],
  ): SqlFragment => ({
    sql,
    params: [...columnFragment.params, ...params],
  });

  switch (operator) {
    // Both equality operators are array-aware (see equalitySql): the value is
    // matched against a scalar field *or* the elements of an array field.
    case "equals":
      return equalitySql({
        columnFragment,
        fieldPath,
        negated: false,
        rawValue,
        withColumn,
      });
    case "not_equals":
      return equalitySql({
        columnFragment,
        fieldPath,
        negated: true,
        rawValue,
        withColumn,
      });

    case "greater_than":
      return withColumn(`${columnFragment.sql} > ?`, [toSqliteParam(rawValue)]);
    case "greater_than_equal":
      return withColumn(`${columnFragment.sql} >= ?`, [
        toSqliteParam(rawValue),
      ]);
    case "less_than":
      return withColumn(`${columnFragment.sql} < ?`, [toSqliteParam(rawValue)]);
    case "less_than_equal":
      return withColumn(`${columnFragment.sql} <= ?`, [
        toSqliteParam(rawValue),
      ]);

    case "in":
      return inSql({ columnFragment, negated: false, rawValue, withColumn });
    case "not_in":
      return inSql({ columnFragment, negated: true, rawValue, withColumn });

    // Array-contains-all: the JSON array at the field holds every given value.
    // Expands the array with json_each per required value; unrelated to the
    // scalar column, so it builds its own path params (no withColumn).
    case "all":
      return allSql({ fieldPath, rawValue });

    // json_extract yields NULL for a missing key, so presence is just a null
    // check. (A key explicitly set to JSON null reads as absent here too.)
    case "exists":
      return withColumn(
        `${columnFragment.sql} IS ${rawValue ? "NOT NULL" : "NULL"}`,
      );

    // Case-insensitive substring match of the whole value (SQLite LIKE is
    // ASCII-case-insensitive); a value containing `%`/`_` acts as a wildcard — a
    // known simplification. Unlike `like`, `contains` does not split on words.
    case "contains":
      return withColumn(`${columnFragment.sql} LIKE ?`, [
        `%${textValue(rawValue)}%`,
      ]);

    // `like` requires every whitespace-separated word (order-independent);
    // `not_like` is its De Morgan negation. See likeSql.
    case "like":
      return likeSql({ columnFragment, negated: false, rawValue });
    case "not_like":
      return likeSql({ columnFragment, negated: true, rawValue });

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
 * Build an `equals` / `not_equals` fragment, array-aware to match db-mongodb.
 *
 * An explicit `null` targets absent/null rows directly (`IS NULL` /
 * `IS NOT NULL`). `id` is a scalar indexed column, never an array, so it
 * compares directly and stays on the index. For any other field the value is
 * checked with `EXISTS (json_each(doc, path) WHERE value = ?)`: `json_each`
 * yields one row for a scalar and one per element for an array, so the single
 * `EXISTS` covers both a scalar match and array membership. Negated, `NOT EXISTS`
 * also (correctly) includes rows missing the field — Mongo's `$ne` semantics.
 */
const equalitySql = ({
  columnFragment,
  fieldPath,
  negated,
  rawValue,
  withColumn,
}: {
  columnFragment: SqlFragment;
  fieldPath: string;
  negated: boolean;
  rawValue: unknown;
  withColumn: (sql: string, params?: SqliteParam[]) => SqlFragment;
}): SqlFragment => {
  if (rawValue === null) {
    return withColumn(
      `${columnFragment.sql} IS ${negated ? "NOT NULL" : "NULL"}`,
    );
  }

  const value = toSqliteParam(rawValue);

  if (fieldPath === "id") {
    return withColumn(`${columnFragment.sql} ${negated ? "IS NOT" : "="} ?`, [
      value,
    ]);
  }

  const exists = `EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)`;
  return {
    sql: negated ? `NOT ${exists}` : exists,
    params: [`$.${fieldPath}`, value],
  };
};

/**
 * Build an `IN` / `NOT IN` fragment. Accepts an array or a comma-separated
 * string (the shape query strings arrive in). An empty set short-circuits to a
 * constant: `in` matches nothing (`0`), `not_in` matches everything (`1`) — and
 * since neither references the column, they skip `withColumn`.
 */
const inSql = ({
  columnFragment,
  negated,
  rawValue,
  withColumn,
}: {
  columnFragment: SqlFragment;
  negated: boolean;
  rawValue: unknown;
  withColumn: (sql: string, params?: SqliteParam[]) => SqlFragment;
}): SqlFragment => {
  const values = toValueList(rawValue);

  if (values.length === 0) return { sql: negated ? "1" : "0", params: [] };

  const placeholders = values.map(() => "?").join(", ");
  return withColumn(
    `${columnFragment.sql} ${negated ? "NOT IN" : "IN"} (${placeholders})`,
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
 * Build a `like` / `not_like` fragment. Payload's `like` splits the value on
 * whitespace and requires *every* word to appear (each a case-insensitive
 * substring), ANDed; `not_like` is the De Morgan negation (`OR` of `NOT LIKE`).
 * The column repeats once per word, so this builds its own params (no
 * `withColumn`). A value with no words falls back to matching it whole, keeping
 * behaviour defined.
 *
 * `not_like` also matches rows missing the field: a `NOT LIKE` on a NULL column
 * is NULL (excluded), so an `OR <col> IS NULL` disjunct is appended — mirroring
 * db-mongodb's `$not: { $regex }`, where an absent field can't contain the value.
 */
const likeSql = ({
  columnFragment,
  negated,
  rawValue,
}: {
  columnFragment: SqlFragment;
  negated: boolean;
  rawValue: unknown;
}): SqlFragment => {
  const text = textValue(rawValue);
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const patterns = (words.length > 0 ? words : [text]).map(
    (word) => `%${word}%`,
  );

  const comparison = negated ? "NOT LIKE" : "LIKE";
  const joiner = negated ? " OR " : " AND ";

  const wordChecks = patterns.map(
    () => `${columnFragment.sql} ${comparison} ?`,
  );
  const wordParams = patterns.flatMap((pattern) => [
    ...columnFragment.params,
    pattern,
  ]);

  // Include absent-field rows in `not_like` (they trivially don't contain it).
  const nullChecks = negated ? [`${columnFragment.sql} IS NULL`] : [];
  const nullParams = negated ? columnFragment.params : [];

  const checks = [...wordChecks, ...nullChecks];
  const params = [...wordParams, ...nullParams];

  return {
    sql: checks.length === 1 ? checks[0] : `(${checks.join(joiner)})`,
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
  // Payload passes `Date` operands for timestamp queries (e.g. document-lock
  // checks). Dates are stored in `doc` JSON as ISO strings (JSON.stringify's
  // Date serialisation), so match against the same ISO representation.
  if (value instanceof Date) return value.toISOString();
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
