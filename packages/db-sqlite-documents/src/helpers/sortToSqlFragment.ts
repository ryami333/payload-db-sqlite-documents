import type { Sort } from "payload";

import { fieldToColumnSqlFragment } from "./fieldToColumnSqlFragment.js";
import type { SqlFragment, SqliteParam } from "./sqlite.types.js";

/**
 * Translate a Payload {@link Sort} into a parameterised SQLite `ORDER BY` body.
 *
 * A sort is a field name or a list of them; a leading `-` means descending
 * (`"-createdAt"`). Fields are resolved through {@link fieldToColumnSqlFragment}, so `id`
 * orders on the indexed column and everything else on `json_extract(doc, …)`.
 *
 * A stable `id` tiebreaker is always appended (unless the caller already sorts
 * by `id`) so that rows which tie on the requested field still come back in a
 * deterministic order — essential for correct pagination, where an unstable
 * order can drop or duplicate rows across pages. With no sort at all, the result
 * is simply `"id" ASC`.
 */
export const sortToSqlFragment = (sort: Sort | undefined): SqlFragment => {
  const fields = sort === undefined ? [] : Array.isArray(sort) ? sort : [sort];

  const parts: string[] = [];
  const params: SqliteParam[] = [];
  let sortsById = false;

  for (const field of fields) {
    if (!field) continue;

    const descending = field.startsWith("-");
    const path = descending ? field.slice(1) : field;
    if (!path) continue;
    if (path === "id") sortsById = true;

    const columnFragment = fieldToColumnSqlFragment(path);
    parts.push(`${columnFragment.sql} ${descending ? "DESC" : "ASC"}`);
    params.push(...columnFragment.params);
  }

  if (!sortsById) parts.push(`${fieldToColumnSqlFragment("id").sql} ASC`);

  return { sql: parts.join(", "), params };
};
