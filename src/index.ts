import { createDatabaseAdapter, defaultBeginTransaction } from "payload";

import type { BaseDatabaseAdapter, DatabaseAdapterObj, Payload } from "payload";

import { notImplemented } from "./helpers/notImplemented.js";

/**
 * Options accepted by {@link sqliteDocumentsAdapter}.
 *
 * Intentionally sparse for now — this will grow to mirror the surface of
 * `@payloadcms/db-sqlite`'s adapter options (connection/client, `push`,
 * `migrationDir`, etc.) as those features come online.
 */
export interface Args {
  /** Directory Payload reads/writes migration files from. */
  migrationDir?: string;
}

/**
 * The initialised adapter instance. Identical to {@link BaseDatabaseAdapter}
 * for now; adapter-specific state (the SQLite connection handle, prepared
 * statements, etc.) will be added here as methods are implemented.
 */
export type SQLiteDocumentsAdapter = BaseDatabaseAdapter;

/**
 * Create a Payload database adapter that persists data in SQLite using a
 * schemaless / "documents" strategy (in the spirit of `@payloadcms/db-mongodb`)
 * rather than the relational strategy of `@payloadcms/db-sqlite`.
 *
 * Follows Payload's factory convention: this returns a lightweight
 * {@link DatabaseAdapterObj} up front, and Payload later calls its `init` with
 * the live `payload` instance to produce the actual adapter. Transaction and
 * migration methods are supplied by {@link createDatabaseAdapter}; every data
 * method is a {@link notImplemented} stub for now.
 */
export const sqliteDocumentsAdapter = (
  args: Args = {},
): DatabaseAdapterObj<SQLiteDocumentsAdapter> => {
  function init({ payload }: { payload: Payload }): SQLiteDocumentsAdapter {
    // TODO: open the SQLite connection handle here (driver TBD — likely
    // better-sqlite3) once a data method needs it. While everything is a stub
    // there is nothing to connect to.

    return createDatabaseAdapter<SQLiteDocumentsAdapter>({
      name: "sqlite-documents",
      packageName: "payload-db-sqlite-documents",

      // Populated with the live instance by Payload core at init time.
      payload,

      // Document/Mongo-style storage: default IDs are text, matching the
      // `@payloadcms/db-mongodb` adapter this targets as a local-dev stand-in.
      defaultIDType: "text",
      migrationDir: args.migrationDir,

      // Transactions must be supplied (the arg type requires them), but there's
      // nothing to implement yet: use Payload's default begin + no-op
      // commit/rollback so a booted Payload doesn't choke. Migration methods,
      // by contrast, are optional and left to createDatabaseAdapter's defaults.
      beginTransaction: defaultBeginTransaction(),
      commitTransaction: async () => {},
      rollbackTransaction: async () => {},

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
    });
  }

  return {
    defaultIDType: "text",
    init,
  };
};
