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

  it("stubs its not-yet-implemented data methods", () => {
    const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

    // The stubs ignore their arguments; the casts just satisfy the real method
    // signatures under checkJs until the implementations land.
    const anyArgs = /** @type {any} */ ({});
    expect(() => adapter.find(anyArgs)).toThrow("not implemented yet");
    expect(() => adapter.count(anyArgs)).toThrow("not implemented yet");
  });

  describe("create", () => {
    it("inserts a document and returns it with a generated text id", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const doc = await adapter.create(
        /** @type {any} */ ({ collection: "posts", data: { title: "Hello" } }),
      );

      expect(doc.title).toBe("Hello");
      expect(typeof doc.id).toBe("string");
      expect(doc.id.length).toBeGreaterThan(0);
    });

    it("honours a customID and round-trips the row through SQLite", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { title: "Pinned" },
        }),
      );

      const row = /** @type {{ doc: string }} */ (
        adapter.connection
          .prepare('SELECT doc FROM "posts" WHERE id = ?')
          .get("fixed-id")
      );
      expect(JSON.parse(row.doc)).toEqual({ id: "fixed-id", title: "Pinned" });
    });

    it("returns null when returning is false", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "Quiet" },
          returning: false,
        }),
      );

      expect(result).toBeNull();
    });
  });

  describe("findOne", () => {
    it("reads a created document back through the public API", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { title: "Pinned" },
        }),
      );

      const found = await adapter.findOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "fixed-id" } },
        }),
      );

      expect(found).toEqual({ id: "fixed-id", title: "Pinned" });
    });

    it("matches on a non-id field pulled out of the JSON doc", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({ collection: "posts", data: { title: "Hello" } }),
      );

      const found = /** @type {any} */ (
        await adapter.findOne(
          /** @type {any} */ ({
            collection: "posts",
            where: { title: { equals: "Hello" } },
          }),
        )
      );

      expect(found?.title).toBe("Hello");
    });

    it("returns null when nothing matches", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const found = await adapter.findOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "missing" } },
        }),
      );

      expect(found).toBeNull();
    });

    it("returns null for a collection that has never been written to", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      // Must not throw on the lazily-created (empty) table — just find nothing.
      const found = await adapter.findOne(
        /** @type {any} */ ({ collection: "untouched", where: {} }),
      );

      expect(found).toBeNull();
    });
  });
});
