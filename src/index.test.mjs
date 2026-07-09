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

  describe("upsert", () => {
    it("creates a new doc when nothing matches", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = /** @type {any} */ (
        await adapter.upsert(
          /** @type {any} */ ({
            collection: "posts",
            where: { slug: { equals: "hello" } },
            data: { slug: "hello", title: "Hello" },
          }),
        )
      );

      expect(result.title).toBe("Hello");
      expect(typeof result.id).toBe("string");

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(1);
    });

    it("updates the matching doc instead of creating a second", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          customID: "fixed-id",
          data: { slug: "hello", title: "Old", status: "draft" },
        }),
      );

      const result = /** @type {any} */ (
        await adapter.upsert(
          /** @type {any} */ ({
            collection: "posts",
            where: { slug: { equals: "hello" } },
            data: { title: "New" },
          }),
        )
      );

      // Same row (id preserved), title overwritten, status kept by the merge.
      expect(result).toEqual({
        id: "fixed-id",
        slug: "hello",
        title: "New",
        status: "draft",
      });

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(1);
    });

    it("returns null (but still writes) when returning is false — update path", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { slug: "hello", title: "Old" },
        }),
      );

      const result = await adapter.upsert(
        /** @type {any} */ ({
          collection: "posts",
          where: { slug: { equals: "hello" } },
          data: { title: "New" },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const found = /** @type {any} */ (
        await adapter.findOne(
          /** @type {any} */ ({
            collection: "posts",
            where: { slug: { equals: "hello" } },
          }),
        )
      );
      expect(found.title).toBe("New");
    });

    it("returns null (but still writes) when returning is false — create path", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.upsert(
        /** @type {any} */ ({
          collection: "posts",
          where: { slug: { equals: "hello" } },
          data: { slug: "hello", title: "Hello" },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const { totalDocs } = await adapter.count(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(1);
    });
  });

  describe("findDistinct", () => {
    /**
     * Seed posts with the given statuses (one post each).
     *
     * @param {ReturnType<ReturnType<typeof sqliteDocumentsAdapter>["init"]>} adapter
     * @param {(string | undefined)[]} statuses
     */
    const seedStatuses = async (adapter, statuses) => {
      for (const status of statuses) {
        await adapter.create(
          /** @type {any} */ ({
            collection: "posts",
            data:
              status === undefined ? { title: "x" } : { title: "x", status },
          }),
        );
      }
    };

    it("returns each distinct value once, ordered ascending", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedStatuses(adapter, ["draft", "published", "draft"]);

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({ collection: "posts", field: "status" }),
        )
      );

      expect(result.values).toEqual([
        { status: "draft" },
        { status: "published" },
      ]);
      expect(result.totalDocs).toBe(2);
    });

    it("excludes docs missing the field from values and count", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedStatuses(adapter, ["draft", undefined, "published"]);

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({ collection: "posts", field: "status" }),
        )
      );

      expect(result.values).toEqual([
        { status: "draft" },
        { status: "published" },
      ]);
      expect(result.totalDocs).toBe(2);
    });

    it("honours a descending sort direction", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedStatuses(adapter, ["draft", "published", "archived"]);

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({
            collection: "posts",
            field: "status",
            sort: "-status",
          }),
        )
      );

      expect(result.values.map((/** @type {any} */ v) => v.status)).toEqual([
        "published",
        "draft",
        "archived",
      ]);
    });

    it("respects a where filter", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { status: "draft", locale: "en" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { status: "published", locale: "en" },
        }),
      );
      await adapter.create(
        /** @type {any} */ ({
          collection: "posts",
          data: { status: "secret", locale: "de" },
        }),
      );

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({
            collection: "posts",
            field: "status",
            where: { locale: { equals: "en" } },
          }),
        )
      );

      expect(result.values).toEqual([
        { status: "draft" },
        { status: "published" },
      ]);
      expect(result.totalDocs).toBe(2);
    });

    it("paginates distinct values with limit/page metadata", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await seedStatuses(adapter, ["a", "b", "c", "d", "e"]);

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({
            collection: "posts",
            field: "status",
            limit: 2,
            page: 2,
          }),
        )
      );

      expect(result.values).toEqual([{ status: "c" }, { status: "d" }]);
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

    it("returns an empty, well-formed result for an untouched collection", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = /** @type {any} */ (
        await adapter.findDistinct(
          /** @type {any} */ ({ collection: "untouched", field: "status" }),
        )
      );

      expect(result.values).toEqual([]);
      expect(result).toMatchObject({ totalDocs: 0, totalPages: 1, page: 1 });
    });
  });

  describe("globals", () => {
    it("creates a global with a generated id and reads it back", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const created = /** @type {any} */ (
        await adapter.createGlobal(
          /** @type {any} */ ({
            slug: "settings",
            data: { title: "Site", theme: "dark" },
          }),
        )
      );

      expect(created.title).toBe("Site");
      expect(typeof created.id).toBe("string");

      const found = /** @type {any} */ (
        await adapter.findGlobal(/** @type {any} */ ({ slug: "settings" }))
      );
      expect(found).toEqual(created);
    });

    it("returns null for a global that has never been created", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const found = await adapter.findGlobal(
        /** @type {any} */ ({ slug: "settings" }),
      );

      expect(found).toBeNull();
    });

    it("keeps globals of different slugs separate", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.createGlobal(
        /** @type {any} */ ({ slug: "a", data: { title: "A" } }),
      );
      await adapter.createGlobal(
        /** @type {any} */ ({ slug: "b", data: { title: "B" } }),
      );

      const a = /** @type {any} */ (
        await adapter.findGlobal(/** @type {any} */ ({ slug: "a" }))
      );
      const b = /** @type {any} */ (
        await adapter.findGlobal(/** @type {any} */ ({ slug: "b" }))
      );
      expect([a.title, b.title]).toEqual(["A", "B"]);
    });

    it("updates an existing global, merging and preserving its id", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      const created = /** @type {any} */ (
        await adapter.createGlobal(
          /** @type {any} */ ({
            slug: "settings",
            data: { title: "Old", theme: "dark" },
          }),
        )
      );

      const updated = /** @type {any} */ (
        await adapter.updateGlobal(
          /** @type {any} */ ({ slug: "settings", data: { title: "New" } }),
        )
      );

      // title overwritten, theme kept by the merge, id unchanged.
      expect(updated).toEqual({ id: created.id, title: "New", theme: "dark" });
    });

    it("upserts when updating a global that was never created", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const updated = /** @type {any} */ (
        await adapter.updateGlobal(
          /** @type {any} */ ({ slug: "settings", data: { title: "Fresh" } }),
        )
      );

      expect(updated.title).toBe("Fresh");
      expect(typeof updated.id).toBe("string");

      const found = /** @type {any} */ (
        await adapter.findGlobal(/** @type {any} */ ({ slug: "settings" }))
      );
      expect(found).toEqual(updated);
    });

    it("filters findGlobal by a where clause", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.createGlobal(
        /** @type {any} */ ({
          slug: "settings",
          data: { title: "Site", theme: "dark" },
        }),
      );

      const match = await adapter.findGlobal(
        /** @type {any} */ ({
          slug: "settings",
          where: { theme: { equals: "dark" } },
        }),
      );
      expect(match).not.toBeNull();

      const miss = await adapter.findGlobal(
        /** @type {any} */ ({
          slug: "settings",
          where: { theme: { equals: "light" } },
        }),
      );
      expect(miss).toBeNull();
    });

    it("returns null (but still writes) when returning is false", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const result = await adapter.createGlobal(
        /** @type {any} */ ({
          slug: "settings",
          data: { title: "Quiet" },
          returning: false,
        }),
      );
      expect(result).toBeNull();

      const found = /** @type {any} */ (
        await adapter.findGlobal(/** @type {any} */ ({ slug: "settings" }))
      );
      expect(found.title).toBe("Quiet");
    });
  });

  describe("versions", () => {
    /**
     * Build createVersion args with sensible defaults.
     *
     * @param {Record<string, any>} [overrides]
     */
    const versionArgs = (overrides = {}) => ({
      collectionSlug: "posts",
      parent: "p1",
      autosave: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      versionData: { title: "V1", _status: "draft" },
      ...overrides,
    });

    it("creates a version as latest and reads it back", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const created = /** @type {any} */ (
        await adapter.createVersion(/** @type {any} */ (versionArgs()))
      );

      expect(created.parent).toBe("p1");
      expect(created.latest).toBe(true);
      expect(created.version).toEqual({ title: "V1", _status: "draft" });
      expect(typeof created.id).toBe("string");

      const found = /** @type {any} */ (
        await adapter.findVersions(
          /** @type {any} */ ({
            collection: "posts",
            where: { parent: { equals: "p1" } },
          }),
        )
      );
      expect(found.totalDocs).toBe(1);
      expect(found.docs[0].id).toBe(created.id);
    });

    it("moves the latest flag to the newest version of a parent", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.createVersion(
        /** @type {any} */ (versionArgs({ versionData: { title: "V1" } })),
      );
      const v2 = /** @type {any} */ (
        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({
              versionData: { title: "V2" },
              updatedAt: "2026-01-02T00:00:00.000Z",
            })
          ),
        )
      );

      const latest = /** @type {any} */ (
        await adapter.findVersions(
          /** @type {any} */ ({
            collection: "posts",
            where: { latest: { equals: true } },
          }),
        )
      );
      expect(latest.docs).toHaveLength(1);
      expect(latest.docs[0].id).toBe(v2.id);
      expect(latest.docs[0].version.title).toBe("V2");
    });

    it("scopes findVersions and countVersions to the collection", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.createVersion(/** @type {any} */ (versionArgs()));
      await adapter.createVersion(
        /** @type {any} */ (versionArgs({ parent: "p2" })),
      );
      await adapter.createVersion(
        /** @type {any} */ (
          versionArgs({ collectionSlug: "pages", parent: "p3" })
        ),
      );

      const found = /** @type {any} */ (
        await adapter.findVersions(/** @type {any} */ ({ collection: "posts" }))
      );
      expect(found.totalDocs).toBe(2);

      const { totalDocs } = await adapter.countVersions(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(2);
    });

    it("updates a version by id, merging versionData and pinning id", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      const created = /** @type {any} */ (
        await adapter.createVersion(
          /** @type {any} */ (versionArgs({ versionData: { title: "Old" } })),
        )
      );

      const updated = /** @type {any} */ (
        await adapter.updateVersion(
          /** @type {any} */ ({
            collection: "posts",
            id: created.id,
            versionData: { version: { title: "New" }, latest: false },
          }),
        )
      );

      expect(updated.id).toBe(created.id);
      expect(updated.version).toEqual({ title: "New" });
      expect(updated.latest).toBe(false);
      // parent wasn't in versionData, so the merge preserved it.
      expect(updated.parent).toBe("p1");
    });

    it("deletes versions matching a where clause", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.createVersion(/** @type {any} */ (versionArgs()));
      await adapter.createVersion(
        /** @type {any} */ (versionArgs({ parent: "p2" })),
      );

      const result = await adapter.deleteVersions(
        /** @type {any} */ ({
          collection: "posts",
          where: { parent: { equals: "p1" } },
        }),
      );
      expect(result).toBeUndefined();

      const { totalDocs } = await adapter.countVersions(
        /** @type {any} */ ({ collection: "posts" }),
      );
      expect(totalDocs).toBe(1);
    });

    describe("queryDrafts", () => {
      it("returns the latest version per parent, unwrapped to documents", async () => {
        const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({ parent: "p1", versionData: { title: "P1-old" } })
          ),
        );
        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({
              parent: "p1",
              versionData: { title: "P1-new" },
              updatedAt: "2026-01-02T00:00:00.000Z",
            })
          ),
        );
        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({ parent: "p2", versionData: { title: "P2" } })
          ),
        );

        const result = /** @type {any} */ (
          await adapter.queryDrafts(
            /** @type {any} */ ({ collection: "posts" }),
          )
        );

        expect(result.totalDocs).toBe(2);
        // Each doc is the version snapshot with id set back to the parent.
        expect(
          result.docs.map((/** @type {any} */ d) => [d.id, d.title]).sort(),
        ).toEqual([
          ["p1", "P1-new"],
          ["p2", "P2"],
        ]);
      });

      it("applies a version-prefixed where filter", async () => {
        const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({ parent: "p1", versionData: { title: "Keep" } })
          ),
        );
        await adapter.createVersion(
          /** @type {any} */ (
            versionArgs({ parent: "p2", versionData: { title: "Drop" } })
          ),
        );

        const result = /** @type {any} */ (
          await adapter.queryDrafts(
            /** @type {any} */ ({
              collection: "posts",
              where: { "version.title": { equals: "Keep" } },
            }),
          )
        );

        expect(result.docs.map((/** @type {any} */ d) => d.id)).toEqual(["p1"]);
      });
    });
  });

  describe("global versions", () => {
    /**
     * Build createGlobalVersion args with sensible defaults.
     *
     * @param {Record<string, any>} [overrides]
     */
    const globalVersionArgs = (overrides = {}) => ({
      globalSlug: "settings",
      autosave: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      versionData: { title: "V1" },
      ...overrides,
    });

    it("creates a global version (no parent) as latest and reads it back", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      const created = /** @type {any} */ (
        await adapter.createGlobalVersion(
          /** @type {any} */ (globalVersionArgs()),
        )
      );

      expect(created.latest).toBe(true);
      expect(created.version).toEqual({ title: "V1" });
      expect("parent" in created).toBe(false);
      expect(typeof created.id).toBe("string");

      const found = /** @type {any} */ (
        await adapter.findGlobalVersions(
          /** @type {any} */ ({ global: "settings" }),
        )
      );
      expect(found.totalDocs).toBe(1);
      expect(found.docs[0].id).toBe(created.id);
    });

    it("moves the latest flag to the newest version of the global", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.createGlobalVersion(
        /** @type {any} */ (
          globalVersionArgs({ versionData: { title: "V1" } })
        ),
      );
      const v2 = /** @type {any} */ (
        await adapter.createGlobalVersion(
          /** @type {any} */ (
            globalVersionArgs({
              versionData: { title: "V2" },
              updatedAt: "2026-01-02T00:00:00.000Z",
            })
          ),
        )
      );

      const latest = /** @type {any} */ (
        await adapter.findGlobalVersions(
          /** @type {any} */ ({
            global: "settings",
            where: { latest: { equals: true } },
          }),
        )
      );
      expect(latest.docs).toHaveLength(1);
      expect(latest.docs[0].id).toBe(v2.id);
    });

    it("scopes findGlobalVersions and countGlobalVersions by global slug", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });

      await adapter.createGlobalVersion(
        /** @type {any} */ (globalVersionArgs({ globalSlug: "settings" })),
      );
      await adapter.createGlobalVersion(
        /** @type {any} */ (globalVersionArgs({ globalSlug: "nav" })),
      );

      const found = /** @type {any} */ (
        await adapter.findGlobalVersions(
          /** @type {any} */ ({ global: "settings" }),
        )
      );
      expect(found.totalDocs).toBe(1);

      const { totalDocs } = await adapter.countGlobalVersions(
        /** @type {any} */ ({ global: "settings" }),
      );
      expect(totalDocs).toBe(1);
    });

    it("updates a global version by id, merging and pinning id", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      const created = /** @type {any} */ (
        await adapter.createGlobalVersion(
          /** @type {any} */ (
            globalVersionArgs({ versionData: { title: "Old" } })
          ),
        )
      );

      const updated = /** @type {any} */ (
        await adapter.updateGlobalVersion(
          /** @type {any} */ ({
            global: "settings",
            id: created.id,
            versionData: { version: { title: "New" }, latest: false },
          }),
        )
      );

      expect(updated.id).toBe(created.id);
      expect(updated.version).toEqual({ title: "New" });
      expect(updated.latest).toBe(false);
    });

    it("deleteVersions removes global versions by global slug", async () => {
      const adapter = sqliteDocumentsAdapter().init({ payload: fakePayload });
      await adapter.createGlobalVersion(
        /** @type {any} */ (globalVersionArgs({ globalSlug: "settings" })),
      );
      await adapter.createGlobalVersion(
        /** @type {any} */ (globalVersionArgs({ globalSlug: "nav" })),
      );

      await adapter.deleteVersions(
        /** @type {any} */ ({ globalSlug: "settings", where: {} }),
      );

      const settings = await adapter.countGlobalVersions(
        /** @type {any} */ ({ global: "settings" }),
      );
      const nav = await adapter.countGlobalVersions(
        /** @type {any} */ ({ global: "nav" }),
      );
      expect(settings.totalDocs).toBe(0);
      expect(nav.totalDocs).toBe(1);
    });
  });
});
