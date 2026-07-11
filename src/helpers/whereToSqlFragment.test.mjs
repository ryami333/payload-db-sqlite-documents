import { describe, expect, it } from "vitest";
import { whereToSqlFragment } from "./whereToSqlFragment";

describe("whereToSqlFragment", () => {
  it("treats an absent query as the always-true clause", () => {
    expect(whereToSqlFragment(undefined)).toEqual({ sql: "1", params: [] });
  });

  it("treats an empty query object as always-true too", () => {
    expect(whereToSqlFragment({})).toEqual({ sql: "1", params: [] });
  });

  it("matches id against the indexed column, not the JSON blob", () => {
    // `id` is a real primary-key column, so it compares directly with no
    // json_extract path parameter.
    expect(whereToSqlFragment({ id: { equals: "abc" } })).toEqual({
      sql: '"id" = ?',
      params: ["abc"],
    });
  });

  it("matches a non-id field via json_each with a bound path", () => {
    // The extraction path is a *parameter*, never interpolated — that's what
    // keeps an attacker-controlled field name from breaking out of the SQL.
    // json_each (not a scalar `=`) is what makes equals array-aware.
    expect(whereToSqlFragment({ title: { equals: "Hello" } })).toEqual({
      sql: "EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)",
      params: ["$.title", "Hello"],
    });
  });

  it("passes dotted field paths straight through as a JSON path", () => {
    expect(whereToSqlFragment({ "author.name": { equals: "Ada" } })).toEqual({
      sql: "EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)",
      params: ["$.author.name", "Ada"],
    });
  });

  it("normalises boolean equals to 1/0 (how JSON booleans surface)", () => {
    expect(whereToSqlFragment({ published: { equals: true } })).toEqual({
      sql: "EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)",
      params: ["$.published", 1],
    });
    expect(whereToSqlFragment({ published: { equals: false } })).toEqual({
      sql: "EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)",
      params: ["$.published", 0],
    });
  });

  it("renders equals null as IS NULL with no comparison parameter", () => {
    expect(whereToSqlFragment({ title: { equals: null } })).toEqual({
      sql: "json_extract(doc, ?) IS NULL",
      params: ["$.title"],
    });
  });

  it("ANDs multiple field constraints together", () => {
    // id stays a scalar `=` (indexed, never an array); the JSON field goes
    // through json_each.
    expect(
      whereToSqlFragment({ id: { equals: "x" }, title: { equals: "y" } }),
    ).toEqual({
      sql: '"id" = ? AND EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)',
      params: ["x", "$.title", "y"],
    });
  });

  it("composes an explicit `and` with parentheses", () => {
    expect(
      whereToSqlFragment({
        and: [{ id: { equals: "x" } }, { title: { equals: "y" } }],
      }),
    ).toEqual({
      sql: '("id" = ? AND EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?))',
      params: ["x", "$.title", "y"],
    });
  });

  it("composes an `or` with OR between the branches", () => {
    expect(
      whereToSqlFragment({
        or: [{ id: { equals: "x" } }, { id: { equals: "y" } }],
      }),
    ).toEqual({
      sql: '("id" = ? OR "id" = ?)',
      params: ["x", "y"],
    });
  });

  it("folds an empty and/or to always-true rather than emitting `()`", () => {
    expect(whereToSqlFragment({ and: [] })).toEqual({
      sql: "(1)",
      params: [],
    });
  });

  it("renders not_equals as an array-aware NOT EXISTS", () => {
    // NOT EXISTS excludes a scalar match or array membership, and (since
    // json_each of a missing field yields no rows) still includes rows missing
    // the field — matching db-mongodb's $ne.
    expect(whereToSqlFragment({ status: { not_equals: "draft" } })).toEqual({
      sql: "NOT EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?)",
      params: ["$.status", "draft"],
    });
  });

  it("keeps not_equals on id as a scalar NULL-safe inequality", () => {
    // id is never an array, so it stays a direct `IS NOT ?` on the index.
    expect(whereToSqlFragment({ id: { not_equals: "x" } })).toEqual({
      sql: '"id" IS NOT ?',
      params: ["x"],
    });
  });

  it("renders the ordering operators", () => {
    expect(whereToSqlFragment({ views: { greater_than: 10 } })).toEqual({
      sql: "json_extract(doc, ?) > ?",
      params: ["$.views", 10],
    });
    expect(whereToSqlFragment({ views: { less_than_equal: 5 } })).toEqual({
      sql: "json_extract(doc, ?) <= ?",
      params: ["$.views", 5],
    });
  });

  it("expands in to a bound placeholder list", () => {
    expect(whereToSqlFragment({ id: { in: ["a", "b", "c"] } })).toEqual({
      sql: '"id" IN (?, ?, ?)',
      params: ["a", "b", "c"],
    });
  });

  it("accepts a comma-separated string for in", () => {
    expect(whereToSqlFragment({ id: { in: "a,b" } })).toEqual({
      sql: '"id" IN (?, ?)',
      params: ["a", "b"],
    });
  });

  it("short-circuits empty in/not_in to constants (no dangling params)", () => {
    // Neither references the column, so no json_extract path param leaks in.
    expect(whereToSqlFragment({ tags: { in: [] } })).toEqual({
      sql: "0",
      params: [],
    });
    expect(whereToSqlFragment({ tags: { not_in: [] } })).toEqual({
      sql: "1",
      params: [],
    });
  });

  it("renders exists as a null check without binding a value", () => {
    expect(whereToSqlFragment({ title: { exists: true } })).toEqual({
      sql: "json_extract(doc, ?) IS NOT NULL",
      params: ["$.title"],
    });
    expect(whereToSqlFragment({ title: { exists: false } })).toEqual({
      sql: "json_extract(doc, ?) IS NULL",
      params: ["$.title"],
    });
  });

  it("wraps contains in a single substring pattern (no word split)", () => {
    // contains matches the whole value contiguously, spaces included.
    expect(whereToSqlFragment({ title: { contains: "hello world" } })).toEqual({
      sql: "json_extract(doc, ?) LIKE ?",
      params: ["$.title", "%hello world%"],
    });
  });

  it("keeps a single-word like as a plain LIKE", () => {
    expect(whereToSqlFragment({ title: { like: "ell" } })).toEqual({
      sql: "json_extract(doc, ?) LIKE ?",
      params: ["$.title", "%ell%"],
    });
  });

  it("splits like on whitespace and requires every word (ANDed)", () => {
    expect(whereToSqlFragment({ title: { like: "hello world" } })).toEqual({
      sql: "(json_extract(doc, ?) LIKE ? AND json_extract(doc, ?) LIKE ?)",
      params: ["$.title", "%hello%", "$.title", "%world%"],
    });
  });

  it("adds an IS NULL disjunct to not_like so absent fields match", () => {
    // Mongo parity: a row missing the field is "not like" the value. Even a
    // single-word not_like carries the OR-IS-NULL branch.
    expect(whereToSqlFragment({ title: { not_like: "spam" } })).toEqual({
      sql: "(json_extract(doc, ?) NOT LIKE ? OR json_extract(doc, ?) IS NULL)",
      params: ["$.title", "%spam%", "$.title"],
    });
  });

  it("negates a multi-word not_like with OR, plus the IS NULL branch", () => {
    // not-all-words-present (De Morgan) OR field absent.
    expect(whereToSqlFragment({ title: { not_like: "hello world" } })).toEqual({
      sql:
        "(json_extract(doc, ?) NOT LIKE ? OR json_extract(doc, ?) NOT LIKE ? " +
        "OR json_extract(doc, ?) IS NULL)",
      params: ["$.title", "%hello%", "$.title", "%world%", "$.title"],
    });
  });

  it("expands all to a correlated json_each EXISTS per value", () => {
    // The JSON array at the field must contain every listed value.
    expect(whereToSqlFragment({ tags: { all: ["x", "y"] } })).toEqual({
      sql:
        "(EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?) AND " +
        "EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value = ?))",
      params: ["$.tags", "x", "$.tags", "y"],
    });
  });

  it("treats an empty all as vacuously true", () => {
    expect(whereToSqlFragment({ tags: { all: [] } })).toEqual({
      sql: "1",
      params: [],
    });
  });

  it("rejects the geospatial operators as unsupported (not a 'yet')", () => {
    for (const operator of ["within", "intersects", "near"]) {
      expect(() =>
        whereToSqlFragment({ point: { [operator]: [0, 0] } }),
      ).toThrow(`geospatial query operator "${operator}" is not supported`);
    }
  });

  it("binds a Date operand as its ISO string", () => {
    // Payload passes real Date objects for timestamp queries (e.g. lock
    // checks); dates live in the doc JSON as ISO strings, so match on those.
    const date = new Date("2026-07-10T11:47:38.687Z");
    expect(whereToSqlFragment({ updatedAt: { greater_than: date } })).toEqual({
      sql: "json_extract(doc, ?) > ?",
      params: ["$.updatedAt", "2026-07-10T11:47:38.687Z"],
    });
  });

  it("throws on a query value it cannot bind", () => {
    expect(() =>
      whereToSqlFragment({ tags: { greater_than: { nested: true } } }),
    ).toThrow("unsupported query value");
  });
});
