import { DatabaseSync } from "node:sqlite";

import { createDatabaseAdapter } from "payload";

import type { BaseDatabaseAdapter, DatabaseAdapterObj, Payload } from "payload";

import { createTransactionManager } from "./helpers/createTransactionManager.js";
import { count } from "./handlers/count.js";
import { countGlobalVersions } from "./handlers/countGlobalVersions.js";
import { countVersions } from "./handlers/countVersions.js";
import { create } from "./handlers/create.js";
import { createGlobal } from "./handlers/createGlobal.js";
import { createGlobalVersion } from "./handlers/createGlobalVersion.js";
import { createVersion } from "./handlers/createVersion.js";
import { deleteMany } from "./handlers/deleteMany.js";
import { deleteOne } from "./handlers/deleteOne.js";
import { deleteVersions } from "./handlers/deleteVersions.js";
import { find } from "./handlers/find.js";
import { findDistinct } from "./handlers/findDistinct.js";
import { findGlobal } from "./handlers/findGlobal.js";
import { findGlobalVersions } from "./handlers/findGlobalVersions.js";
import { findOne } from "./handlers/findOne.js";
import { findVersions } from "./handlers/findVersions.js";
import { queryDrafts } from "./handlers/queryDrafts.js";
import { updateGlobal } from "./handlers/updateGlobal.js";
import { updateGlobalVersion } from "./handlers/updateGlobalVersion.js";
import { updateMany } from "./handlers/updateMany.js";
import { updateOne } from "./handlers/updateOne.js";
import { updateVersion } from "./handlers/updateVersion.js";
import { upsert } from "./handlers/upsert.js";

/**
 * Options accepted by {@link sqliteDocumentsAdapter}.
 *
 * Intentionally sparse for now — this will grow to mirror the surface of
 * `@payloadcms/db-sqlite`'s adapter options (connection/client, `push`,
 * `migrationDir`, etc.) as those features come online.
 */
export interface Args {
  /**
   * Where the SQLite database lives. Passed straight to `node:sqlite`'s
   * `DatabaseSync`: a filesystem path (which — being a single file — can be
   * source-controlled for local dev/preview), or `":memory:"` for an ephemeral
   * database. Defaults to `":memory:"`.
   */
  filename?: string;
  /** Directory Payload reads/writes migration files from. */
  migrationDir?: string;
}

/**
 * The initialised adapter instance: {@link BaseDatabaseAdapter} plus the live
 * SQLite connection handle. Data-method handlers reach it via `this.connection`
 * (Payload invokes them as methods on the adapter, so `this` is bound here).
 */
export type SQLiteDocumentsAdapter = BaseDatabaseAdapter & {
  connection: DatabaseSync;
};

/**
 * Create a Payload database adapter that persists data in SQLite using a
 * schemaless / "documents" strategy (in the spirit of `@payloadcms/db-mongodb`)
 * rather than the relational strategy of `@payloadcms/db-sqlite`.
 *
 * Follows Payload's factory convention: this returns a lightweight
 * {@link DatabaseAdapterObj} up front, and Payload later calls its `init` with
 * the live `payload` instance to produce the actual adapter. Transaction and
 * migration methods are supplied by {@link createDatabaseAdapter}; every data
 * method is a stub from `./handlers` for now.
 */
export const sqliteDocumentsAdapter = (
  args: Args = {},
): DatabaseAdapterObj<SQLiteDocumentsAdapter> => {
  function init({ payload }: { payload: Payload }): SQLiteDocumentsAdapter {
    // Open the SQLite connection via Node's built-in driver (`node:sqlite`,
    // available on the Node versions this package targets). Handlers reach it
    // through `this.connection`; tables are created lazily per collection.
    const connection = new DatabaseSync(args.filename ?? ":memory:");

    // Transactions run on this one connection, so an open BEGIN scopes every
    // handler's writes automatically (see createTransactionManager).
    const { beginTransaction, commitTransaction, rollbackTransaction } =
      createTransactionManager({ connection });

    return createDatabaseAdapter<SQLiteDocumentsAdapter>({
      name: "sqlite-documents",
      packageName: "payload-db-sqlite-documents",

      // Populated with the live instance by Payload core at init time.
      payload,

      // The live SQLite handle, surfaced on the adapter for data methods.
      connection,

      // Document/Mongo-style storage: default IDs are text, matching the
      // `@payloadcms/db-mongodb` adapter this targets as a local-dev stand-in.
      defaultIDType: "text",
      migrationDir: args.migrationDir,

      // Real transactions over the shared connection (BEGIN/COMMIT/ROLLBACK,
      // with SAVEPOINTs for nesting). Migration methods, by contrast, are
      // optional and left to createDatabaseAdapter's defaults.
      beginTransaction,
      commitTransaction,
      rollbackTransaction,

      // Collections — reads
      count,
      find,
      findDistinct,
      findOne,

      // Collections — writes
      create,
      deleteMany,
      deleteOne,
      updateMany,
      updateOne,
      upsert,

      // Globals
      createGlobal,
      findGlobal,
      updateGlobal,

      // Versions
      countVersions,
      createVersion,
      deleteVersions,
      findVersions,
      queryDrafts,
      updateVersion,

      // Global versions
      countGlobalVersions,
      createGlobalVersion,
      findGlobalVersions,
      updateGlobalVersion,
    });
  }

  return {
    defaultIDType: "text",
    init,
  };
};
