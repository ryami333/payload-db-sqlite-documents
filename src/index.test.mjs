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
    expect(() => adapter.updateOne(anyArgs)).toThrow("not implemented yet");
    expect(() => adapter.deleteOne(anyArgs)).toThrow("not implemented yet");
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

  describe("count", () => {
    it("returns 0 for a collection that has never been written to", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      // Must not throw on the lazily-created (empty) table.
      const result = await adapter.count(
        /** @type {any} */ ({ collection: "untouched" }),
      );

      expect(result).toEqual({ totalDocs: 0 });
    });

    it("counts every document when no where is given", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({ collection: "posts", data: { title: "A" } }),
      );
      await adapter.create(
        /** @type {any} */ ({ collection: "posts", data: { title: "B" } }),
      );

      const result = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );

      expect(result).toEqual({ totalDocs: 2 });
    });

    it("counts only the documents matching a where filter", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "A", status: "published" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "B", status: "draft" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "C", status: "published" },
        }),
      );

      const result = await adapter.count(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "published" } },
        }),
      );

      expect(result).toEqual({ totalDocs: 2 });
    });
  });

  describe("find", () => {
    /**
     * Seed a collection with `n` posts titled "Post 1".."Post n" and an
     * incrementing `order` field, so sort/pagination assertions are meaningful.
     *
     * @param {ReturnType<ReturnType<typeof sqliteDocumentsAdapter>["init"]>} adapter
     * @param {number} n
     */
    const seedPosts = async (adapter, n) => {
      for (let i = 1; i <= n; i++) {
        await adapter.create(
          /** @type {any} */ ({
            collection: "posts",
            data: { title: `Post ${i}`, order: i },
          }),
        );
      }
    };

    it("returns an empty, well-formed page for a collection with no docs", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.find(
        /** @type {any} */ ({ collection: "posts" }),
      );

      expect(result).toMatchObject({
        docs: [],
        totalDocs: 0,
        totalPages: 1,
        page: 1,
        limit: 10,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
        pagingCounter: 1,
      });
    });

    it("returns all matching docs and the default limit of 10", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedPosts(adapter, 3);

      const result = await adapter.find(
        /** @type {any} */ ({ collection: "posts" }),
      );

      expect(result.docs).toHaveLength(3);
      expect(result.totalDocs).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("filters by where before counting and returning", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedPosts(adapter, 3);

      const result = /** @type {any} */ (
        await adapter.find(
          /** @type {any} */ ({
            collection: "posts",
            where: { title: { equals: "Post 2" } },
          }),
        )
      );

      expect(result.docs).toHaveLength(1);
      expect(result.totalDocs).toBe(1);
      expect(result.docs[0].title).toBe("Post 2");
    });

    it("orders by a descending sort", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedPosts(adapter, 3);

      const result = /** @type {any} */ (
        await adapter.find(
          /** @type {any} */ ({ collection: "posts", sort: "-order" }),
        )
      );

      expect(result.docs.map((/** @type {any} */ d) => d.order)).toEqual([
        3, 2, 1,
      ]);
    });

    it("paginates with limit/page and reports the right metadata", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedPosts(adapter, 5);

      const result = /** @type {any} */ (
        await adapter.find(
          /** @type {any} */ ({
            collection: "posts",
            limit: 2,
            page: 2,
            sort: "order",
          }),
        )
      );

      expect(result.docs.map((/** @type {any} */ d) => d.order)).toEqual([
        3, 4,
      ]);
      expect(result).toMatchObject({
        totalDocs: 5,
        totalPages: 3,
        page: 2,
        limit: 2,
        hasPrevPage: true,
        hasNextPage: true,
        prevPage: 1,
        nextPage: 3,
        pagingCounter: 3,
      });
    });

    it("returns everything on one page when pagination is disabled", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedPosts(adapter, 5);

      const result = await adapter.find(
        /** @type {any} */ ({
          collection: "posts",
          pagination: false,
          sort: "order",
        }),
      );

      expect(result.docs).toHaveLength(5);
      expect(result).toMatchObject({
        totalDocs: 5,
        totalPages: 1,
        page: 1,
        limit: 5,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });
});
