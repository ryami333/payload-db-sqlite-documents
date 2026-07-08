import { createDatabaseAdapter, defaultBeginTransaction } from "payload";

import type { BaseDatabaseAdapter, DatabaseAdapterObj, Payload } from "payload";

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
 * method is a stub from `./handlers` for now.
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
