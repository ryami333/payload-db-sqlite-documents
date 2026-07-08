import { describe, expect, it } from "vitest";
import { sqliteDocumentsAdapter } from "./index.ts";

describe("sqliteDocumentsAdapter", () => {
  it("returns an adapter with the expected metadata", () => {
    const adapter = sqliteDocumentsAdapter();

    expect(adapter).toMatchObject({
      name: "sqlite-documents",
      packageName: "payload-db-sqlite-documents",
      defaultIDType: "text",
    });
  });

  it("stubs its methods until they are implemented", () => {
    const adapter = sqliteDocumentsAdapter();

    expect(() => adapter.find({ collection: "posts" })).toThrow(
      "not implemented yet",
    );
  });
});
