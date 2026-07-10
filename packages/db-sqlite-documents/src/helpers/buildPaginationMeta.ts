/** Payload's default page size when a query doesn't specify a `limit`. */
export const DEFAULT_LIMIT = 10;

/**
 * The pagination fields shared by Payload's `PaginatedDocs` and
 * `PaginatedDistinctDocs` — everything in those shapes except the payload array
 * (`docs` / `values`). Spread straight into either result.
 */
export interface PaginationMeta {
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
  nextPage: number | null;
  page: number;
  pagingCounter: number;
  prevPage: number | null;
  totalDocs: number;
  totalPages: number;
}

/**
 * Compute the pagination envelope for a listing query, mirroring
 * `mongoose-paginate-v2` (the contract the `db-mongodb` adapter exposes):
 * `totalPages` is `ceil(totalDocs / limit)` but never below `1`, and prev/next
 * derive from the current page.
 *
 * `limit: 0` or `pagination: false` turns paging off — the caller should skip
 * `LIMIT`/`OFFSET` and return the whole match set on a single page, with the
 * reported `limit` widened to `totalDocs`.
 *
 * Returns the `meta` to spread into the result, plus the `offset` and a
 * `paginated` flag the caller needs to build its `LIMIT ? OFFSET ?` (using
 * `meta.limit`, which equals the SQL limit whenever `paginated`).
 */
export const buildPaginationMeta = ({
  limit,
  page,
  pagination,
  totalDocs,
}: {
  limit?: number;
  page?: number;
  pagination?: boolean;
  totalDocs: number;
}): { meta: PaginationMeta; offset: number; paginated: boolean } => {
  const requestedLimit = limit ?? DEFAULT_LIMIT;
  const paginated = pagination !== false && requestedLimit !== 0;
  const currentPage = paginated ? (page ?? 1) : 1;

  // With paging off, the whole result sits on one page and `limit` reports the
  // full count rather than the (ignored) requested page size.
  const effectiveLimit = paginated ? requestedLimit : totalDocs;
  const totalPages = paginated ? Math.ceil(totalDocs / requestedLimit) || 1 : 1;
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return {
    meta: {
      hasNextPage,
      hasPrevPage,
      limit: effectiveLimit,
      nextPage: hasNextPage ? currentPage + 1 : null,
      page: currentPage,
      pagingCounter: (currentPage - 1) * effectiveLimit + 1,
      prevPage: hasPrevPage ? currentPage - 1 : null,
      totalDocs,
      totalPages,
    },
    offset: (currentPage - 1) * requestedLimit,
    paginated,
  };
};
