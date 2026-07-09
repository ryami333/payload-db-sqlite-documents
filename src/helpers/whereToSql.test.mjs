import { describe, expect, it } from "vitest";
import { whereToSql } from "./whereToSql";

describe("whereToSql", () => {
  it("treats an absent query as the always-true clause", () => {
    expect(whereToSql(undefined)).toEqual({ clause: "1", params: [] });
  });

  it("treats an empty query object as always-true too", () => {
    expect(whereToSql({})).toEqual({ clause: "1", params: [] });
  });

  it("matches id against the indexed column, not the JSON blob", () => {
    // `id` is a real primary-key column, so it compares directly with no
    // json_extract path parameter.
    expect(whereToSql({ id: { equals: "abc" } })).toEqual({
      clause: '"id" = ?',
      params: ["abc"],
    });
  });

  it("reads a non-id field out of the JSON doc via a bound path", () => {
    // The extraction path is a *parameter*, never interpolated — that's what
    // keeps an attacker-controlled field name from breaking out of the SQL.
    expect(whereToSql({ title: { equals: "Hello" } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.title", "Hello"],
    });
  });

  it("passes dotted field paths straight through as a JSON path", () => {
    expect(whereToSql({ "author.name": { equals: "Ada" } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.author.name", "Ada"],
    });
  });

  it("normalises boolean equals to 1/0 (how JSON booleans surface)", () => {
    expect(whereToSql({ published: { equals: true } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.published", 1],
    });
    expect(whereToSql({ published: { equals: false } })).toEqual({
      clause: "json_extract(doc, ?) = ?",
      params: ["$.published", 0],
    });
  });

  it("renders equals null as IS NULL with no comparison parameter", () => {
    expect(whereToSql({ title: { equals: null } })).toEqual({
      clause: "json_extract(doc, ?) IS NULL",
      params: ["$.title"],
    });
  });

  it("ANDs multiple field constraints together", () => {
    expect(whereToSql({ id: { equals: "x" }, title: { equals: "y" } })).toEqual(
      {
        clause: '"id" = ? AND json_extract(doc, ?) = ?',
        params: ["x", "$.title", "y"],
      },
    );
  });

  it("composes an explicit `and` with parentheses", () => {
    expect(
      whereToSql({
        and: [{ id: { equals: "x" } }, { title: { equals: "y" } }],
      }),
    ).toEqual({
      clause: '("id" = ? AND json_extract(doc, ?) = ?)',
      params: ["x", "$.title", "y"],
    });
  });

  it("composes an `or` with OR between the branches", () => {
    expect(
      whereToSql({ or: [{ id: { equals: "x" } }, { id: { equals: "y" } }] }),
    ).toEqual({
      clause: '("id" = ? OR "id" = ?)',
      params: ["x", "y"],
    });
  });

  it("folds an empty and/or to always-true rather than emitting `()`", () => {
    expect(whereToSql({ and: [] })).toEqual({ clause: "(1)", params: [] });
  });

  it("throws on operators it does not understand yet", () => {
    // The stubbed operators must fail loudly — silently ignoring `greater_than`
    // would return wrong rows.
    expect(() => whereToSql({ views: { greater_than: 10 } })).toThrow(
      'operator "greater_than" is not supported yet',
    );
  });

  it("throws on a query value it cannot bind", () => {
    expect(() => whereToSql({ tags: { equals: ["a", "b"] } })).toThrow(
      "unsupported query value",
    );
  });
});
