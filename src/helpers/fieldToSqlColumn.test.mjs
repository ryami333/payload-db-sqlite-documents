import { describe, expect, it } from "vitest";
import { fieldToSqlColumn } from "./fieldToSqlColumn";

describe("fieldToSqlColumn", () => {
  it("references id as the indexed column, with no bound params", () => {
    expect(fieldToSqlColumn("id")).toEqual({ column: '"id"', params: [] });
  });

  it("reads a non-id field out of the JSON doc via a bound path", () => {
    // The path is a *parameter*, never interpolated — that keeps a field name
    // from breaking out of the surrounding SQL.
    expect(fieldToSqlColumn("title")).toEqual({
      column: "json_extract(doc, ?)",
      params: ["$.title"],
    });
  });

  it("passes a dotted path straight through as a nested JSON path", () => {
    expect(fieldToSqlColumn("author.name")).toEqual({
      column: "json_extract(doc, ?)",
      params: ["$.author.name"],
    });
  });
});
