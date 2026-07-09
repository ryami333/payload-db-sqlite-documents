import type { FindVersions } from "payload";

import { readVersionsPage } from "../helpers/readVersionsPage.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Find a page of version records for a collection, returning Payload's
 * `PaginatedDocs<TypeWithVersion>` shape.
 *
 * The versions equivalent of {@link import("./find.js").find}, sharing its
 * paginated-read core with {@link import("./findGlobalVersions.js").findGlobalVersions}
 * via {@link readVersionsPage} — here scoped to `collection_slug`. The
 * `where`/`sort` Payload passes address the stored record directly (`parent`,
 * `updatedAt`, `latest`, `version.…`), so no rewriting is needed.
 *
 * Declared as a regular function (not an arrow) so Payload binds `this` to the
 * live adapter, exposing the connection handle opened in `init`.
 */
export const findVersions: FindVersions = async function findVersions(
  this: SQLiteDocumentsAdapter,
  { collection, limit, page, pagination, sort, where },
) {
  const { docs, meta } = readVersionsPage({
    connection: this.connection,
    limit,
    page,
    pagination,
    scopeColumn: "collection_slug",
    scopeValue: collection,
    sort,
    where,
  });

  return { docs, ...meta };
};
