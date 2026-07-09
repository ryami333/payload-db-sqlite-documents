import type { FindVersions } from "payload";

import { buildPaginationMeta } from "../helpers/buildPaginationMeta.js";
import { ensureVersionsTable } from "../helpers/ensureVersionsTable.js";
import { sortToSqlClause } from "../helpers/sortToSqlClause.js";
import { whereToSqlClause } from "../helpers/whereToSqlClause.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Find a page of version records for a collection, returning Payload's
 * `PaginatedDocs<TypeWithVersion>` shape.
 *
 * The versions equivalent of {@link import("./find.js").find}: the same
 * {@link whereToSqlClause} / {@link sortToSqlClause} / {@link buildPaginationMeta}
 * pieces, over the shared `payload_versions` table scoped to `collection_slug`.
 * The `where`/`sort` Payload passes address the stored record directly (`parent`,
 * `updatedAt`, `latest`, `version.…`), so no rewriting is needed here.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const findVersions: FindVersions = async function findVersions(
  this: SQLiteDocumentsAdapter,
  { collection, limit, page, pagination, sort, where },
) {
  const table = ensureVersionsTable({ connection: this.connection });

  const { clause, params } = whereToSqlClause(where);
  // Scope every query to this collection's versions.
  const scopedClause = `collection_slug = ? AND ${clause}`;
  const scopedParams = [collection, ...params];

  const countRow = this.connection
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

  const rows = this.connection
    .prepare(
      `SELECT doc FROM ${table} WHERE ${scopedClause} ORDER BY ${orderBy}${limitClause.sql}`,
    )
    .all(...scopedParams, ...orderParams, ...limitClause.params);

  const docs = rows.flatMap((row) =>
    typeof row.doc === "string" ? [JSON.parse(row.doc)] : [],
  );

  return { docs, ...meta };
};
