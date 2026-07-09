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

  it("throws on operators it does not understand yet", () => {
    // The stubbed operators must fail loudly — silently ignoring `greater_than`
    // would return wrong rows.
    expect(() => whereToSqlClause({ views: { greater_than: 10 } })).toThrow(
      'operator "greater_than" is not supported yet',
    );
  });

  it("throws on a query value it cannot bind", () => {
    expect(() => whereToSqlClause({ tags: { equals: ["a", "b"] } })).toThrow(
      "unsupported query value",
    );
  });
});
