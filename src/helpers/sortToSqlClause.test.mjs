import { describe, expect, it } from "vitest";
import { sortToSqlClause } from "./sortToSqlClause";

describe("sortToSqlClause", () => {
  it("falls back to a stable id order when no sort is given", () => {
    expect(sortToSqlClause(undefined)).toEqual({
      clause: '"id" ASC',
      params: [],
    });
  });

  it("sorts a field ascending and appends the id tiebreaker", () => {
    // The trailing `"id" ASC` keeps rows that tie on the field deterministic,
    // which is what makes pagination stable across pages.
    expect(sortToSqlClause("title")).toEqual({
      clause: 'json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.title"],
    });
  });

  it("reads a leading - as descending", () => {
    expect(sortToSqlClause("-createdAt")).toEqual({
      clause: 'json_extract(doc, ?) DESC, "id" ASC',
      params: ["$.createdAt"],
    });
  });

  it("honours multiple sort fields in order", () => {
    expect(sortToSqlClause(["-status", "title"])).toEqual({
      clause: 'json_extract(doc, ?) DESC, json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.status", "$.title"],
    });
  });

  it("does not double up the tiebreaker when already sorting by id", () => {
    expect(sortToSqlClause("-id")).toEqual({ clause: '"id" DESC', params: [] });
  });
});
