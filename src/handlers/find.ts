import type { Find } from "payload";

import { buildPaginationMeta } from "../helpers/buildPaginationMeta.js";
import { ensureCollectionTable } from "../helpers/ensureCollectionTable.js";
import { sortToSqlFragment } from "../helpers/sortToSqlFragment.js";
import { whereToSqlFragment } from "../helpers/whereToSqlFragment.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Find a page of documents in a collection, returning Payload's
 * {@link import("payload").PaginatedDocs} shape.
 *
 * Builds on the same pieces as the other reads: {@link whereToSqlFragment} for
 * the filter and {@link sortToSqlFragment} for a deterministic `ORDER BY`, and it
 * delegates `totalDocs` to {@link import("./count.js").count} so both agree on
 * how matches are counted. Pagination is computed by
 * {@link buildPaginationMeta}, which `limit: 0` / `pagination: false` collapse
 * to a single unpaginated page.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const find: Find = async function find(
  this: SQLiteDocumentsAdapter,
  { collection, limit, page, pagination, sort, where },
) {
  const table = ensureCollectionTable({
    connection: this.connection,
    slug: collection,
  });

  const whereFragment = whereToSqlFragment(where);

  // Delegate the total to `count` so both share one definition of "how many
  // docs match" — `find` only computes the clause a second time for the data
  // query below.
  const { totalDocs } = await this.count({ collection, where });

  const { meta, offset, paginated } = buildPaginationMeta({
    limit,
    page,
    pagination,
    totalDocs,
  });

  const sortFragment = sortToSqlFragment(sort);

  // Keep the LIMIT/OFFSET fragment's SQL and its params together so they can't
  // drift out of sync; an empty fragment when unpaginated composes to nothing.
  const limitClause = paginated
    ? { sql: " LIMIT ? OFFSET ?", params: [meta.limit, offset] }
    : { sql: "", params: [] };

  const query = `SELECT doc FROM ${table} WHERE ${whereFragment.sql} ORDER BY ${sortFragment.sql}${limitClause.sql}`;
  const queryParams = [
    ...whereFragment.params,
    ...sortFragment.params,
    ...limitClause.params,
  ];

  const rows = this.connection.prepare(query).all(...queryParams);
  // Each `doc` is a string we wrote; narrow rather than trust the loose SQLite
  // output type before parsing, and drop anything that somehow isn't.
  const docs = rows.flatMap((row) =>
    typeof row.doc === "string" ? [JSON.parse(row.doc)] : [],
  );

  return { docs, ...meta };
};
