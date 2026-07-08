import { describe, expect, it } from "vitest";
import { sqliteDocumentsAdapter } from "./index";

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

    // The stubs are typed `() => never` until real signatures land, hence the
    // arg-less call.
    expect(() => adapter.find()).toThrow("not implemented yet");
  });
});
