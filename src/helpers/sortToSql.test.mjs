import { describe, expect, it } from "vitest";
import { sortToSql } from "./sortToSql";

describe("sortToSql", () => {
  it("falls back to a stable id order when no sort is given", () => {
    expect(sortToSql(undefined)).toEqual({ clause: '"id" ASC', params: [] });
  });

  it("sorts a field ascending and appends the id tiebreaker", () => {
    // The trailing `"id" ASC` keeps rows that tie on the field deterministic,
    // which is what makes pagination stable across pages.
    expect(sortToSql("title")).toEqual({
      clause: 'json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.title"],
    });
  });

  it("reads a leading - as descending", () => {
    expect(sortToSql("-createdAt")).toEqual({
      clause: 'json_extract(doc, ?) DESC, "id" ASC',
      params: ["$.createdAt"],
    });
  });

  it("honours multiple sort fields in order", () => {
    expect(sortToSql(["-status", "title"])).toEqual({
      clause: 'json_extract(doc, ?) DESC, json_extract(doc, ?) ASC, "id" ASC',
      params: ["$.status", "$.title"],
    });
  });

  it("does not double up the tiebreaker when already sorting by id", () => {
    expect(sortToSql("-id")).toEqual({ clause: '"id" DESC', params: [] });
  });
});
