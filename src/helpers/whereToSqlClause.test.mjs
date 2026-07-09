import { describe, expect, it } from "vitest";
import { whereToSqlClause } from "./whereToSqlClause";

describe("whereToSqlClause", () => {
  it("treats an absent query as the always-true clause", () => {
    expect(whereToSqlClause(undefined)).toEqual({ clause: "1", params: [] });
  });

  it("treats an empty query object as always-true too", () => {
    expect(whereToSqlClause({})).toEqual({ clause: "1", params: [] });
  });

  it("matches id against the indexed column, not the JSON blob", () => {
    // `id` is a real primary-key column, so it compares directly with no
    // json_extract path parameter.
    expect(whereToSqlClause({ id: { equals: "abc" } })).toEqual({
      clause: '"id" = ?',
      params: ["abc"],
    });
  });

  it("reads a non-id field out of the JSON doc via a bound path", () => {
    // The extraction path is a *parameter*, never interpolated — that's what
    // keeps an attacker-controlled field name from breaking out of the SQL.
    expect(whereToSqlClause({ title: { equals: "Hello" } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.title", "Hello"],
    });
  });

  it("passes dotted field paths straight through as a JSON path", () => {
    expect(whereToSqlClause({ "author.name": { equals: "Ada" } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.author.name", "Ada"],
    });
  });

  it("normalises boolean equals to 1/0 (how JSON booleans surface)", () => {
    expect(whereToSqlClause({ published: { equals: true } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.published", 1],
    });
    expect(whereToSqlClause({ published: { equals: false } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.published", 0],
    });
  });

  it("renders equals null as IS NULL with no comparison parameter", () => {
    expect(whereToSqlClause({ title: { equals: null } })).toEqual({
      clause: "json_extract(doc, ?) IS NULL",
      params: ["$.title"],
    });
  });

  it("ANDs multiple field constraints together", () => {
    expect(
      whereToSqlClause({ id: { equals: "x" }, title: { equals: "y" } }),
    ).toEqual({
      clause: '"id" = ? AND json_extract(doc, ?) = ?',
      params: ["x", "$.title", "y"],
    });
  });

  it("composes an explicit `and` with parentheses", () => {
    expect(
      whereToSqlClause({
        and: [{ id: { equals: "x" } }, { title: { equals: "y" } }],
      }),
    ).toEqual({
      clause: '("id" = ? AND json_extract(doc, ?) = ?)',
      params: ["x", "$.title", "y"],
    });
  });

  it("composes an `or` with OR between the branches", () => {
    expect(
      whereToSqlClause({
        or: [{ id: { equals: "x" } }, { id: { equals: "y" } }],
      }),
    ).toEqual({
      clause: '("id" = ? OR "id" = ?)',
      params: ["x", "y"],
    });
  });

  it("folds an empty and/or to always-true rather than emitting `()`", () => {
    expect(whereToSqlClause({ and: [] })).toEqual({
      clause: "(1)",
      params: [],
    });
  });

  it("compares with not_equals as a NULL-safe inequality", () => {
    // `IS NOT ?` (not `!= ?`) so a row missing the field still counts as
    // "not equal", matching db-mongodb's $ne.
    expect(whereToSqlClause({ status: { not_equals: "draft" } })).toEqual({
      clause: "json_extract(doc, ?) IS NOT ?",
      params: ["$.status", "draft"],
    });
  });

  it("renders the ordering operators", () => {
    expect(whereToSqlClause({ views: { greater_than: 10 } })).toEqual({
      clause: "json_extract(doc, ?) > ?",
      params: ["$.views", 10],
    });
    expect(whereToSqlClause({ views: { less_than_equal: 5 } })).toEqual({
      clause: "json_extract(doc, ?) <= ?",
      params: ["$.views", 5],
    });
  });

  it("expands in to a bound placeholder list", () => {
    expect(whereToSqlClause({ id: { in: ["a", "b", "c"] } })).toEqual({
      clause: '"id" IN (?, ?, ?)',
      params: ["a", "b", "c"],
    });
  });

  it("accepts a comma-separated string for in", () => {
    expect(whereToSqlClause({ id: { in: "a,b" } })).toEqual({
      clause: '"id" IN (?, ?)',
      params: ["a", "b"],
    });
  });

  it("short-circuits empty in/not_in to constants (no dangling params)", () => {
    // Neither references the column, so no json_extract path param leaks in.
    expect(whereToSqlClause({ tags: { in: [] } })).toEqual({
      clause: "0",
      params: [],
    });
    expect(whereToSqlClause({ tags: { not_in: [] } })).toEqual({
      clause: "1",
      params: [],
    });
  });

  it("renders exists as a null check without binding a value", () => {
    expect(whereToSqlClause({ title: { exists: true } })).toEqual({
      clause: "json_extract(doc, ?) IS NOT NULL",
      params: ["$.title"],
    });
    expect(whereToSqlClause({ title: { exists: false } })).toEqual({
      clause: "json_extract(doc, ?) IS NULL",
      params: ["$.title"],
    });
  });

  it("wraps contains/like values in substring wildcards", () => {
    expect(whereToSqlClause({ title: { contains: "ell" } })).toEqual({
      clause: "json_extract(doc, ?) LIKE ?",
      params: ["$.title", "%ell%"],
    });
    expect(whereToSqlClause({ title: { not_like: "spam" } })).toEqual({
      clause: "json_extract(doc, ?) NOT LIKE ?",
      params: ["$.title", "%spam%"],
    });
  });

  it("still throws on the array/geo operators it does not implement", () => {
    // These must fail loudly rather than silently returning wrong rows.
    expect(() => whereToSqlClause({ point: { near: [0, 0, 10] } })).toThrow(
      'operator "near" is not supported yet',
    );
    expect(() => whereToSqlClause({ tags: { all: ["a"] } })).toThrow(
      'operator "all" is not supported yet',
    );
  });

  it("throws on a query value it cannot bind", () => {
    expect(() =>
      whereToSqlClause({ tags: { greater_than: { nested: true } } }),
    ).toThrow("unsupported query value");
  });
});
