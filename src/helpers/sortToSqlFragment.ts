import type { Sort } from "payload";

import { fieldToSqlColumn } from "./fieldToSqlColumn.js";
import type { SqlFragment } from "./sqlite.types.js";

/**
 * Translate a Payload {@link Sort} into a parameterised SQLite `ORDER BY` body.
 *
 * A sort is a field name or a list of them; a leading `-` means descending
 * (`"-createdAt"`). Fields are resolved through {@link fieldToSqlColumn}, so `id`
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
  const params: string[] = [];
  let sortsById = false;

  for (const field of fields) {
    if (!field) continue;

    const descending = field.startsWith("-");
    const path = descending ? field.slice(1) : field;
    if (!path) continue;
    if (path === "id") sortsById = true;

    const { column, params: columnParams } = fieldToSqlColumn(path);
    parts.push(`${column} ${descending ? "DESC" : "ASC"}`);
    params.push(...columnParams);
  }

  if (!sortsById) parts.push(`${fieldToSqlColumn("id").column} ASC`);

  return { sql: parts.join(", "), params };
};
