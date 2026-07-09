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
    expect(() => adapter.upsert(anyArgs)).toThrow("not implemented yet");
    expect(() => adapter.findDistinct(anyArgs)).toThrow("not implemented yet");
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

  describe("updateOne", () => {
    it("updates a document located by id and returns the merged doc", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { title: "Old", status: "draft" },
        }),
      );

      const updated = await adapter.updateOne(
        /** @type {any} */ ({
          collection: "posts",
          id: "fixed-id",
          data: { title: "New" },
        }),
      );

      // `title` overwritten, `status` (absent from data) preserved by the merge,
      // id pinned.
      expect(updated).toEqual({
        id: "fixed-id",
        title: "New",
        status: "draft",
      });
    });

    it("persists the change so a subsequent read sees it", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { title: "Old" },
        }),
      );
      await adapter.updateOne(
        /** @type {any} */ ({
          collection: "posts",
          id: "fixed-id",
          data: { title: "New" },
        }),
      );

      const found = await adapter.findOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "fixed-id" } },
        }),
      );
      expect(found).toEqual({ id: "fixed-id", title: "New" });
    });

    it("locates the target by a where query", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "Findable", status: "draft" },
        }),
      );

      const updated = /** @type {any} */ (
        await adapter.updateOne(
          /** @type {any} */ ({
            collection: "posts",
            where: { title: { equals: "Findable" } },
            data: { status: "published" },
          }),
        )
      );

      expect(updated.status).toBe("published");
      expect(updated.title).toBe("Findable");
    });

    it("cannot reassign the id, even if data carries a different one", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "real-id",
          data: { title: "Old" },
        }),
      );

      const updated = /** @type {any} */ (
        await adapter.updateOne(
          /** @type {any} */ ({
            collection: "posts",
            id: "real-id",
            data: { id: "spoofed-id", title: "New" },
          }),
        )
      );

      expect(updated.id).toBe("real-id");
    });

    it("returns null (but still writes) when returning is false", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { title: "Old" },
        }),
      );

      const result = await adapter.updateOne(
        /** @type {any} */ ({
          collection: "posts",
          id: "fixed-id",
          data: { title: "New" },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const found = /** @type {any} */ (
        await adapter.findOne(
          /** @type {any} */ ({
            collection: "posts",
            where: { id: { equals: "fixed-id" } },
          }),
        )
      );
      expect(found.title).toBe("New");
    });

    it("returns null when nothing matches", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.updateOne(
        /** @type {any} */ ({
          collection: "posts",
          id: "missing",
          data: { title: "New" },
        }),
      );

      expect(result).toBeNull();
    });
  });

  describe("query operators (end to end)", () => {
    /**
     * Seed three posts, one of which is missing `status`.
     *
     * @param {ReturnType<ReturnType<typeof sqliteDocumentsAdapter>["init"]>} adapter
     */
    const seed = async (adapter) => {
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "Alpha", views: 10, status: "published" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "Beta", views: 20, status: "draft" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "Gamma", views: 30 },
        }),
      );
    };

    /**
     * Run find and return the matched titles, sorted for a stable assertion.
     *
     * @param {ReturnType<ReturnType<typeof sqliteDocumentsAdapter>["init"]>} adapter
     * @param {import("payload").Where} where
     */
    const titlesMatching = async (adapter, where) => {
      const result = /** @type {any} */ (
        await adapter.find(
          /** @type {any} */ ({ collection: "posts", where, sort: "title" }),
        )
      );
      return result.docs.map((/** @type {any} */ d) => d.title);
    };

    it("greater_than filters numerically", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      expect(
        await titlesMatching(adapter, { views: { greater_than: 15 } }),
      ).toEqual(["Beta", "Gamma"]);
    });

    it("in matches any of the listed values", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      expect(
        await titlesMatching(adapter, {
          status: { in: ["published", "draft"] },
        }),
      ).toEqual(["Alpha", "Beta"]);
    });

    it("not_equals also matches rows missing the field (db-mongodb parity)", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      // Gamma has no `status` at all, yet a NULL-safe `!=` still includes it.
      expect(
        await titlesMatching(adapter, { status: { not_equals: "draft" } }),
      ).toEqual(["Alpha", "Gamma"]);
    });

    it("contains does a case-insensitive substring match", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      expect(
        await titlesMatching(adapter, { title: { contains: "ET" } }),
      ).toEqual(["Beta"]);
    });

    it("exists distinguishes present from missing fields", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      expect(
        await titlesMatching(adapter, { status: { exists: true } }),
      ).toEqual(["Alpha", "Beta"]);
      expect(
        await titlesMatching(adapter, { status: { exists: false } }),
      ).toEqual(["Gamma"]);
    });

    it("composes operators through and/or", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seed(adapter);

      expect(
        await titlesMatching(adapter, {
          and: [
            { views: { greater_than_equal: 20 } },
            { status: { exists: false } },
          ],
        }),
      ).toEqual(["Gamma"]);
    });
  });

  describe("updateMany", () => {
    /**
     * Seed `n` posts with an incrementing `order`, all `status: "old"`.
     *
     * @param {ReturnType<ReturnType<typeof sqliteDocumentsAdapter>["init"]>} adapter
     * @param {number} n
     */
    const seedOld = async (adapter, n) => {
      for (let i = 1; i <= n; i++) {
        await adapter.create(
          /** @type {any} */ ({
            collection: "posts",
            data: { title: `Post ${i}`, order: i, status: "old" },
          }),
        );
      }
    };

    it("updates every matching doc and returns the merged results", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedOld(adapter, 3);

      const updated = /** @type {any} */ (
        await adapter.updateMany(
          /** @type {any} */ ({
            collection: "posts",
            where: { status: { equals: "old" } },
            data: { status: "new" },
          }),
        )
      );

      expect(updated).toHaveLength(3);
      // status overwritten, order (absent from data) preserved by the merge.
      expect(updated.every((/** @type {any} */ d) => d.status === "new")).toBe(
        true,
      );
      expect(
        updated
          .map((/** @type {any} */ d) => d.order)
          .sort((/** @type {number} */ a, /** @type {number} */ b) => a - b),
      ).toEqual([1, 2, 3]);
    });

    it("caps the update at limit, ordered by sort, leaving the rest", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedOld(adapter, 4);

      const updated = /** @type {any} */ (
        await adapter.updateMany(
          /** @type {any} */ ({
            collection: "posts",
            where: { status: { equals: "old" } },
            sort: "order",
            limit: 2,
            data: { status: "new" },
          }),
        )
      );

      expect(updated.map((/** @type {any} */ d) => d.order)).toEqual([1, 2]);

      // The unpicked rows must still be "old".
      const stillOld = /** @type {any} */ (
        await adapter.find(
          /** @type {any} */ ({
            collection: "posts",
            where: { status: { equals: "old" } },
            sort: "order",
          }),
        )
      );
      expect(stillOld.docs.map((/** @type {any} */ d) => d.order)).toEqual([
        3, 4,
      ]);
    });

    it("returns null (but still writes) when returning is false", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedOld(adapter, 2);

      const result = await adapter.updateMany(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "old" } },
          data: { status: "new" },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "new" } },
        }),
      );
      expect(totalDocs).toBe(2);
    });

    it("returns an empty array when nothing matches", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedOld(adapter, 2);

      const result = await adapter.updateMany(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "missing" } },
          data: { status: "new" },
        }),
      );

      expect(result).toEqual([]);
    });
  });

  describe("deleteOne", () => {
    it("deletes the matching doc, returns it, and removes it from the table", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "gone",
          data: { title: "Doomed" },
        }),
      );

      const deleted = await adapter.deleteOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "gone" } },
        }),
      );

      expect(deleted).toEqual({ id: "gone", title: "Doomed" });

      const found = await adapter.findOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "gone" } },
        }),
      );
      expect(found).toBeNull();
    });

    it("deletes only one row even when several match", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "A", status: "draft" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "B", status: "draft" },
        }),
      );

      await adapter.deleteOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "draft" } },
        }),
      );

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(1);
    });

    it("returns null when nothing matches", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.deleteOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "missing" } },
        }),
      );

      expect(result).toBeNull();
    });

    it("returns null (but still deletes) when returning is false", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "gone",
          data: { title: "Doomed" },
        }),
      );

      const result = await adapter.deleteOne(
        /** @type {any} */ ({
          collection: "posts",
          where: { id: { equals: "gone" } },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(0);
    });
  });

  describe("deleteMany", () => {
    it("deletes every matching doc and leaves the rest", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { title: "A", status: "draft" },
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

      const result = await adapter.deleteMany(
        /** @type {any} */ ({
          collection: "posts",
          where: { status: { equals: "draft" } },
        }),
      );
      expect(result).toBeUndefined();

      const remaining = /** @type {any} */ (
        await adapter.find(/** @type {any} */ ({ collection: "posts" }))
      );
      expect(remaining.docs.map((/** @type {any} */ d) => d.title)).toEqual([
        "C",
      ]);
    });

    it("does not throw on a never-written-to collection", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await expect(
        adapter.deleteMany(
          /** @type {any} */ ({
            collection: "untouched",
            where: { status: { equals: "draft" } },
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
