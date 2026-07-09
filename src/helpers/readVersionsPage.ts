import type { DatabaseSync } from "node:sqlite";

import type { Sort, Where } from "payload";

import type { PaginationMeta } from "./buildPaginationMeta.js";
import { buildPaginationMeta } from "./buildPaginationMeta.js";
import { ensureVersionsTable } from "./ensureVersionsTable.js";
import { sortToSqlClause } from "./sortToSqlClause.js";
import { whereToSqlClause } from "./whereToSqlClause.js";

/**
 * Read a page of version records from the shared `payload_versions` table,
 * scoped to a single collection or global.
 *
 * The paginated-read core behind both {@link import("../handlers/findVersions.js").findVersions}
 * (scoped by `collection_slug`) and
 * {@link import("../handlers/findGlobalVersions.js").findGlobalVersions} (by
 * `global_slug`) — they differ only in which scope column is filtered, so it's
 * passed in. Combines {@link whereToSqlClause}, {@link sortToSqlClause} and
 * {@link buildPaginationMeta} the same way {@link import("../handlers/find.js").find}
 * does for collection documents; `docs` are the parsed `TypeWithVersion` records
 * (typed loosely here since they come straight from `JSON.parse`).
 */
export const readVersionsPage = ({
  connection,
  limit,
  page,
  pagination,
  scopeColumn,
  scopeValue,
  sort,
  where,
}: {
  connection: DatabaseSync;
  limit?: number;
  page?: number;
  pagination?: boolean;
  scopeColumn: "collection_slug" | "global_slug";
  scopeValue: string;
  sort?: Sort;
  where?: Where;
}): { docs: any[]; meta: PaginationMeta } => {
  const table = ensureVersionsTable({ connection });

  const { clause, params } = whereToSqlClause(where);
  const scopedClause = `${scopeColumn} = ? AND ${clause}`;
  const scopedParams = [scopeValue, ...params];

  const countRow = connection
    .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${scopedClause}`)
    .get(...scopedParams);
  const totalDocs = typeof countRow?.total === "number" ? countRow.total : 0;

  const { meta, offset, paginated } = buildPaginationMeta({
    limit,
    page,
    pagination,
    totalDocs,
  });

  const { clause: orderBy, params: orderParams } = sortToSqlClause(sort);
  const limitClause = paginated
    ? { sql: " LIMIT ? OFFSET ?", params: [meta.limit, offset] }
    : { sql: "", params: [] };

  const rows = connection
    .prepare(
      `SELECT doc FROM ${table} WHERE ${scopedClause} ORDER BY ${orderBy}${limitClause.sql}`,
    )
    .all(...scopedParams, ...orderParams, ...limitClause.params);

  const docs = rows.flatMap((row) =>
    typeof row.doc === "string" ? [JSON.parse(row.doc)] : [],
  );

  return { docs, meta };
};
