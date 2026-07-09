import type { Find } from "payload";

import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { sortToSqlClause } from "../helpers/sortToSqlClause.js";
import { whereToSqlClause } from "../helpers/whereToSqlClause.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/** Payload's default page size when a query doesn't specify a `limit`. */
const DEFAULT_LIMIT = 10;

/**
 * Find a page of documents in a collection, returning Payload's
 * {@link import("payload").PaginatedDocs} shape.
 *
 * Builds on the same pieces as the other reads: {@link whereToSqlClause} for
 * the filter and {@link sortToSqlClause} for a deterministic `ORDER BY`, and it
 * delegates `totalDocs` to {@link import("./count.js").count} so both agree on
 * how matches are counted. The pagination metadata mirrors
 * `mongoose-paginate-v2` — the contract the `db-mongodb` adapter this stands in
 * for exposes.
 *
 * `limit: 0` or `pagination: false` disables paging and returns every match on a
 * single page. Declared as a regular function (not an arrow) so Payload binds
 * `this` to the live adapter, exposing the connection handle opened in `init`.
 */
export const find: Find = async function find(
  this: SQLiteDocumentsAdapter,
  { collection, limit, page, pagination, sort, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const { clause, params } = whereToSqlClause(where);

  // Delegate the total to `count` so both share one definition of "how many
  // docs match" — `find` only computes the clause a second time for the data
  // query below.
  const { totalDocs } = await this.count({ collection, where });

  const requestedLimit = limit ?? DEFAULT_LIMIT;
  // `limit: 0` is Payload's "no limit"; `pagination: false` asks for everything
  // on one page. Either way we skip LIMIT/OFFSET and return the whole match set.
  const paginated = pagination !== false && requestedLimit !== 0;
  const currentPage = paginated ? (page ?? 1) : 1;

  const { clause: orderBy, params: orderParams } = sortToSqlClause(sort);

  // Keep the LIMIT/OFFSET fragment's SQL and its params together so they can't
  // drift out of sync; an empty fragment when unpaginated composes to nothing.
  const limitClause = paginated
    ? {
        sql: " LIMIT ? OFFSET ?",
        params: [requestedLimit, (currentPage - 1) * requestedLimit],
      }
    : { sql: "", params: [] };

  const sql = `SELECT doc FROM ${table} WHERE ${clause} ORDER BY ${orderBy}${limitClause.sql}`;
  const queryParams = [...params, ...orderParams, ...limitClause.params];

  const rows = this.connection.prepare(sql).all(...queryParams);
  // Each `doc` is a string we wrote; narrow rather than trust the loose SQLite
  // output type before parsing, and drop anything that somehow isn't.
  const docs = rows.flatMap((row) =>
    typeof row.doc === "string" ? [JSON.parse(row.doc)] : [],
  );

  // Report `limit` as the effective page size: the requested limit when paging,
  // or the whole result set when paging is off — matching mongoose-paginate-v2.
  const effectiveLimit = paginated ? requestedLimit : totalDocs;
  const totalPages = paginated ? Math.ceil(totalDocs / requestedLimit) || 1 : 1;
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return {
    docs,
    hasNextPage,
    hasPrevPage,
    limit: effectiveLimit,
    nextPage: hasNextPage ? currentPage + 1 : null,
    page: currentPage,
    pagingCounter: (currentPage - 1) * effectiveLimit + 1,
    prevPage: hasPrevPage ? currentPage - 1 : null,
    totalDocs,
    totalPages,
  };
};
