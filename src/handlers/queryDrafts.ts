import type {
  PaginatedDocs,
  QueryDrafts,
  QueryDraftsArgs,
  TypeWithID,
} from "payload";

import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * List collection documents by their latest draft/version state, as Payload's
 * `PaginatedDocs` of documents (not version records).
 *
 * Delegates to {@link import("./findVersions.js").findVersions}: it restricts to
 * each parent's `latest` version and ANDs on the caller's filter (already
 * `version.`-prefixed by Payload's `appendVersionToQueryKey`), then unwraps each
 * record to its `version` snapshot with `id` set back to the `parent`, so the
 * results read as ordinary documents. Sharing `findVersions` keeps the counting,
 * ordering and pagination in one place.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter; `findVersions` is reached via `this` for the same reason.
 */
export const queryDrafts: QueryDrafts = async function queryDrafts<
  T = TypeWithID,
>(
  this: SQLiteDocumentsAdapter,
  { collection, limit, page, pagination, sort, where }: QueryDraftsArgs,
): Promise<PaginatedDocs<T>> {
  const latest = { latest: { equals: true } };
  const draftWhere = where ? { and: [latest, where] } : latest;

  const { docs, ...meta } = await this.findVersions({
    collection,
    limit,
    page,
    pagination,
    sort,
    where: draftWhere,
  });

  return {
    ...meta,
    docs: docs.map((record) => ({ ...record.version, id: record.parent }) as T),
  };
};
