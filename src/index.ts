import type { BaseDatabaseAdapter } from "payload";

/**
 * Placeholder implementation used for every adapter method until it is built
 * out. Throwing keeps the runtime honest — nothing silently no-ops — while the
 * `never` return type lets each stub satisfy its method signature on the
 * {@link BaseDatabaseAdapter} interface.
 */
const notImplemented = (): never => {
  throw new Error("payload-db-sqlite-documents: not implemented yet");
};

/**
 * Create a Payload database adapter that persists data in SQLite using a
 * schemaless / "documents" strategy (in the spirit of `@payloadcms/db-mongodb`)
 * rather than the relational strategy of `@payloadcms/db-sqlite`.
 *
 * Nothing is implemented yet: this returns a boilerplate object shaped like a
 * {@link BaseDatabaseAdapter} so the public API can be pinned down first. Every
 * method is a {@link notImplemented} stub for now.
 */
export const sqliteDocumentsAdapter = () => {
  return {
    name: "sqlite-documents",
    packageName: "payload-db-sqlite-documents",
    // Document/Mongo-style storage: default IDs are text, matching the
    // `@payloadcms/db-mongodb` adapter that this targets as a local-dev stand-in.
    defaultIDType: "text",
    migrationDir: "./migrations",

    // Populated by Payload core when the adapter is initialised.
    // @ts-expect-error not implemented yet
    payload: undefined,

    // Transactions
    beginTransaction: notImplemented,
    commitTransaction: notImplemented,
    rollbackTransaction: notImplemented,

    // Migrations
    createMigration: notImplemented,
    migrate: notImplemented,
    migrateDown: notImplemented,
    migrateFresh: notImplemented,
    migrateRefresh: notImplemented,
    migrateReset: notImplemented,
    migrateStatus: notImplemented,

    // Collections — reads
    count: notImplemented,
    find: notImplemented,
    findDistinct: notImplemented,
    findOne: notImplemented,

    // Collections — writes
    create: notImplemented,
    deleteMany: notImplemented,
    deleteOne: notImplemented,
    updateMany: notImplemented,
    updateOne: notImplemented,
    upsert: notImplemented,

    // Globals
    createGlobal: notImplemented,
    findGlobal: notImplemented,
    updateGlobal: notImplemented,

    // Versions
    countVersions: notImplemented,
    createVersion: notImplemented,
    deleteVersions: notImplemented,
    findVersions: notImplemented,
    queryDrafts: notImplemented,
    updateVersion: notImplemented,

    // Global versions
    countGlobalVersions: notImplemented,
    createGlobalVersion: notImplemented,
    findGlobalVersions: notImplemented,
    updateGlobalVersion: notImplemented,

    // Jobs queue
    updateJobs: notImplemented,
  } satisfies BaseDatabaseAdapter;
};
