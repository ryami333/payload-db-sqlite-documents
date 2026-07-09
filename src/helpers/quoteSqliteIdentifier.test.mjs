import { describe, expect, it } from "vitest";
import { quoteSqliteIdentifier } from "./quoteSqliteIdentifier";

describe("quoteSqliteIdentifier", () => {
  it("wraps a plain identifier in double-quotes", () => {
    expect(quoteSqliteIdentifier("posts")).toBe('"posts"');
  });

  it("quotes reserved words so they can be used as identifiers", () => {
    expect(quoteSqliteIdentifier("order")).toBe('"order"');
    expect(quoteSqliteIdentifier("select")).toBe('"select"');
  });

  it("escapes an embedded double-quote by doubling it (SQL rule)", () => {
    // `a"b` -> "a""b", not "a\"b" — this is the whole reason the helper exists.
    expect(quoteSqliteIdentifier('a"b')).toBe('"a""b"');
  });

  it("escapes every embedded double-quote", () => {
    expect(quoteSqliteIdentifier('""')).toBe('""""""');
  });

  it("leaves a backslash untouched (unlike JSON escaping)", () => {
    // JSON.stringify would produce "a\\b"; SQLite treats backslash literally.
    expect(quoteSqliteIdentifier("a\\b")).toBe('"a\\b"');
  });

  it("diverges from JSON.stringify exactly on embedded double-quotes", () => {
    // Documents why JSON.stringify is not a valid substitute: the two agree for
    // tame slugs but escape a double-quote differently.
    expect(quoteSqliteIdentifier("posts")).toBe(JSON.stringify("posts"));
    expect(quoteSqliteIdentifier('a"b')).not.toBe(JSON.stringify('a"b'));
  });
});
