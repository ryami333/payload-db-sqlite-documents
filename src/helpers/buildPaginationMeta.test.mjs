import { describe, expect, it } from "vitest";
import { buildPaginationMeta } from "./buildPaginationMeta";

describe("buildPaginationMeta", () => {
  it("defaults to page 1 with a limit of 10", () => {
    const { meta, offset, paginated } = buildPaginationMeta({ totalDocs: 3 });

    expect(paginated).toBe(true);
    expect(offset).toBe(0);
    expect(meta).toEqual({
      hasNextPage: false,
      hasPrevPage: false,
      limit: 10,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: 3,
      totalPages: 1,
    });
  });

  it("keeps totalPages at 1 for an empty result", () => {
    const { meta } = buildPaginationMeta({ totalDocs: 0 });
    expect(meta.totalPages).toBe(1);
    expect(meta.page).toBe(1);
  });

  it("computes a middle page's neighbours, offset and paging counter", () => {
    const { meta, offset } = buildPaginationMeta({
      totalDocs: 5,
      limit: 2,
      page: 2,
    });

    expect(offset).toBe(2);
    expect(meta).toMatchObject({
      totalPages: 3,
      page: 2,
      limit: 2,
      hasPrevPage: true,
      hasNextPage: true,
      prevPage: 1,
      nextPage: 3,
      pagingCounter: 3,
    });
  });

  it("collapses to a single unpaginated page when pagination is false", () => {
    const { meta, offset, paginated } = buildPaginationMeta({
      totalDocs: 5,
      pagination: false,
    });

    expect(paginated).toBe(false);
    expect(offset).toBe(0);
    // limit widens to the full count; everything is on page 1.
    expect(meta).toMatchObject({
      limit: 5,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it("treats limit 0 as no limit, same as pagination: false", () => {
    const { meta, paginated } = buildPaginationMeta({ totalDocs: 5, limit: 0 });

    expect(paginated).toBe(false);
    expect(meta).toMatchObject({ limit: 5, totalPages: 1, page: 1 });
  });
});
