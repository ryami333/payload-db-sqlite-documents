import { describe, expect, it } from "vitest";
import { sortToSqlFragment } from "./sortToSqlFragment";

describe("sortToSqlFragment", () => {
  it("falls back to a stable id order when no sort is given", () => {
    expect(sortToSqlFragment(undefined)).toEqual({
      sql: '"id" ASC',
      params: [],
    });
  });

  it("sorts a field ascending and appends the id tiebreaker", () => {
    // The trailing `"id" ASC` keeps rows that tie on the field deterministic,
    // which is what makes pagination stable across pages.
    expect(sortToSqlFragment("title")).toEqual({
      sql: 'json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.title"],
    });
  });

  it("reads a leading - as descending", () => {
    expect(sortToSqlFragment("-createdAt")).toEqual({
      sql: 'json_extract(doc, ?) DESC, "id" ASC',
      params: ["$.createdAt"],
    });
  });

  it("honours multiple sort fields in order", () => {
    expect(sortToSqlFragment(["-status", "title"])).toEqual({
      sql: 'json_extract(doc, ?) DESC, json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.status", "$.title"],
    });
  });

  it("does not double up the tiebreaker when already sorting by id", () => {
    expect(sortToSqlFragment("-id")).toEqual({ sql: '"id" DESC', params: [] });
  });
});
