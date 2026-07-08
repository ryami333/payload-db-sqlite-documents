/**
 * Placeholder used for every data method until it is built out. Throwing keeps
 * the runtime honest — nothing silently no-ops — while the `never` return type
 * lets each stub satisfy its method signature on `BaseDatabaseAdapter`
 * (a `() => never` is assignable to any of the `(args) => Promise<...>` method
 * types).
 */
export const notImplemented = (): never => {
  throw new Error("payload-db-sqlite-documents: not implemented yet");
};
