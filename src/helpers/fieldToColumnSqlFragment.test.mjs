import { describe, expect, it } from "vitest";
import { fieldToColumnSqlFragment } from "./fieldToColumnSqlFragment";

describe("fieldToColumnSqlFragment", () => {
  it("references id as the indexed column, with no bound params", () => {
    expect(fieldToColumnSqlFragment("id")).toEqual({ sql: '"id"', params: [] });
  });

  it("reads a non-id field out of the JSON doc via a bound path", () => {
    // The path is a *parameter*, never interpolated — that keeps a field name
    // from breaking out of the surrounding SQL.
    expect(fieldToColumnSqlFragment("title")).toEqual({
      sql: "json_extract(doc, ?)",
      params: ["$.title"],
    });
  });

  it("passes a dotted path straight through as a nested JSON path", () => {
    expect(fieldToColumnSqlFragment("author.name")).toEqual({
      sql: "json_extract(doc, ?)",
      params: ["$.author.name"],
    });
  });
});
