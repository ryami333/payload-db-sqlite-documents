import type { FindDistinct } from "payload";

import { buildPaginationMeta } from "../helpers/buildPaginationMeta.js";
import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { fieldToSqlColumn } from "../helpers/fieldToSqlColumn.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * List the distinct values of one `field` across the documents matching
 * `where`, paginated — Payload's {@link import("payload").PaginatedDistinctDocs}
 * shape, where each entry in `values` is `{ [field]: value }` and `totalDocs`
 * counts distinct values (not rows).
 *
 * The field resolves through {@link fieldToSqlColumn} (so `id` hits the indexed
 * column and everything else `json_extract(doc, …)`) and the filter through
 * {@link whereToSqlFragment}. Null/missing values are excluded from both the list
 * and the count — matching Mongo's `distinct`, and keeping `COUNT(DISTINCT …)`
 * (which already drops NULLs) in step with the listed rows. Ordering is by the
 * distinct value itself; `sort` only picks the direction, since ordering a
 * `DISTINCT` projection by anything outside it is ill-defined. Pagination is
 * shared with `find` via {@link buildPaginationMeta} (there's no `pagination`
 * flag here, so it only ever pages).
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const findDistinct: FindDistinct = async function findDistinct(
  this: SQLiteDocumentsAdapter,
  { collection, field, limit, page, sort, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const { column, params: fieldParams } = fieldToSqlColumn(field);
  const { sql, params: whereParams } = whereToSqlFragment(where);

  const countRow = this.connection
    .prepare(
      `SELECT COUNT(DISTINCT ${column}) AS total FROM ${table} WHERE ${sql}`,
    )
    .get(...fieldParams, ...whereParams);
  const totalDocs = typeof countRow?.total === "number" ? countRow.total : 0;

  const { meta, offset, paginated } = buildPaginationMeta({
    limit,
    page,
    totalDocs,
  });

  // `sort` only chooses the direction — the ordering column is the distinct
  // value itself (aliased below), so a leading `-` on any field reads as DESC.
  const firstSort = Array.isArray(sort) ? sort[0] : sort;
  const direction =
    typeof firstSort === "string" && firstSort.startsWith("-") ? "DESC" : "ASC";

  const limitClause = paginated
    ? { sql: " LIMIT ? OFFSET ?", params: [meta.limit, offset] }
    : { sql: "", params: [] };

  const rows = this.connection
    .prepare(
      `SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${sql} AND ${column} IS NOT NULL ORDER BY value ${direction}${limitClause.sql}`,
    )
    .all(...fieldParams, ...whereParams, ...fieldParams, ...limitClause.params);

  const values = rows.map((row) => ({ [field]: row.value }));

  return { ...meta, values };
};
