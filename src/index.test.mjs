import { describe, expect, it } from "vitest";
import { sqliteDocumentsAdapter } from "./index";

/**
 * A minimal stand-in for the Payload instance. `createDatabaseAdapter` doesn't
 * dereference `payload` at construction time, so an empty object is enough to
 * exercise `init` in isolation without booting Payload.
 *
 * @type {import("payload").Payload}
 */
const fakePayload = /** @type {any} */ ({});

describe("sqliteDocumentsAdapter", () => {
  it("returns a factory result with defaultIDType and an init function", () => {
    const result = sqliteDocumentsAdapter();

    expect(result.defaultIDType).toBe("text");
    expect(typeof result.init).toBe("function");
  });

  it("init() produces an adapter with the expected metadata", () => {
    const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

    expect(adapter).toMatchObject({
      name: "sqlite-documents",
      packageName: "payload-db-sqlite-documents",
      defaultIDType: "text",
    });
    expect(adapter.payload).toBe(fakePayload);
  });

  it("supplies working transaction/migration defaults via createDatabaseAdapter", () => {
    const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

    // createDatabaseAdapter fills these in — they should not throw.
    expect(adapter.migrationDir).toBe("migrations");
    expect(typeof adapter.beginTransaction).toBe("function");
  });

  it("stubs its data methods until they are implemented", () => {
    const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

    // The stubs ignore their arguments; the casts just satisfy the real method
    // signatures under checkJs until the implementations land.
    const anyArgs = /** @type {any} */ ({});
    expect(() => adapter.find(anyArgs)).toThrow("not implemented yet");
    expect(() => adapter.create(anyArgs)).toThrow("not implemented yet");
  });
});
