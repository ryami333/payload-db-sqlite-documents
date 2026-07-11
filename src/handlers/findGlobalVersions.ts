import type {
  FindGlobalVersions,
  FindGlobalVersionsArgs,
  JsonObject,
} from "payload";

import { readVersionsPage } from "../helpers/readVersionsPage.js";
import type { SQLiteDocumentsAdapter } from "../index.js";

/**
 * Find a page of version records for a global, returning Payload's
 * `PaginatedDocs<TypeWithVersion>` shape.
 *
 * The global counterpart of {@link import("./findVersions.js").findVersions},
 * sharing the same paginated-read core ({@link readVersionsPage}) but scoped to
 * `global_slug`. Global versions have no `parent`, but are otherwise the same
 * records.
 *
 * Written as a generic function so the returned docs come back as
 * `TypeWithVersion<T>`. Declared as a regular function (not an arrow) so
 * Payload binds `this` to the live adapter, exposing the connection handle
 * opened in `init`.
 */
export const findGlobalVersions: FindGlobalVersions =
  async function findGlobalVersions<T = JsonObject>(
    this: SQLiteDocumentsAdapter,
    { global, limit, page, pagination, sort, where }: FindGlobalVersionsArgs,
  ) {
    const { docs, meta } = readVersionsPage<T>({
      connection: this.connection,
      limit,
      page,
      pagination,
      scopeColumn: "global_slug",
      scopeValue: global,
      sort,
      where,
    });

    return { docs, ...meta };
  };
